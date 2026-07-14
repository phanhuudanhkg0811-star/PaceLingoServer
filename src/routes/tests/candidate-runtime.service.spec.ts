import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { EnvConfig } from '../../shared/config/env';
import type { PrismaService } from '../../shared/database/prisma.service';
import type { R2StorageService } from '../media/r2-storage.service';
import { CandidateRuntimeService } from './candidate-runtime.service';

describe('CandidateRuntimeService', () => {
  const prisma = {
    test: { findFirst: jest.fn(), findMany: jest.fn() },
  };
  const storage = {
    objectUrl: jest.fn((key: string) => `https://cdn.example.com/${key}`),
  };
  const config = {
    get: jest.fn(() => 'test-secret-at-least-sixteen-characters'),
  };
  const jwt = new JwtService();
  const service = new CandidateRuntimeService(
    prisma as unknown as PrismaService,
    storage as unknown as R2StorageService,
    jwt,
    config as unknown as ConfigService<EnvConfig, true>,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.test.findFirst.mockResolvedValue(publishedTest());
  });

  it('returns only candidate manifest metadata and a public immutable URL', async () => {
    const manifest = await service.manifest('test-1');

    expect(manifest.candidateUrl).toBe(
      'https://cdn.example.com/tests/test-1/v1/candidate.json',
    );
    expect(manifest.testVersion).toEqual({
      id: 'version-1',
      version: 1,
      schemaVersion: 1,
      candidatePayloadHash: 'candidate-hash',
    });
    expect(JSON.stringify(manifest)).not.toContain('answerKey');
  });

  it('uses server time to restore the expected listening position', async () => {
    const listeningStartedAt = new Date(Date.now() - 12_500).toISOString();
    const token = await jwt.signAsync(
      {
        purpose: 'candidate-runtime',
        sub: 'user-1',
        testId: 'test-1',
        testVersionId: 'version-1',
        listeningStartedAt,
      },
      { secret: 'test-secret-at-least-sixteen-characters', expiresIn: '4h' },
    );
    const resumed = await service.startOrResume('test-1', 'user-1', token);

    expect(resumed.listeningStartedAt).toBe(listeningStartedAt);
    expect(resumed.expectedAudioPositionMs).toBeGreaterThanOrEqual(12_500);
    expect(resumed.expectedAudioPositionMs).toBeLessThan(13_000);
  });

  it('rejects a runtime token owned by another user', async () => {
    const started = await service.startOrResume('test-1', 'user-1');

    await expect(
      service.startOrResume('test-1', 'user-2', started.runtimeToken),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

function publishedTest() {
  return {
    id: 'test-1',
    title: 'Published TOEIC',
    description: null,
    type: 'FULL_TEST',
    totalQuestions: 200,
    durationMinutes: 120,
    currentPublishedVersion: {
      id: 'version-1',
      version: 1,
      status: 'PUBLISHED',
      schemaVersion: 1,
      candidatePayloadStorageKey: 'tests/test-1/v1/candidate.json',
      candidatePayloadHash: 'candidate-hash',
    },
  };
}
