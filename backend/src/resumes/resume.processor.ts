import { Processor, WorkerHost } from '@nestjs/bullmq';
import { HttpException, Logger } from '@nestjs/common';
import { Prisma, ResumeStatus } from '@prisma/client';
import type { Job } from 'bullmq';
import { AiClient } from '../ai/ai-client';
import { PrismaService } from '../prisma/prisma.service';
import { RESUME_QUEUE, type ResumeJobData } from '../notifications/queues';
import { ObjectStorage } from '../storage/storage.service';

@Processor(RESUME_QUEUE, { concurrency: 3 })
export class ResumeProcessor extends WorkerHost {
  private readonly logger = new Logger(ResumeProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorage,
    private readonly ai: AiClient,
  ) {
    super();
  }

  async process(job: Job<ResumeJobData>): Promise<void> {
    await this.parse(job.data.resumeId, job.attemptsMade + 1 >= (job.opts.attempts ?? 1));
  }

  /** Parse + index a resume. Exposed for the seed script and tests. */
  async parse(resumeId: string, finalAttempt = true): Promise<void> {
    const resume = await this.prisma.resume.findUnique({ where: { id: resumeId } });
    if (!resume) return;
    await this.prisma.resume.update({ where: { id: resumeId }, data: { status: ResumeStatus.PROCESSING } });
    const started = Date.now();
    try {
      const file = await this.storage.get(resume.fileKey);
      const parsed = await this.ai.parseResume(file, resume.fileName, resume.mimeType);
      const p = parsed.profile;
      await this.ai.indexResume(resume.id, parsed.text, {
        candidate_id: resume.candidateId,
        skills: p.skills,
        years: p.years_of_experience,
      });
      await this.prisma.resume.update({
        where: { id: resumeId },
        data: {
          status: ResumeStatus.PARSED,
          error: null,
          rawText: parsed.text,
          redactedText: parsed.redacted_text,
          parsed: {
            profile: p,
            redactedProfile: parsed.redacted_profile,
            entities: parsed.entities,
            meta: parsed.meta,
          } as unknown as Prisma.InputJsonValue,
          skills: p.skills,
          yearsExperience: p.years_of_experience,
          location: p.location,
          headline: p.experience[0]?.title || p.summary.slice(0, 120) || null,
          parsedAt: new Date(),
        },
      });
      this.logger.log({ resumeId, ms: Date.now() - started, skills: p.skills.length }, 'resume_parsed');
    } catch (err) {
      const message = (err as Error).message;
      // 4xx from the AI service (unreadable/unsupported file) is permanent: fail now, don't retry.
      const permanent = err instanceof HttpException && err.getStatus() < 500;
      finalAttempt = finalAttempt || permanent;
      this.logger.warn({ resumeId, err: message }, 'resume_parse_failed');
      await this.prisma.resume.update({
        where: { id: resumeId },
        data: {
          status: finalAttempt ? ResumeStatus.FAILED : ResumeStatus.PENDING,
          error: message.slice(0, 500),
        },
      });
      if (!finalAttempt) throw err;
    }
  }
}
