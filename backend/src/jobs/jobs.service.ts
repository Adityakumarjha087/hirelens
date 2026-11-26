import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { JobStatus, Prisma, Role, type Job } from '@prisma/client';
import { AiClient } from '../ai/ai-client';
import type { JobAnalysis } from '../ai/ai.types';
import type { Paginated } from '../common/dto/pagination.dto';
import type { AuthUser } from '../common/types';
import { jobText, MatchingService } from '../matching/matching.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateJobDto, ListJobsQueryDto, UpdateJobDto } from './dto/job.dto';

export type JobWithStats = Job & { applicantCount: number; avgMatchScore: number | null };

const dedupe = (xs: string[]) => {
  const seen = new Set<string>();
  return xs.map((x) => x.trim()).filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()));
};

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiClient,
    private readonly matching: MatchingService,
  ) {}

  async analyze(title: string, description: string): Promise<JobAnalysis & { source: string }> {
    const res = await this.ai.analyzeJob(title, description);
    return { ...res.analysis, source: res.source };
  }

  async create(user: AuthUser, dto: CreateJobDto): Promise<Job> {
    const analysis = await this.analyze(dto.title, dto.description);
    const recruiter = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const job = await this.prisma.job.create({
      data: {
        recruiterId: user.id,
        title: dto.title,
        description: dto.description,
        company: dto.company ?? recruiter.company ?? 'Confidential',
        location: dto.location,
        remote: dto.remote ?? false,
        employmentType: dto.employmentType,
        salaryMin: dto.salaryMin,
        salaryMax: dto.salaryMax,
        status: dto.status ?? JobStatus.OPEN,
        blindScreening: dto.blindScreening ?? false,
        requiredSkills: dedupe(dto.requiredSkills ?? analysis.required_skills),
        niceToHaveSkills: dedupe(dto.niceToHaveSkills ?? analysis.nice_to_have_skills),
        minYearsExperience: dto.minYearsExperience ?? analysis.min_years_experience,
        seniority: analysis.seniority,
      },
    });
    await this.index(job);
    return job;
  }

  async list(user: AuthUser, query: ListJobsQueryDto): Promise<Paginated<JobWithStats>> {
    const where: Prisma.JobWhereInput = {};
    if (query.mine && user.role !== Role.CANDIDATE) {
      if (user.role === Role.RECRUITER) where.recruiterId = user.id;
      if (query.status) where.status = query.status;
    } else {
      where.status = JobStatus.OPEN;
    }
    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { company: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.skills?.length) where.requiredSkills = { hasSome: query.skills };
    if (query.location) where.location = { contains: query.location, mode: 'insensitive' };
    if (query.remote !== undefined) where.remote = query.remote;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.job.count({ where }),
    ]);
    const stats = await this.prisma.application.groupBy({
      by: ['jobId'],
      where: { jobId: { in: items.map((j) => j.id) } },
      _count: { _all: true },
      _avg: { matchScore: true },
    });
    const byJob = new Map(stats.map((s) => [s.jobId, s]));
    return {
      items: items.map((j) => ({
        ...j,
        applicantCount: byJob.get(j.id)?._count._all ?? 0,
        avgMatchScore: byJob.get(j.id)?._avg.matchScore ?? null,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(user: AuthUser, id: string): Promise<Job & { myApplicationId: string | null }> {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Job not found');
    if (job.status !== JobStatus.OPEN && !this.canManage(user, job))
      throw new NotFoundException('Job not found');
    const mine =
      user.role === Role.CANDIDATE
        ? await this.prisma.application.findUnique({
            where: { jobId_candidateId: { jobId: id, candidateId: user.id } },
            select: { id: true },
          })
        : null;
    return { ...job, myApplicationId: mine?.id ?? null };
  }

  async getManaged(user: AuthUser, id: string): Promise<Job> {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Job not found');
    if (!this.canManage(user, job)) throw new ForbiddenException('You do not manage this job');
    return job;
  }

  async update(user: AuthUser, id: string, dto: UpdateJobDto): Promise<Job> {
    const job = await this.getManaged(user, id);
    const contentChanged =
      (dto.title !== undefined && dto.title !== job.title) ||
      (dto.description !== undefined && dto.description !== job.description);
    let analysis: JobAnalysis | null = null;
    if (contentChanged && (!dto.requiredSkills || !dto.niceToHaveSkills)) {
      analysis = await this.analyze(dto.title ?? job.title, dto.description ?? job.description);
    }
    const updated = await this.prisma.job.update({
      where: { id },
      data: {
        ...dto,
        requiredSkills: dto.requiredSkills ? dedupe(dto.requiredSkills) : analysis?.required_skills,
        niceToHaveSkills: dto.niceToHaveSkills ? dedupe(dto.niceToHaveSkills) : analysis?.nice_to_have_skills,
        minYearsExperience: dto.minYearsExperience ?? analysis?.min_years_experience,
        seniority: analysis?.seniority ?? undefined,
        closedAt: dto.status === JobStatus.CLOSED ? new Date() : dto.status ? null : undefined,
      },
    });
    const requirementsChanged =
      contentChanged ||
      !!dto.requiredSkills ||
      !!dto.niceToHaveSkills ||
      dto.minYearsExperience !== undefined;
    if (requirementsChanged) {
      await this.index(updated);
      await this.matching.rescoreJob(updated.id);
    }
    return updated;
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    await this.getManaged(user, id);
    await this.prisma.job.delete({ where: { id } });
    await this.ai
      .deleteJob(id)
      .catch((err: Error) => this.logger.warn(`vector delete failed: ${err.message}`));
  }

  canManage(user: AuthUser, job: Pick<Job, 'recruiterId'>): boolean {
    return user.role === Role.ADMIN || (user.role === Role.RECRUITER && job.recruiterId === user.id);
  }

  private async index(job: Job): Promise<void> {
    await this.ai.indexJob(job.id, jobText(job), { recruiter_id: job.recruiterId, status: job.status });
  }
}
