import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { EnvConfig } from '../../shared/config/env';
import type { AuthUser } from '../../shared/auth/auth-user';
import { Roles } from '../../shared/decorators/roles.decorator';
import { AuthService } from './auth.service';
import { GoogleConfiguredGuard } from './google-configured.guard';

const REFRESH_COOKIE = 'pace_lingo_refresh';

type AuthenticatedRequest = Request & { user: AuthUser };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  @Get('google')
  @UseGuards(GoogleConfiguredGuard)
  googleLogin() {}

  @Get('google/callback')
  @UseGuards(GoogleConfiguredGuard)
  async googleCallback(
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ) {
    const session = await this.authService.createSession(request.user);
    this.setRefreshCookie(
      response,
      session.refreshToken,
      session.refreshExpiresAt,
    );

    const callbackUrl = new URL(
      '/auth/callback',
      this.config.get('CLIENT_URL', { infer: true }),
    );
    callbackUrl.hash = new URLSearchParams({
      access_token: session.accessToken,
    }).toString();
    return response.redirect(callbackUrl.toString());
  }

  @Post('refresh')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies?.[REFRESH_COOKIE] as
      string | undefined;
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is missing');
    }

    const session = await this.authService.rotateSession(refreshToken);
    this.setRefreshCookie(
      response,
      session.refreshToken,
      session.refreshExpiresAt,
    );
    return { accessToken: session.accessToken, user: session.user };
  }

  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies?.[REFRESH_COOKIE] as
      string | undefined;
    if (refreshToken) {
      await this.authService.revokeSession(refreshToken);
    }
    response.clearCookie(REFRESH_COOKIE, this.cookieOptions());
    return { success: true };
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  getProfile(@Req() request: AuthenticatedRequest) {
    return { user: request.user };
  }

  @Get('admin/check')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Roles('ADMIN')
  adminCheck() {
    return { authorized: true };
  }

  private setRefreshCookie(response: Response, token: string, expires: Date) {
    response.cookie(REFRESH_COOKIE, token, {
      ...this.cookieOptions(),
      expires,
    });
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      sameSite: 'lax' as const,
      path: '/auth',
    };
  }
}
