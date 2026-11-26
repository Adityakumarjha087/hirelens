import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, Roles } from '../common/decorators/auth.decorators';
import type { AuthUser } from '../common/types';
import { FeedbackDto, FeedbackHistoryQueryDto } from './dto/feedback.dto';
import { FeedbackService } from './feedback.service';

@ApiTags('feedback')
@ApiBearerAuth()
@Roles(Role.CANDIDATE)
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'AI resume feedback: ATS score, missing keywords, bullet rewrites' })
  generate(@CurrentUser() user: AuthUser, @Body() dto: FeedbackDto) {
    return this.feedback.generate(user, dto);
  }

  @Get()
  history(@CurrentUser() user: AuthUser, @Query() q: FeedbackHistoryQueryDto) {
    return this.feedback.history(user, q.resumeId);
  }
}
