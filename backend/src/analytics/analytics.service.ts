import { Injectable } from '@nestjs/common';
import { ApplicationStage, JobStatus, Prisma, Role } from '@prisma/client';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 86_400_000;
const STAGES = Object.values(ApplicationStage);

export interface RecruiterAnalytics {
  totals: {
    jobs: number;
    openJobs: number;
    applicants: number;
    avgMatchScore: number | null;
    offers: number;
    avgTimeToHireDays: number | null;
  };
  applicantsPerJob: {
    jobId: string;
    title: string;
    applicants: number;
    avgScore: number | null;
    status: JobStatus;
  }[];
  stageFunnel: { stage: ApplicationStage; count: number }[];
  scoreDistribution: { bucket: string; count: number }[];
  applicationsOverTime: { date: string; count: number }[];
  timeToHireByJob: { jobId: string; title: string; days: number; offers: number }[];
  topSkills: { skill: string; count: number }[];
}

const round1 = (n: number | null | undefined) =>
  n === null || n === undefined ? null : Math.round(n * 10) / 10;

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async recruiter(user: AuthUser, days = 30): Promise<RecruiterAnalytics> {
    const jobWhere: Prisma.JobWhereInput = user.role === Role.ADMIN ? {} : { recruiterId: user.id };
    const jobs = await this.prisma.job.findMany({
      where: jobWhere,
      select: { id: true, title: true, status: true },
      orderBy: { createdAt: 'desc' },
    });
    const jobIds = jobs.map((j) => j.id);
    const appWhere: Prisma.ApplicationWhereInput = { jobId: { in: jobIds } };
    const [perJob, perStage, overall, apps] = await Promise.all([
      this.prisma.application.groupBy({
        by: ['jobId'],
        where: appWhere,
        _count: { _all: true },
        _avg: { matchScore: true },
      }),
      this.prisma.application.groupBy({ by: ['stage'], where: appWhere, _count: { _all: true } }),
      this.prisma.application.aggregate({
        where: appWhere,
        _avg: { matchScore: true },
        _count: { _all: true },
      }),
      this.prisma.application.findMany({
        where: appWhere,
        select: {
          jobId: true,
          matchScore: true,
          createdAt: true,
          offeredAt: true,
          resume: { select: { skills: true } },
        },
      }),
    ]);

    const perJobMap = new Map(perJob.map((p) => [p.jobId, p]));
    const stageMap = new Map(perStage.map((s) => [s.stage, s._count._all]));
    const buckets = [0, 20, 40, 60, 80].map((lo) => ({
      bucket: `${lo}-${lo + 20}`,
      count: apps.filter(
        (a) => a.matchScore >= lo && (a.matchScore < lo + 20 || (lo === 80 && a.matchScore <= 100)),
      ).length,
    }));

    const since = new Date(Date.now() - (days - 1) * DAY_MS);
    since.setUTCHours(0, 0, 0, 0);
    const daily = new Map<string, number>();
    for (let i = 0; i < days; i++)
      daily.set(new Date(since.getTime() + i * DAY_MS).toISOString().slice(0, 10), 0);
    for (const a of apps) {
      const key = a.createdAt.toISOString().slice(0, 10);
      if (daily.has(key)) daily.set(key, (daily.get(key) ?? 0) + 1);
    }

    const offered = apps.filter((a) => a.offeredAt);
    const hireDays = (a: { createdAt: Date; offeredAt: Date | null }) =>
      ((a.offeredAt as Date).getTime() - a.createdAt.getTime()) / DAY_MS;
    const avgTimeToHire = offered.length
      ? offered.reduce((s, a) => s + hireDays(a), 0) / offered.length
      : null;
    const tthByJob = new Map<string, number[]>();
    for (const a of offered) tthByJob.set(a.jobId, [...(tthByJob.get(a.jobId) ?? []), hireDays(a)]);

    const skillCounts = new Map<string, number>();
    for (const a of apps) for (const s of a.resume.skills) skillCounts.set(s, (skillCounts.get(s) ?? 0) + 1);

    return {
      totals: {
        jobs: jobs.length,
        openJobs: jobs.filter((j) => j.status === JobStatus.OPEN).length,
        applicants: overall._count._all,
        avgMatchScore: round1(overall._avg.matchScore),
        offers: offered.length,
        avgTimeToHireDays: round1(avgTimeToHire),
      },
      applicantsPerJob: jobs.map((j) => ({
        jobId: j.id,
        title: j.title,
        status: j.status,
        applicants: perJobMap.get(j.id)?._count._all ?? 0,
        avgScore: round1(perJobMap.get(j.id)?._avg.matchScore),
      })),
      stageFunnel: STAGES.map((stage) => ({ stage, count: stageMap.get(stage) ?? 0 })),
      scoreDistribution: buckets,
      applicationsOverTime: [...daily.entries()].map(([date, count]) => ({ date, count })),
      timeToHireByJob: jobs
        .filter((j) => tthByJob.has(j.id))
        .map((j) => {
          const xs = tthByJob.get(j.id) ?? [];
          return {
            jobId: j.id,
            title: j.title,
            offers: xs.length,
            days: round1(xs.reduce((s, x) => s + x, 0) / xs.length) ?? 0,
          };
        }),
      topSkills: [...skillCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 12)
        .map(([skill, count]) => ({ skill, count })),
    };
  }

  async platform() {
    const [users, jobs, applications, resumes, emails] = await Promise.all([
      this.prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      this.prisma.job.count(),
      this.prisma.application.count(),
      this.prisma.resume.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.emailLog.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    return {
      usersByRole: Object.fromEntries(users.map((u) => [u.role, u._count._all])),
      jobs,
      applications,
      resumesByStatus: Object.fromEntries(resumes.map((r) => [r.status, r._count._all])),
      emailsByStatus: Object.fromEntries(emails.map((e) => [e.status, e._count._all])),
    };
  }
}
