import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type { EnvConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { EMAIL_QUEUE, type EmailJobData, type EmailTemplate } from './queues';
import { renderEmail } from './templates';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectQueue(EMAIL_QUEUE) private readonly queue: Queue<EmailJobData>,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  /** Persist an EmailLog and enqueue delivery. Never throws: notifications must not break the main flow. */
  async enqueue(to: string, template: EmailTemplate, vars: Record<string, string | number>): Promise<void> {
    try {
      const appUrl = this.config.get('APP_URL', { infer: true });
      const allVars = { appUrl, ...vars };
      const log = await this.prisma.emailLog.create({
        data: { to, template, subject: renderEmail(template, allVars).subject },
      });
      await this.queue.add(
        template,
        { emailLogId: log.id, to, template, vars: allVars },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      );
    } catch (err) {
      this.logger.error({ err: (err as Error).message, to, template }, 'email_enqueue_failed');
    }
  }
}
