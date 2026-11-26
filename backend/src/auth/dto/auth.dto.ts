import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @ApiProperty({ example: 'jane@example.com' })
  @Transform(lower)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ minLength: 8, example: 'Str0ngPassw0rd!' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, { message: 'password must contain at least one letter and one number' })
  password: string;

  @ApiProperty({ example: 'Jane Doe' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName: string;

  @ApiProperty({ enum: ['CANDIDATE', 'RECRUITER'] })
  @IsIn(['CANDIDATE', 'RECRUITER'])
  role: 'CANDIDATE' | 'RECRUITER';

  @ApiPropertyOptional({ example: 'Acme Corp' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  company?: string;
}

export class LoginDto {
  @ApiProperty()
  @Transform(lower)
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}

export class RefreshDto {
  @ApiPropertyOptional({ description: 'Refresh token; browsers send it via the httpOnly cookie instead' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  refreshToken?: string;
}
