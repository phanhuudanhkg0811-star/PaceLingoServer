import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EnvModule } from './shared/config/env.module';
import { AuthModule } from './routes/auth/auth.module';
import { PrismaModule } from './shared/database/prisma.module';
import { HttpExceptionFilter } from './shared/filters/http-exception.filter';
import { TestsModule } from './routes/tests/tests.module';
import { MediaModule } from './routes/media/media.module';
import { BigIntSerializationInterceptor } from './shared/interceptors/bigint-serialization.interceptor';
import { DirectionsModule } from './routes/directions/directions.module';
import { ImportsModule } from './routes/imports/imports.module';
import { RateLimitGuard } from './shared/guards/rate-limit.guard';
import { RequestLoggingInterceptor } from './shared/interceptors/request-logging.interceptor';
import { FeedbackModule } from './routes/feedback/feedback.module';

@Module({
  imports: [
    EnvModule,
    PrismaModule,
    AuthModule,
    TestsModule,
    MediaModule,
    DirectionsModule,
    ImportsModule,
    FeedbackModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: BigIntSerializationInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggingInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
})
export class AppModule {}
