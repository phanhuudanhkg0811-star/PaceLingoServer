import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EnvModule } from './shared/config/env.module';
import { AuthModule } from './routes/auth/auth.module';
import { PrismaModule } from './shared/database/prisma.module';
import { HttpExceptionFilter } from './shared/filters/http-exception.filter';
import { RolesGuard } from './shared/guards/roles.guard';

@Module({
  imports: [EnvModule, PrismaModule, AuthModule],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
