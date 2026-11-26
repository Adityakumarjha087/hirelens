import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser, Roles } from '../common/decorators/auth.decorators';
import type { AuthUser } from '../common/types';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('recruiter')
  @Roles(Role.RECRUITER)
  @ApiQuery({ name: 'days', required: false })
  @ApiOperation({ summary: 'Applicants per job, average match score, time-to-hire, funnel' })
  recruiter(
    @CurrentUser() user: AuthUser,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.analytics.recruiter(user, Math.min(Math.max(days, 7), 180));
  }

  @Get('platform')
  @Roles(Role.ADMIN)
  platform() {
    return this.analytics.platform();
  }
}
