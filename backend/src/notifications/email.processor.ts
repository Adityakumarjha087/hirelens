import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { EmailStatus } from '@prisma/client';
import type { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { Mailer } from './mailer.service';
import { EMAIL_QUEUE, type EmailJobData } from './queues';
import { renderEmail } from './templates';

@Processor(EMAIL_QUEUE, { concurrency: 5 })
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    private readonly mailer: Mailer,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<EmailJobData>): Promise<void> {
    const { emailLogId, to, template, vars } = job.data;
    try {
      await this.mailer.send(to, renderEmail(template, vars));
      await this.prisma.emailLog.update({
        where: { id: emailLogId },
        data: { status: EmailStatus.SENT, sentAt: new Date(), error: null },
      });
      this.logger.log({ emailLogId, template, jobId: job.id }, 'email_sent');
    } catch (err) {
      const final = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      await this.prisma.emailLog.update({
        where: { id: emailLogId },
        data: { status: final ? EmailStatus.FAILED : EmailStatus.QUEUED, error: (err as Error).message },
      });
      throw err;
    }
  }
}
