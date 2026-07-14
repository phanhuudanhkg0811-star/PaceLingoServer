import {
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import type { EnvConfig } from '../../shared/config/env';

@Injectable()
export class GoogleConfiguredGuard extends AuthGuard('google') {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    super();
  }

  canActivate(context: ExecutionContext) {
    if (!this.config.get('GOOGLE_CLIENT_ID', { infer: true })) {
      throw new ServiceUnavailableException(
        'Google login is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
      );
    }
    return super.canActivate(context);
  }
}
