import { InjectQueue } from '@nestjs/bullmq';
import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Queue } from 'bullmq';
import type { Response } from 'express';
import { AiClient } from '../ai/ai-client';
import { Public } from '../common/decorators/auth.decorators';
import { EMAIL_QUEUE } from '../notifications/queues';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorage } from '../storage/storage.service';

type Check = { status: 'up' | 'down'; latencyMs: number; detail?: unknown };

async function timed(fn: () => Promise<unknown>): Promise<Check> {
  const start = Date.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    const detail = await Promise.race([
      fn(),
      new Promise((_, rej) => {
        timer = setTimeout(() => rej(new Error('timeout')), 3000);
      }),
    ]);
    return {
      status: 'up',
      latencyMs: Date.now() - start,
      ...(detail && typeof detail === 'object' ? { detail } : {}),
    };
  } catch (err) {
    return { status: 'down', latencyMs: Date.now() - start, detail: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiClient,
    private readonly storage: ObjectStorage,
    @InjectQueue(EMAIL_QUEUE) private readonly queue: Queue,
  ) {}

  @Public()
  @SkipThrottle()
  @Get()
  @ApiOperation({
    summary: 'Liveness + dependency health. 503 only if a critical dependency (db, redis) is down.',
  })
  async health(@Res({ passthrough: true }) res: Response) {
    const [database, redis, ai, storage] = await Promise.all([
      timed(() => this.prisma.$queryRaw`SELECT 1`.then(() => undefined)),
      timed(async () => {
        await this.queue.getJobCounts('waiting');
      }),
      timed(() => this.ai.health()),
      timed(async () => {
        if (!(await this.storage.healthy())) throw new Error('bucket unavailable');
      }),
    ]);
    const critical = database.status === 'up' && redis.status === 'up';
    const degraded = ai.status === 'down' || storage.status === 'down';
    res.status(critical ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: !critical ? 'down' : degraded ? 'degraded' : 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      checks: { database, redis, ai, storage },
    };
  }
}
