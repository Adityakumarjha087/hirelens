import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class FeedbackDto {
  @ApiProperty() @IsUUID() resumeId: string;
  @ApiPropertyOptional({ description: 'Target job for keyword gap analysis' })
  @IsOptional()
  @IsUUID()
  jobId?: string;
}

export class FeedbackHistoryQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() resumeId?: string;
}
