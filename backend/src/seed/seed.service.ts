import { Injectable, Logger } from '@nestjs/common';
import { ApplicationStage, Role, type User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { ApplicationsService } from '../applications/applications.service';
import type { AuthUser } from '../common/types';
import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { ResumeProcessor } from '../resumes/resume.processor';
import { TXT } from '../resumes/file-type';
import { ObjectStorage } from '../storage/storage.service';
import { ADMIN, APPLICATIONS, CANDIDATES, DEMO_PASSWORD, JOBS, RECRUITERS, renderResume } from './seed-data';

const DAY = 86_400_000;
const PATH: ApplicationStage[] = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER'];
const asAuth = (u: User): AuthUser => ({ id: u.id, email: u.email, role: u.role, fullName: u.fullName });

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorage,
    private readonly processor: ResumeProcessor,
    private readonly jobs: JobsService,
    private readonly applications: ApplicationsService,
  ) {}

  async seedIfEmpty(): Promise<boolean> {
    if ((await this.prisma.job.count()) > 0) {
      this.logger.log('Database already has data; skipping seed');
      return false;
    }
    try {
      await this.seed();
      return true;
    } catch (err) {
      this.logger.error({ err: (err as Error).message }, 'seed_failed');
      return false;
    }
  }

  async seed(): Promise<{ users: number; jobs: number; applications: number }> {
    const started = Date.now();
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const mkUser = (email: string, fullName: string, role: Role, company?: string) =>
      this.prisma.user.upsert({
        where: { email },
        update: {},
        create: { email, fullName, role, company, passwordHash },
      });

    await mkUser(ADMIN.email, ADMIN.name, Role.ADMIN);
    const recruiters = await Promise.all(
      RECRUITERS.map((r) => mkUser(r.email, r.name, Role.RECRUITER, r.company)),
    );
    const candidates: User[] = [];
    const resumeIds: string[] = [];
    for (const c of CANDIDATES) {
      const user = await mkUser(c.email, c.name, Role.CANDIDATE);
      candidates.push(user);
      const body = Buffer.from(renderResume(c), 'utf8');
      const fileName = `${c.name.replace(/\s+/g, '_')}_Resume.txt`;
      const fileKey = `resumes/${user.id}/seed-${fileName}`;
      await this.storage.put(fileKey, body, TXT);
      const resume = await this.prisma.resume.create({
        data: {
          candidateId: user.id,
          fileKey,
          fileName,
          mimeType: TXT,
          sizeBytes: body.length,
          isPrimary: true,
        },
      });
      await this.processor.parse(resume.id);
      resumeIds.push(resume.id);
    }

    const jobs = [];
    for (const j of JOBS) {
      const recruiter = recruiters[j.recruiter];
      jobs.push(
        await this.jobs.create(asAuth(recruiter), {
          title: j.title,
          description: j.description,
          company: j.company,
          location: j.location,
          remote: j.remote,
          salaryMin: j.salaryMin,
          salaryMax: j.salaryMax,
          blindScreening: j.blindScreening,
        }),
      );
    }

    let count = 0;
    for (const [ci, ji, finalStage, daysAgo, daysToOffer] of APPLICATIONS) {
      const job = jobs[ji];
      const recruiter = asAuth(recruiters[JOBS[ji].recruiter]);
      const app = await this.applications.apply(asAuth(candidates[ci]), job.id, { resumeId: resumeIds[ci] });
      const target =
        finalStage === 'REJECTED'
          ? ['APPLIED', 'SCREENING', 'REJECTED']
          : PATH.slice(0, PATH.indexOf(finalStage) + 1);
      for (const stage of target.slice(1) as ApplicationStage[]) {
        await this.applications.updateStage(recruiter, app.id, { stage });
      }
      const appliedAt = new Date(Date.now() - daysAgo * DAY);
      await this.prisma.application.update({
        where: { id: app.id },
        data: {
          createdAt: appliedAt,
          offeredAt:
            finalStage === 'OFFER' ? new Date(appliedAt.getTime() + (daysToOffer ?? 10) * DAY) : null,
        },
      });
      await this.prisma.applicationEvent.updateMany({
        where: { applicationId: app.id, fromStage: null },
        data: { createdAt: appliedAt },
      });
      count++;
    }
    this.logger.log({ ms: Date.now() - started, applications: count }, 'seed_complete');
    return { users: 1 + recruiters.length + candidates.length, jobs: jobs.length, applications: count };
  }
}
