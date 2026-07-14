import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EnvModule } from './shared/config/env.module';
import { AuthModule } from './routes/auth/auth.module';
import { PrismaModule } from './shared/database/prisma.module';
import { HttpExceptionFilter } from './shared/filters/http-exception.filter';
import { TestsModule } from './routes/tests/tests.module';

@Module({
  imports: [EnvModule, PrismaModule, AuthModule, TestsModule],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
