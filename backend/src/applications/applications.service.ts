import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApplicationStage,
  JobStatus,
  Prisma,
  ResumeStatus,
  Role,
  type Application,
  type Job,
  type Resume,
  type User,
} from '@prisma/client';
import { AiClient } from '../ai/ai-client';
import type { InterviewQuestion, ResumeProfile, ScoreBreakdown } from '../ai/ai.types';
import type { AuthUser } from '../common/types';
import { JobsService } from '../jobs/jobs.service';
import { MatchingService } from '../matching/matching.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { candidateAlias, isBlind, profileFor } from './anonymize';
import type {
  ApplyDto,
  InterviewQuestionsDto,
  ListApplicantsQueryDto,
  UpdateStageDto,
} from './dto/application.dto';

type AppWithRelations = Application & { job: Job; resume: Resume; candidate: User };

export interface ApplicantView {
  id: string;
  jobId: string;
  stage: ApplicationStage;
  position: number;
  matchScore: number;
  scoreBreakdown: ScoreBreakdown | null;
  createdAt: Date;
  updatedAt: Date;
  blind: boolean;
  candidate: { id: string | null; name: string; email: string | null };
  resume: {
    id: string;
    skills: string[];
    yearsExperience: number | null;
    location: string | null;
    headline: string | null;
    profile: ResumeProfile | null;
  };
}

export interface ApplicantDetail extends ApplicantView {
  coverLetter: string | null;
  recruiterNotes: string | null;
  interviewQuestions: InterviewQuestion[] | null;
  resumeText: string | null;
  events: { id: string; fromStage: ApplicationStage | null; toStage: ApplicationStage; createdAt: Date }[];
  job: { id: string; title: string; company: string; blindScreening: boolean };
}

