import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, type User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { EnvConfig } from '../config/configuration';
import type { JwtPayload } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import type { LoginDto, RegisterDto } from './dto/auth.dto';

export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  company: string | null;
  createdAt: Date;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: PublicUser;
}

const BCRYPT_ROUNDS = 10;
// A pre-computed hash used to keep login timing constant for unknown emails.
const DUMMY_HASH = '$2b$10$4QQxEb0anXF0eBOIi.XoX.qVD/3KNaT6J5KLX51pwbOQrlBxTdc7.';

export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    role: u.role,
    company: u.company,
    createdAt: u.createdAt,
  };
}

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async register(dto: RegisterDto, userAgent?: string): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('An account with this email already exists');
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        fullName: dto.fullName,
        role: dto.role,
        company: dto.company,
        passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
      },
    });
    this.logger.log({ userId: user.id, role: user.role }, 'user_registered');
    return this.issueTokens(user, randomUUID(), userAgent);
  }

  async login(dto: LoginDto, userAgent?: string): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const ok = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok || !user.isActive) throw new UnauthorizedException('Invalid email or password');
    return this.issueTokens(user, randomUUID(), userAgent);
  }

  /** Rotates the refresh token. Re-use of a revoked token revokes the whole token family. */
  async refresh(token: string | undefined, userAgent?: string): Promise<AuthResult> {
    if (!token) throw new UnauthorizedException('Missing refresh token');
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!record) throw new UnauthorizedException('Invalid refresh token');
    if (record.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: record.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      this.logger.warn({ userId: record.userId, familyId: record.familyId }, 'refresh_token_reuse_detected');
      throw new UnauthorizedException('Refresh token reuse detected; please sign in again');
    }
    if (record.expiresAt < new Date() || !record.user.isActive) {
      throw new UnauthorizedException('Refresh token expired');
    }
    const revoked = await this.prisma.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count === 0) throw new UnauthorizedException('Refresh token already used');
    return this.issueTokens(record.user, record.familyId, userAgent);
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (record) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: record.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return toPublicUser(user);
  }

  private async issueTokens(user: User, familyId: string, userAgent?: string): Promise<AuthResult> {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role, name: user.fullName };
    const accessToken = await this.jwt.signAsync(payload);
    const refreshToken = randomBytes(48).toString('base64url');
    const ttlDays = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
    const refreshExpiresAt = new Date(Date.now() + ttlDays * 24 * 3600 * 1000);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        familyId,
        expiresAt: refreshExpiresAt,
        userAgent: userAgent?.slice(0, 255),
      },
    });
    return { accessToken, refreshToken, refreshExpiresAt, user: toPublicUser(user) };
  }
}
