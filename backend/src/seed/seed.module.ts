import { Module } from '@nestjs/common';
import { ApplicationsModule } from '../applications/applications.module';
import { JobsModule } from '../jobs/jobs.module';
import { ResumesModule } from '../resumes/resumes.module';
import { SeedService } from './seed.service';

@Module({
  imports: [ResumesModule, JobsModule, ApplicationsModule],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
