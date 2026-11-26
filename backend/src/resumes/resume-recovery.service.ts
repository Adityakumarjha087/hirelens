import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ResumeStatus } from '@prisma/client';
import type { Queue } from 'bullmq';
import type { EnvConfig } from '../config/configuration';
import { RESUME_QUEUE, type ResumeJobData } from '../notifications/queues';
import { PrismaService } from '../prisma/prisma.service';

const STUCK_AFTER_MS = 2 * 60_000;
const GIVE_UP_AFTER_MS = 30 * 60_000;

/**
 * Guarantees no resume stays PENDING/PROCESSING forever, e.g. after a worker crash or a Redis
 * flush. BullMQ already re-runs *stalled* jobs; this sweeper covers jobs that were lost entirely.
 */
@Injectable()
export class ResumeRecoveryService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ResumeRecoveryService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvConfig, true>,
    @InjectQueue(RESUME_QUEUE) private readonly queue: Queue<ResumeJobData>,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    this.timer = setInterval(
      () => void this.sweep().catch((e: Error) => this.logger.warn(e.message)),
      60_000,
    );
    this.timer.unref();
    void this.sweep().catch((e: Error) => this.logger.warn(e.message));
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  async sweep(now = Date.now()): Promise<{ requeued: number; failed: number }> {
    const stuck = await this.prisma.resume.findMany({
      where: {
        status: { in: [ResumeStatus.PENDING, ResumeStatus.PROCESSING] },
        updatedAt: { lt: new Date(now - STUCK_AFTER_MS) },
      },
      select: { id: true, createdAt: true, updatedAt: true },
    });
    let requeued = 0;
    let failed = 0;
    for (const r of stuck) {
      if (now - r.createdAt.getTime() > GIVE_UP_AFTER_MS) {
        await this.prisma.resume.update({
          where: { id: r.id },
          data: { status: ResumeStatus.FAILED, error: 'Processing timed out; please retry the upload' },
        });
        failed++;
        continue;
      }
      // Deterministic jobId makes the requeue idempotent if several API replicas sweep at once.
      await this.queue.add(
        'parse',
        { resumeId: r.id },
        {
          jobId: `recover-${r.id}-${r.updatedAt.getTime()}`,
          attempts: 2,
          removeOnComplete: 500,
          removeOnFail: 1000,
        },
      );
      await this.prisma.resume.update({ where: { id: r.id }, data: { status: ResumeStatus.PENDING } });
      requeued++;
    }
    if (stuck.length) this.logger.warn({ requeued, failed }, 'resume_recovery_sweep');
    return { requeued, failed };
  }
}
