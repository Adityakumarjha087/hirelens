import { Injectable } from '@nestjs/common';
import { Prisma, type Job, type Resume } from '@prisma/client';
import { AiClient } from '../ai/ai-client';
import type { MatchResult } from '../ai/ai.types';
import { PrismaService } from '../prisma/prisma.service';

export function jobText(
  job: Pick<Job, 'title' | 'description' | 'requiredSkills' | 'niceToHaveSkills'>,
): string {
  return [
    job.title,
    job.description,
    `Required: ${job.requiredSkills.join(', ')}`,
    `Nice to have: ${job.niceToHaveSkills.join(', ')}`,
  ].join('\n');
}

@Injectable()
export class MatchingService {
  constructor(
    private readonly ai: AiClient,
    private readonly prisma: PrismaService,
  ) {}

  /** Recompute scores for every application of a job (after the job's requirements change). */
  async rescoreJob(jobId: string): Promise<number> {
    const job = await this.prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    const apps = await this.prisma.application.findMany({ where: { jobId }, include: { resume: true } });
    if (apps.length === 0) return 0;
    const scores = await this.score(
      job,
      apps.map((a) => a.resume),
    );
    await this.prisma.$transaction(
      apps.map((a) => {
        const r = scores.get(a.resumeId);
        return this.prisma.application.update({
          where: { id: a.id },
          data: {
            matchScore: r?.score ?? 0,
            scoreBreakdown: r ? (r.breakdown as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          },
        });
      }),
    );
    return apps.length;
  }

  /** Score resumes against a job via the AI service (vector similarity + skills + experience). */
  async score(
    job: Pick<
      Job,
      'id' | 'title' | 'description' | 'requiredSkills' | 'niceToHaveSkills' | 'minYearsExperience'
    >,
    resumes: Pick<Resume, 'id' | 'skills' | 'yearsExperience' | 'rawText'>[],
  ): Promise<Map<string, MatchResult>> {
    const out = new Map<string, MatchResult>();
    for (let i = 0; i < resumes.length; i += 200) {
      const batch = resumes.slice(i, i + 200);
      const results = await this.ai.match({
        job: {
          id: job.id,
          text: jobText(job),
          required_skills: job.requiredSkills,
          nice_to_have_skills: job.niceToHaveSkills,
          min_years_experience: job.minYearsExperience,
        },
        candidates: batch.map((r) => ({
          resume_id: r.id,
          text: r.rawText?.slice(0, 50_000) ?? '',
          skills: r.skills,
          years_of_experience: r.yearsExperience ?? 0,
        })),
      });
      for (const res of results) out.set(res.resume_id, res);
    }
    return out;
  }
}
