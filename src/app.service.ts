import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from './shared/config/env';
import { PrismaService } from './shared/database/prisma.service';
import { R2StorageService } from './routes/media/r2-storage.service';

@Injectable()
export class AppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: R2StorageService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  getHello(): string {
    return 'Welcome to PaceLingo API';
  }

  getHealth(): { status: string; service: string; timestamp: string } {
    return {
      status: 'ok',
      service: 'pace-lingo-server',
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness() {
    let database = false;
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      database = true;
    } catch {
      database = false;
    }

    const fullTest = database
      ? await this.prisma.test.findFirst({
          where: {
            type: 'FULL_TEST',
            status: 'PUBLISHED',
            totalQuestions: 200,
            fullListeningAudioId: { not: null },
            currentPublishedVersionId: { not: null },
          },
          select: {
            id: true,
            sections: { select: { part: true } },
            timelineEvents: {
              where: { type: 'LISTENING_END' },
              select: { id: true },
              take: 1,
            },
            currentPublishedVersion: {
              select: {
                candidatePayloadStorageKey: true,
                answerKeyStorageKey: true,
                reviewPayloadStorageKey: true,
              },
            },
          },
        })
      : null;
    const version = fullTest?.currentPublishedVersion;
    const contentReady = Boolean(
      fullTest &&
      new Set(fullTest.sections.map((section) => section.part).filter(Boolean))
        .size === 7 &&
      fullTest.timelineEvents.length > 0 &&
      version?.candidatePayloadStorageKey &&
      version.answerKeyStorageKey &&
      version.reviewPayloadStorageKey,
    );
    const checks = {
      database,
      objectStorage: this.storage.isConfigured(),
      fullTest: contentReady,
      productionMode:
        this.config.get('NODE_ENV', { infer: true }) === 'production',
    };
    return {
      status:
        checks.database && checks.objectStorage && checks.fullTest
          ? 'ready'
          : 'not_ready',
      service: 'pace-lingo-server',
      checks,
      timestamp: new Date().toISOString(),
    };
  }
}
