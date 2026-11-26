import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApplicationStage } from '@prisma/client';
import { csv } from '../../jobs/dto/job.dto';

export class ApplyDto {
  @ApiPropertyOptional({ description: 'Resume to apply with; defaults to the primary parsed resume' })
  @IsOptional()
  @IsUUID()
  resumeId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) coverLetter?: string;
}

export class ListApplicantsQueryDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  minScore?: number;

  @ApiPropertyOptional({ description: 'Comma-separated skills; candidate must have all' })
  @IsOptional()
  @Transform(csv)
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) location?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minYears?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxYears?: number;
  @ApiPropertyOptional({ enum: ApplicationStage })
  @IsOptional()
  @IsEnum(ApplicationStage)
  stage?: ApplicationStage;
  @ApiPropertyOptional({ enum: ['score', 'recent'] }) @IsOptional() @IsIn(['score', 'recent']) sort?:
    'score' | 'recent';
}

export class UpdateStageDto {
  @ApiProperty({ enum: ApplicationStage }) @IsEnum(ApplicationStage) stage: ApplicationStage;
  @ApiPropertyOptional({ description: 'Position within the Kanban column' })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

export class UpdateNotesDto {
  @ApiProperty() @IsString() @MaxLength(10000) notes: string;
}

export class InterviewQuestionsDto {
  @ApiPropertyOptional({ default: 8 }) @IsOptional() @IsInt() @Min(1) @Max(20) count?: number;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() regenerate?: boolean;
}
