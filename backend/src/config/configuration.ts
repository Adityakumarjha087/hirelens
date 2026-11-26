import { plainToInstance, Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MinLength, validateSync } from 'class-validator';

const toBool = ({ value }: { value: unknown }) => value === true || value === 'true' || value === '1';
const toInt = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : Number(value);

export class EnvConfig {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: 'development' | 'test' | 'production' = 'development';

  @Transform(toInt) @IsInt() PORT = 3000;
  @IsString() DATABASE_URL: string;
  @IsString() REDIS_URL = 'redis://localhost:6379';
  @IsString() @IsOptional() QUEUE_PREFIX = 'hirelens';

  @IsString() @MinLength(16) JWT_ACCESS_SECRET: string;
  @IsString() JWT_ACCESS_TTL = '15m';
  @Transform(toInt) @IsInt() REFRESH_TOKEN_TTL_DAYS = 7;
  @Transform(toBool) @IsBoolean() COOKIE_SECURE = false;
  @IsString() CORS_ORIGINS = 'http://localhost:20200,http://localhost:5173';

  @IsString() AI_SERVICE_URL = 'http://localhost:20202';
  @IsString() AI_SERVICE_TOKEN = 'dev-internal-token';
  @Transform(toInt) @IsInt() AI_TIMEOUT_MS = 20000;

  @IsString() @IsOptional() S3_ENDPOINT?: string;
  @IsString() S3_REGION = 'us-east-1';
  @IsString() S3_BUCKET = 'hirelens-resumes';
  @IsString() S3_ACCESS_KEY = 'hirelens';
  @IsString() S3_SECRET_KEY = 'hirelens-secret';
  @Transform(toBool) @IsBoolean() S3_FORCE_PATH_STYLE = true;

  @IsString() SMTP_HOST = 'localhost';
  @Transform(toInt) @IsInt() SMTP_PORT = 20215;
  @IsString() @IsOptional() SMTP_USER?: string;
  @IsString() @IsOptional() SMTP_PASS?: string;
  @IsString() MAIL_FROM = 'HireLens <no-reply@hirelens.local>';
  @IsString() APP_URL = 'http://localhost:20200';

  @Transform(toBool) @IsBoolean() SEED_ON_START = false;
  @Transform(toInt) @IsInt() THROTTLE_LIMIT = 300;
  @Transform(toInt) @IsInt() THROTTLE_TTL_MS = 60000;
  @Transform(toInt) @IsInt() MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
  @IsString() LOG_LEVEL = 'info';
}

/** Parse '900', '45s', '15m', '2h', '7d' into seconds. */
export function durationToSeconds(value: string): number {
  const m = /^(\d+)\s*([smhd]?)$/.exec(value.trim());
  if (!m) throw new Error(`Invalid duration: ${value}`);
  const mult = { '': 1, s: 1, m: 60, h: 3600, d: 86400 }[m[2] as '' | 's' | 'm' | 'h' | 'd'];
  return Number(m[1]) * mult;
}

export function validateEnv(raw: Record<string, unknown>): EnvConfig {
  const config = plainToInstance(EnvConfig, raw, { enableImplicitConversion: false });
  const errors = validateSync(config, { skipMissingProperties: false, whitelist: false });
  if (errors.length > 0) {
    const details = errors.map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`);
    throw new Error(`Invalid environment configuration:\n  ${details.join('\n  ')}`);
  }
  return config;
}
