import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { EMAIL_QUEUE } from '../notifications/queues';
import { HealthController } from './health.controller';

@Module({ imports: [BullModule.registerQueue({ name: EMAIL_QUEUE })], controllers: [HealthController] })
export class HealthModule {}
