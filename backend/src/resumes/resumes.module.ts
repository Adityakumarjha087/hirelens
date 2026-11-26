import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { RESUME_QUEUE } from '../notifications/queues';
import { ResumeProcessor } from './resume.processor';
import { ResumesController } from './resumes.controller';
import { ResumesService } from './resumes.service';

@Module({
  imports: [BullModule.registerQueue({ name: RESUME_QUEUE })],
  controllers: [ResumesController],
  providers: [ResumesService, ResumeProcessor],
  exports: [ResumesService, ResumeProcessor],
})
export class ResumesModule {}
