import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser, Public } from '../common/decorators/auth.decorators';
import type { AuthUser } from '../common/types';
import type { EnvConfig } from '../config/configuration';
import { AuthService, type AuthResult, type PublicUser } from './auth.service';
import { LoginDto, RefreshDto, RegisterDto } from './dto/auth.dto';

export const REFRESH_COOKIE = 'hl_refresh';
const AUTH_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

interface AuthResponse {
  accessToken: string;
  user: PublicUser;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  @ApiOperation({ summary: 'Create a candidate or recruiter account' })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respond(await this.auth.register(dto, req.headers['user-agent']), res);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respond(await this.auth.login(dto, req.headers['user-agent']), res);
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  @ApiOperation({ summary: 'Rotate the refresh token (cookie or body) and get a new access token' })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE] ?? dto.refreshToken;
    return this.respond(await this.auth.refresh(token, req.headers['user-agent']), res);
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE] ?? dto.refreshToken;
    await this.auth.logout(token);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<PublicUser> {
    return this.auth.me(user.id);
  }

  private respond(result: AuthResult, res: Response): AuthResponse {
    res.cookie(REFRESH_COOKIE, result.refreshToken, {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE', { infer: true }),
      sameSite: 'strict',
      path: '/api/auth',
      expires: result.refreshExpiresAt,
    });
    return { accessToken: result.accessToken, user: result.user };
  }
}
