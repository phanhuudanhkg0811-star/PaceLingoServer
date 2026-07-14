import type { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../shared/config/env';
import type { PrismaService } from '../../shared/database/prisma.service';
import type { R2StorageService } from '../media/r2-storage.service';
import { AttemptsService } from './attempts.service';

describe('AttemptsService', () => {
  const transaction = {
    userAnswer: { findUnique: jest.fn(), upsert: jest.fn() },
    questionTiming: { findUnique: jest.fn(), upsert: jest.fn() },
  };
  const prisma = {
    test: { findFirst: jest.fn() },
    attempt: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    question: { findMany: jest.fn(), findFirst: jest.fn() },
    $transaction: jest.fn((callback: (value: typeof transaction) => unknown) =>
      callback(transaction),
    ),
  };
  const storage = { downloadBytes: jest.fn() };
  const config = { get: jest.fn(() => 'test-secret') };
  const service = new AttemptsService(
    prisma as unknown as PrismaService,
    storage as unknown as R2StorageService,
    config as unknown as ConfigService<EnvConfig, true>,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a Reading-only attempt with a server deadline', async () => {
    prisma.test.findFirst.mockResolvedValue({
      id: 'test-1',
      durationMinutes: 30,
      fullListeningAudio: null,
      sections: [{ kind: 'READING', durationMinutes: null }],
      timelineEvents: [],
      currentPublishedVersion: { id: 'version-1', status: 'PUBLISHED' },
    });
    prisma.attempt.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(attemptResponse());
    prisma.attempt.create.mockResolvedValue({ id: 'attempt-1' });

    const result = await service.startOrResume('test-1', 'user-1');

    expect(prisma.attempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentSection: 'READING',
          listeningEndsAt: null,
        }) as unknown,
      }),
    );
    expect(result.expiresAt.getTime() - result.startedAt.getTime()).toBe(
      30 * 60_000,
    );
    expect(result.id).toBe('attempt-1');
  });

  it('ignores an answer batch older than the stored client sequence', async () => {
    prisma.attempt.findFirst.mockResolvedValue({
      id: 'attempt-1',
      testId: 'test-1',
      status: 'IN_PROGRESS',
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.question.findMany.mockResolvedValue([
      { id: 'question-1', options: [{ id: 'option-1' }] },
    ]);
    transaction.userAnswer.findUnique.mockResolvedValue({ clientSequence: 3 });

    await service.saveBatch('attempt-1', 'user-1', {
      answers: [
        {
          questionId: 'question-1',
          optionId: 'option-1',
          isFlagged: false,
          answeredAt: new Date().toISOString(),
          clientSequence: 2,
        },
      ],
      timings: [],
    });

    expect(transaction.userAnswer.upsert).not.toHaveBeenCalled();
  });
});

function attemptResponse() {
  const startedAt = new Date();
  return {
    id: 'attempt-1',
    testId: 'test-1',
    testVersionId: 'version-1',
    status: 'IN_PROGRESS',
    startedAt,
    listeningEndsAt: null,
    readingEndsAt: new Date(startedAt.getTime() + 30 * 60_000),
    expiresAt: new Date(startedAt.getTime() + 30 * 60_000),
    submittedAt: null,
    currentSection: 'READING',
    currentQuestionId: null,
    listeningCorrect: null,
    readingCorrect: null,
    listeningScore: null,
    readingScore: null,
    totalScore: null,
    answers: [],
    timings: [],
  };
}
