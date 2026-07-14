import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-google-oauth20';
import type { EnvConfig } from '../../shared/config/env';
import { AuthService } from './auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    config: ConfigService<EnvConfig, true>,
    private readonly authService: AuthService,
  ) {
    super({
      clientID:
        config.get('GOOGLE_CLIENT_ID', { infer: true }) ?? 'not-configured',
      clientSecret:
        config.get('GOOGLE_CLIENT_SECRET', { infer: true }) ?? 'not-configured',
      callbackURL: `${config.get('API_URL', { infer: true })}/auth/google/callback`,
      scope: ['openid', 'email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ) {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      throw new UnauthorizedException(
        'Google account does not expose an email address',
      );
    }

    return this.authService.findOrCreateGoogleUser({
      subject: profile.id,
      email,
      name: profile.displayName,
      avatarUrl: profile.photos?.[0]?.value,
    });
  }
}
