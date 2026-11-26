import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser, Roles } from '../common/decorators/auth.decorators';
import type { AuthUser } from '../common/types';
import { AnalyzeJobDto, CreateJobDto, ListJobsQueryDto, UpdateJobDto } from './dto/job.dto';
import { JobsService } from './jobs.service';

@ApiTags('jobs')
@ApiBearerAuth()
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post('analyze')
  @HttpCode(200)
  @Roles(Role.RECRUITER)
  @ApiOperation({ summary: 'Preview AI skill extraction for a job description without saving' })
  analyze(@Body() dto: AnalyzeJobDto) {
    return this.jobs.analyze(dto.title, dto.description);
  }

  @Post()
  @Roles(Role.RECRUITER)
  @ApiOperation({ summary: 'Create a job; required / nice-to-have skills are extracted automatically' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateJobDto) {
    return this.jobs.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListJobsQueryDto) {
    return this.jobs.list(user, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.get(user, id);
  }

  @Patch(':id')
  @Roles(Role.RECRUITER)
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateJobDto) {
    return this.jobs.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(Role.RECRUITER)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.remove(user, id);
  }
}
