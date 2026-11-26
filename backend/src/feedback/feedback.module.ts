import { Module } from '@nestjs/common';
import { ResumesModule } from '../resumes/resumes.module';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';

@Module({ imports: [ResumesModule], controllers: [FeedbackController], providers: [FeedbackService] })
export class FeedbackModule {}
