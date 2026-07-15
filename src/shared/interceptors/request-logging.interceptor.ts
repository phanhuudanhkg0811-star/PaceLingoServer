import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { finalize, type Observable } from 'rxjs';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const requestId =
      request.header('x-request-id')?.slice(0, 100) ?? randomUUID();
    const startedAt = performance.now();
    response.setHeader('x-request-id', requestId);

    return next.handle().pipe(
      finalize(() => {
        this.logger.log(
          JSON.stringify({
            requestId,
            method: request.method,
            path: request.originalUrl,
            statusCode: response.statusCode,
            durationMs: Math.round(performance.now() - startedAt),
          }),
        );
      }),
    );
  }
}
