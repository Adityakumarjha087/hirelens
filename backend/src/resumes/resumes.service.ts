import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role, type Resume } from '@prisma/client';
import type { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { AiClient } from '../ai/ai-client';
import type { AuthUser } from '../common/types';
import type { EnvConfig } from '../config/configuration';
import { RESUME_QUEUE, type ResumeJobData } from '../notifications/queues';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorage } from '../storage/storage.service';
import { detectResumeType, safeFileName } from './file-type';

export interface UploadedResumeFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

export type ResumeSummary = Omit<Resume, 'rawText' | 'redactedText'>;

const SUMMARY_SELECT = {
  id: true,
  candidateId: true,
  fileKey: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  status: true,
  error: true,
  parsed: true,
  skills: true,
  yearsExperience: true,
  location: true,
  headline: true,
  isPrimary: true,
  parsedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class ResumesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorage,
    private readonly ai: AiClient,
    private readonly config: ConfigService<EnvConfig, true>,
    @InjectQueue(RESUME_QUEUE) private readonly queue: Queue<ResumeJobData>,
  ) {}

  async upload(user: AuthUser, file: UploadedResumeFile | undefined): Promise<ResumeSummary> {
    if (!file?.buffer?.length) throw new BadRequestException('A resume file is required (field "file")');
    if (file.size > this.config.get('MAX_UPLOAD_BYTES', { infer: true })) {
      throw new PayloadTooLargeException('Resume exceeds the maximum upload size');
    }
    const mimeType = detectResumeType(file.originalname, file.buffer);
    if (!mimeType) throw new BadRequestException('Unsupported file type. Upload a PDF, DOCX or TXT resume.');
    const fileName = safeFileName(file.originalname);
    const fileKey = `resumes/${user.id}/${randomUUID()}-${fileName}`;
    await this.storage.put(fileKey, file.buffer, mimeType);
    const count = await this.prisma.resume.count({ where: { candidateId: user.id } });
    const resume = await this.prisma.resume.create({
      data: {
        candidateId: user.id,
        fileKey,
        fileName,
        mimeType,
        sizeBytes: file.size,
        isPrimary: count === 0,
      },
      select: SUMMARY_SELECT,
    });
    await this.queue.add(
      'parse',
      { resumeId: resume.id },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 500,
        removeOnFail: 1000,
      },
    );
    return resume;
  }

  listMine(userId: string): Promise<ResumeSummary[]> {
    return this.prisma.resume.findMany({
      where: { candidateId: userId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
      select: SUMMARY_SELECT,
    });
  }

  async getOwned(user: AuthUser, id: string): Promise<Resume> {
    const resume = await this.prisma.resume.findUnique({ where: { id } });
    if (!resume) throw new NotFoundException('Resume not found');
    if (resume.candidateId !== user.id && user.role !== Role.ADMIN) throw new ForbiddenException();
    return resume;
  }

  async download(user: AuthUser, id: string): Promise<{ resume: Resume; body: Buffer }> {
    const resume = await this.prisma.resume.findUnique({ where: { id } });
    if (!resume) throw new NotFoundException('Resume not found');
    if (resume.candidateId !== user.id && user.role !== Role.ADMIN) {
      // Recruiters may download only for their own jobs, and only once blind screening no longer applies.
      const app = await this.prisma.application.findFirst({
        where: { resumeId: id, job: { recruiterId: user.id } },
        include: { job: true },
      });
      const blind = app?.job.blindScreening && (app.stage === 'APPLIED' || app.stage === 'SCREENING');
      if (!app || blind) throw new ForbiddenException('Resume not available');
    }
    return { resume, body: await this.storage.get(resume.fileKey) };
  }

  async setPrimary(user: AuthUser, id: string): Promise<ResumeSummary> {
    await this.getOwned(user, id);
    const [, updated] = await this.prisma.$transaction([
      this.prisma.resume.updateMany({ where: { candidateId: user.id }, data: { isPrimary: false } }),
      this.prisma.resume.update({ where: { id }, data: { isPrimary: true }, select: SUMMARY_SELECT }),
    ]);
    return updated;
  }

  async reprocess(user: AuthUser, id: string): Promise<ResumeSummary> {
    await this.getOwned(user, id);
    const resume = await this.prisma.resume.update({
      where: { id },
      data: { status: 'PENDING', error: null },
      select: SUMMARY_SELECT,
    });
    await this.queue.add(
      'parse',
      { resumeId: id },
      { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
    );
    return resume;
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    const resume = await this.getOwned(user, id);
    const inUse = await this.prisma.application.count({ where: { resumeId: id } });
    if (inUse > 0) throw new BadRequestException('Resume is attached to applications and cannot be deleted');
    await this.prisma.resume.delete({ where: { id } });
    await Promise.allSettled([this.storage.delete(resume.fileKey), this.ai.deleteResume(id)]);
  }
}
