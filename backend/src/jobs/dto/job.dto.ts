import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { EmploymentType, JobStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
export const csv = ({ value }: { value: unknown }) =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
    : value;
const bool = ({ value }: { value: unknown }) =>
  value === undefined ? undefined : value === true || value === 'true' || value === '1';

export class AnalyzeJobDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(2) @MaxLength(200) title: string;
  @ApiProperty() @IsString() @MinLength(20) @MaxLength(20000) description: string;
}

export class CreateJobDto extends AnalyzeJobDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(100) company?: string;
  @ApiProperty({ example: 'San Francisco, CA' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  location: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() remote?: boolean;
  @ApiPropertyOptional({ enum: EmploymentType })
  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(10_000_000) salaryMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(10_000_000) salaryMax?: number;
  @ApiPropertyOptional({ enum: JobStatus }) @IsOptional() @IsEnum(JobStatus) status?: JobStatus;
  @ApiPropertyOptional({ description: 'Hide identity signals from recruiters during initial screening' })
  @IsOptional()
  @IsBoolean()
  blindScreening?: boolean;

  @ApiPropertyOptional({ description: 'Override AI-extracted required skills' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  requiredSkills?: string[];

  @ApiPropertyOptional({ description: 'Override AI-extracted nice-to-have skills' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  niceToHaveSkills?: string[];

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(40) minYearsExperience?: number;
}

export class UpdateJobDto extends PartialType(CreateJobDto) {}

export class ListJobsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Full-text search in title/company/description' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: 'Comma-separated skills (any)' })
  @IsOptional()
  @Transform(csv)
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) location?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(bool) @IsBoolean() remote?: boolean;
  @ApiPropertyOptional({ description: 'Recruiters: only my jobs (includes drafts/closed)' })
  @IsOptional()
  @Transform(bool)
  @IsBoolean()
  mine?: boolean;

  @ApiPropertyOptional({ enum: JobStatus }) @IsOptional() @IsEnum(JobStatus) status?: JobStatus;
}