const ACTIVE_INCLUDE = { job: true, resume: true, candidate: true } as const;

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly matching: MatchingService,
    private readonly ai: AiClient,
    private readonly notifications: NotificationsService,
  ) {}

  async apply(user: AuthUser, jobId: string, dto: ApplyDto) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId }, include: { recruiter: true } });
    if (!job || job.status !== JobStatus.OPEN)
      throw new NotFoundException('Job not found or not accepting applications');
    const resume = dto.resumeId
      ? await this.prisma.resume.findUnique({ where: { id: dto.resumeId } })
      : await this.prisma.resume.findFirst({
          where: { candidateId: user.id, status: ResumeStatus.PARSED },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
        });
    if (!resume || resume.candidateId !== user.id)
      throw new BadRequestException('Upload a resume before applying');
    if (resume.status !== ResumeStatus.PARSED) {
      throw new ConflictException('Resume is still being processed; try again in a few seconds');
    }
    const existing = await this.prisma.application.findUnique({
      where: { jobId_candidateId: { jobId, candidateId: user.id } },
    });
    if (existing) throw new ConflictException('You have already applied to this job');

    const scores = await this.matching.score(job, [resume]);
    const result = scores.get(resume.id);
    const application = await this.prisma.application.create({
      data: {
        jobId,
        candidateId: user.id,
        resumeId: resume.id,
        coverLetter: dto.coverLetter,
        matchScore: result?.score ?? 0,
        scoreBreakdown: result ? (result.breakdown as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        events: { create: { toStage: ApplicationStage.APPLIED, actorId: user.id } },
      },
    });
    const score = Math.round(application.matchScore);
    await Promise.all([
      this.notifications.enqueue(user.email, 'application_received', {
        name: user.fullName,
        jobTitle: job.title,
        company: job.company,
        score,
      }),
      this.notifications.enqueue(job.recruiter.email, 'new_applicant', {
        name: job.recruiter.fullName,
        jobTitle: job.title,
        score,
      }),
    ]);
    return application;
  }

  async listMine(user: AuthUser) {
    const apps = await this.prisma.application.findMany({
      where: { candidateId: user.id },
      include: {
        job: { select: { id: true, title: true, company: true, location: true, remote: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return apps.map((a) => ({
      id: a.id,
      stage: a.stage,
      matchScore: a.matchScore,
      scoreBreakdown: a.scoreBreakdown as ScoreBreakdown | null,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      job: a.job,
      resumeId: a.resumeId,
    }));
  }

  async listForJob(user: AuthUser, jobId: string, q: ListApplicantsQueryDto): Promise<ApplicantView[]> {
    const job = await this.jobs.getManaged(user, jobId);
    const where: Prisma.ApplicationWhereInput = { jobId };
    if (q.minScore !== undefined) where.matchScore = { gte: q.minScore };
    if (q.stage) where.stage = q.stage;
    const resumeWhere: Prisma.ResumeWhereInput = {};
    if (q.location) resumeWhere.location = { contains: q.location, mode: 'insensitive' };
    if (q.minYears !== undefined || q.maxYears !== undefined) {
      resumeWhere.yearsExperience = { gte: q.minYears, lte: q.maxYears };
    }
    if (Object.keys(resumeWhere).length) where.resume = resumeWhere;
    const apps = await this.prisma.application.findMany({
      where,
      include: ACTIVE_INCLUDE,
      orderBy: q.sort === 'recent' ? { createdAt: 'desc' } : [{ matchScore: 'desc' }, { createdAt: 'asc' }],
    });
    // Skill filter is case-insensitive "has all", done in memory (Postgres array ops are case-sensitive).
    const wanted = (q.skills ?? []).map((s) => s.toLowerCase());
    return apps
      .filter((a) => wanted.every((w) => a.resume.skills.some((s) => s.toLowerCase() === w)))
      .map((a) => this.toView({ ...a, job }));
  }

  async get(user: AuthUser, id: string): Promise<ApplicantDetail> {
    const app = await this.prisma.application.findUnique({
      where: { id },
      include: { ...ACTIVE_INCLUDE, events: { orderBy: { createdAt: 'asc' } } },
    });
    if (!app) throw new NotFoundException('Application not found');
    const isOwnerCandidate = user.role === Role.CANDIDATE && app.candidateId === user.id;
    if (!isOwnerCandidate && !this.jobs.canManage(user, app.job)) throw new ForbiddenException();
    const view = isOwnerCandidate ? this.toView(app, false) : this.toView(app);
    return {
      ...view,
      coverLetter: app.coverLetter,
      recruiterNotes: isOwnerCandidate ? null : app.recruiterNotes,
      interviewQuestions: isOwnerCandidate ? null : (app.interviewQuestions as InterviewQuestion[] | null),
      resumeText: view.blind ? app.resume.redactedText : app.resume.rawText,
      events: app.events.map((e) => ({
        id: e.id,
        fromStage: e.fromStage,
        toStage: e.toStage,
        createdAt: e.createdAt,
      })),
      job: {
        id: app.job.id,
        title: app.job.title,
        company: app.job.company,
        blindScreening: app.job.blindScreening,
      },
    };
  }

  async updateStage(user: AuthUser, id: string, dto: UpdateStageDto): Promise<ApplicantView> {
    const app = await this.getManagedApp(user, id);
    const changed = app.stage !== dto.stage;
    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.position !== undefined) {
        // Shift cards at/after the target position in the destination column.
        await tx.application.updateMany({
          where: { jobId: app.jobId, stage: dto.stage, position: { gte: dto.position }, id: { not: id } },
          data: { position: { increment: 1 } },
        });
      }
      const result = await tx.application.update({
        where: { id },
        data: {
          stage: dto.stage,
          position: dto.position ?? app.position,
          offeredAt: dto.stage === ApplicationStage.OFFER && !app.offeredAt ? new Date() : undefined,
        },
        include: ACTIVE_INCLUDE,
      });
      if (changed) {
        await tx.applicationEvent.create({
          data: { applicationId: id, fromStage: app.stage, toStage: dto.stage, actorId: user.id },
        });
      }
      return result;
    });
    if (changed) {
      await this.notifications.enqueue(app.candidate.email, 'stage_changed', {
        name: app.candidate.fullName,
        jobTitle: app.job.title,
        stage: dto.stage,
      });
    }
    return this.toView(updated);
  }

  async updateNotes(
    user: AuthUser,
    id: string,
    notes: string,
  ): Promise<{ id: string; recruiterNotes: string }> {
    await this.getManagedApp(user, id);
    await this.prisma.application.update({ where: { id }, data: { recruiterNotes: notes } });
    return { id, recruiterNotes: notes };
  }

  async interviewQuestions(
    user: AuthUser,
    id: string,
    dto: InterviewQuestionsDto,
  ): Promise<InterviewQuestion[]> {
    const app = await this.getManagedApp(user, id);
    const cached = app.interviewQuestions as InterviewQuestion[] | null;
    if (cached?.length && !dto.regenerate) return cached;
    const profile = profileFor(app.resume.parsed, isBlind(app.job, app.stage));
    if (!profile) throw new ConflictException('Resume has not been parsed yet');
    const res = await this.ai.interviewQuestions(
      profile,
      {
        title: app.job.title,
        description: app.job.description,
        required_skills: app.job.requiredSkills,
        nice_to_have_skills: app.job.niceToHaveSkills,
      },
      dto.count ?? 8,
    );
    await this.prisma.application.update({
      where: { id },
      data: { interviewQuestions: res.questions as unknown as Prisma.InputJsonValue },
    });
    return res.questions;
  }

  async rescore(user: AuthUser, jobId: string): Promise<{ rescored: number }> {
    await this.jobs.getManaged(user, jobId);
    return { rescored: await this.matching.rescoreJob(jobId) };
  }

  private async getManagedApp(user: AuthUser, id: string): Promise<AppWithRelations> {
    const app = await this.prisma.application.findUnique({ where: { id }, include: ACTIVE_INCLUDE });
    if (!app) throw new NotFoundException('Application not found');
    if (!this.jobs.canManage(user, app.job)) throw new ForbiddenException('You do not manage this job');
    return app;
  }

  private toView(app: AppWithRelations, applyBlind = true): ApplicantView {
    const blind = applyBlind && isBlind(app.job, app.stage);
    return {
      id: app.id,
      jobId: app.jobId,
      stage: app.stage,
      position: app.position,
      matchScore: app.matchScore,
      scoreBreakdown: app.scoreBreakdown as ScoreBreakdown | null,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
      blind,
      candidate: blind
        ? { id: null, name: candidateAlias(app.id), email: null }
        : { id: app.candidate.id, name: app.candidate.fullName, email: app.candidate.email },
      resume: {
        id: app.resume.id,
        skills: app.resume.skills,
        yearsExperience: app.resume.yearsExperience,
        location: app.resume.location,
        headline: app.resume.headline,
        profile: profileFor(app.resume.parsed, blind),
      },
    };
  }
}
