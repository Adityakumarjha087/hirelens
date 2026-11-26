import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser, Roles } from '../common/decorators/auth.decorators';
import type { AuthUser } from '../common/types';
import { ApplicationsService } from './applications.service';
import {
  ApplyDto,
  InterviewQuestionsDto,
  ListApplicantsQueryDto,
  UpdateNotesDto,
  UpdateStageDto,
} from './dto/application.dto';

@ApiTags('applications')
@ApiBearerAuth()
@Controller()
export class ApplicationsController {
  constructor(private readonly apps: ApplicationsService) {}

  @Post('jobs/:jobId/applications')
  @Roles(Role.CANDIDATE)
  @ApiOperation({ summary: 'Apply to a job; computes the AI match score synchronously' })
  apply(@CurrentUser() user: AuthUser, @Param('jobId', ParseUUIDPipe) jobId: string, @Body() dto: ApplyDto) {
    return this.apps.apply(user, jobId, dto);
  }

  @Get('jobs/:jobId/applications')
  @Roles(Role.RECRUITER)
  @ApiOperation({ summary: 'Ranked candidates for a job with filters (blind screening applied)' })
  listForJob(
    @CurrentUser() user: AuthUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Query() query: ListApplicantsQueryDto,
  ) {
    return this.apps.listForJob(user, jobId, query);
  }

  @Post('jobs/:jobId/applications/rescore')
  @HttpCode(200)
  @Roles(Role.RECRUITER)
  rescore(@CurrentUser() user: AuthUser, @Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.apps.rescore(user, jobId);
  }

  @Get('applications/mine')
  @Roles(Role.CANDIDATE)
  mine(@CurrentUser() user: AuthUser) {
    return this.apps.listMine(user);
  }

  @Get('applications/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.apps.get(user, id);
  }

  @Patch('applications/:id/stage')
  @Roles(Role.RECRUITER)
  @ApiOperation({ summary: 'Move an application through the pipeline (Kanban drag & drop)' })
  stage(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStageDto) {
    return this.apps.updateStage(user, id, dto);
  }

  @Patch('applications/:id/notes')
  @Roles(Role.RECRUITER)
  notes(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateNotesDto) {
    return this.apps.updateNotes(user, id, dto.notes);
  }

  @Post('applications/:id/interview-questions')
  @HttpCode(200)
  @Roles(Role.RECRUITER)
  @ApiOperation({ summary: 'Generate (or return cached) tailored interview questions' })
  questions(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InterviewQuestionsDto,
  ) {
    return this.apps.interviewQuestions(user, id, dto);
  }
}
