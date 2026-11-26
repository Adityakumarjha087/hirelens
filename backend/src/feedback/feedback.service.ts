import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { JobStatus, ResumeStatus } from '@prisma/client';
import { AiClient } from '../ai/ai-client';
import type { ResumeFeedback } from '../ai/ai.types';
import type { AuthUser } from '../common/types';
import { profileFor } from '../applications/anonymize';
import { PrismaService } from '../prisma/prisma.service';
import { ResumesService } from '../resumes/resumes.service';
import type { FeedbackDto } from './dto/feedback.dto';

export interface FeedbackRecord {
  id: string;
  resumeId: string;
  jobId: string | null;
  jobTitle: string | null;
  atsScore: number;
  result: ResumeFeedback;
  source: string;
  createdAt: Date;
}

@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resumes: ResumesService,
    private readonly ai: AiClient,
  ) {}

  async generate(user: AuthUser, dto: FeedbackDto): Promise<FeedbackRecord> {
    const resume = await this.resumes.getOwned(user, dto.resumeId);
    if (resume.status !== ResumeStatus.PARSED || !resume.rawText) {
      throw new ConflictException('Resume has not been parsed yet');
    }
    const job = dto.jobId ? await this.prisma.job.findUnique({ where: { id: dto.jobId } }) : null;
    if (dto.jobId && (!job || job.status !== JobStatus.OPEN)) throw new NotFoundException('Job not found');
    const res = await this.ai.feedback(
      resume.rawText,
      profileFor(resume.parsed, false),
      job
        ? {
            title: job.title,
            description: job.description,
            required_skills: job.requiredSkills,
            nice_to_have_skills: job.niceToHaveSkills,
          }
        : null,
    );
    const saved = await this.prisma.resumeFeedback.create({
      data: {
        resumeId: resume.id,
        jobId: job?.id,
        atsScore: res.feedback.ats_score,
        result: { ...res.feedback, source: res.source },
      },
    });
    return {
      id: saved.id,
      resumeId: resume.id,
      jobId: job?.id ?? null,
      jobTitle: job?.title ?? null,
      atsScore: saved.atsScore,
      result: res.feedback,
      source: res.source,
      createdAt: saved.createdAt,
    };
  }

  async history(user: AuthUser, resumeId?: string): Promise<FeedbackRecord[]> {
    const rows = await this.prisma.resumeFeedback.findMany({
      where: { resume: { candidateId: user.id }, ...(resumeId ? { resumeId } : {}) },
      include: { job: { select: { title: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return rows.map((r) => {
      const result = r.result as unknown as ResumeFeedback & { source?: string };
      return {
        id: r.id,
        resumeId: r.resumeId,
        jobId: r.jobId,
        jobTitle: r.job?.title ?? null,
        atsScore: r.atsScore,
        result,
        source: result.source ?? 'heuristic',
        createdAt: r.createdAt,
      };
    });
  }
}
