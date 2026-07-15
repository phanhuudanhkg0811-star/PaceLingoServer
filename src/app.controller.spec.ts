import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './shared/database/prisma.service';
import { R2StorageService } from './routes/media/r2-storage.service';
import { ConfigService } from '@nestjs/config';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: PrismaService,
          useValue: {
            $queryRawUnsafe: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
            test: { findFirst: jest.fn().mockResolvedValue(null) },
          },
        },
        { provide: R2StorageService, useValue: { isConfigured: () => false } },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => (key === 'NODE_ENV' ? 'test' : null),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return a greeting message', () => {
      expect(appController.getHello()).toContain('PaceLingo');
    });
  });

  describe('health', () => {
    it('should return a healthy status payload', () => {
      const health = appController.getHealth();

      expect(health.status).toBe('ok');
      expect(health.service).toBe('pace-lingo-server');
    });
  });
});
