import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import type { Express, NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import type { EnvConfig } from './shared/config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  (app.getHttpAdapter().getInstance() as Express).set('trust proxy', 1);
  app.enableShutdownHooks();
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ limit: '1mb', extended: true }));
  const config = app.get<ConfigService<EnvConfig, true>>(ConfigService);
  const production = config.get('NODE_ENV', { infer: true }) === 'production';
  app.use(cookieParser());
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader(
      'Permissions-Policy',
      'camera=(), geolocation=(), microphone=()',
    );
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    if (production) {
      response.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains',
      );
    }
    next();
  });
  app.enableCors({
    origin: config.get('CLIENT_URL', { infer: true }),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  if (!production || config.get('ENABLE_SWAGGER', { infer: true })) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('PaceLingo API')
      .setDescription('PaceLingo TOEIC practice platform API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(
      'docs',
      app,
      SwaggerModule.createDocument(app, swaggerConfig),
    );
  }

  await app.listen(config.get('PORT', { infer: true }));
}
void bootstrap();
