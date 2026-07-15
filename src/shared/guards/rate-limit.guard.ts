import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { EnvConfig } from '../config/env';

interface RateBucket {
  count: number;
  resetsAt: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, RateBucket>();

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const now = Date.now();
    const windowMs = this.config.get('RATE_LIMIT_WINDOW_MS', { infer: true });
    const authRoute = request.path.startsWith('/auth/');
    const limit = authRoute
      ? this.config.get('AUTH_RATE_LIMIT_MAX', { infer: true })
      : this.config.get('RATE_LIMIT_MAX', { infer: true });
    const forwarded = request.headers['x-forwarded-for'];
    const ip =
      (Array.isArray(forwarded)
        ? forwarded[0]
        : forwarded?.split(',')[0]
      )?.trim() ||
      request.ip ||
      request.socket.remoteAddress ||
      'unknown';
    const key = `${authRoute ? 'auth' : 'api'}:${ip}`;
    const current = this.buckets.get(key);
    const bucket =
      !current || current.resetsAt <= now
        ? { count: 0, resetsAt: now + windowMs }
        : current;
    bucket.count += 1;
    this.buckets.set(key, bucket);

    response.setHeader('RateLimit-Limit', limit);
    response.setHeader(
      'RateLimit-Remaining',
      Math.max(0, limit - bucket.count),
    );
    response.setHeader('RateLimit-Reset', Math.ceil(bucket.resetsAt / 1000));

    if (this.buckets.size > 50_000) {
      for (const [bucketKey, value] of this.buckets) {
        if (value.resetsAt <= now) this.buckets.delete(bucketKey);
      }
    }
    if (bucket.count > limit) {
      throw new HttpException(
        'Too many requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
