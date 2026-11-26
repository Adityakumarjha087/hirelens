import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { EmailProcessor } from './email.processor';
import { Mailer, SmtpMailer } from './mailer.service';
import { NotificationsService } from './notifications.service';
import { EMAIL_QUEUE } from './queues';

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: EMAIL_QUEUE })],
  providers: [NotificationsService, EmailProcessor, { provide: Mailer, useClass: SmtpMailer }],
  exports: [NotificationsService],
})
export class NotificationsModule {}
