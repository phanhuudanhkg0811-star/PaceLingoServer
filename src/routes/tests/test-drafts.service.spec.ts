/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ConflictException } from '@nestjs/common';
import { TestDraftsService } from './test-drafts.service';
import type { PrismaService } from '../../shared/database/prisma.service';
import type { R2StorageService } from '../media/r2-storage.service';
import type { CreateTestDraftInput } from './test-draft.schemas';

describe('TestDraftsService', () => {
  const prisma = {
    test: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    testVersion: { updateMany: jest.fn() },
    testSection: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const storage = { delete: jest.fn() };
  const service = new TestDraftsService(
    prisma as unknown as PrismaService,
    storage as unknown as R2StorageService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (operation: (transaction: typeof prisma) => unknown) =>
        Promise.resolve(operation(prisma)),
    );
  });

  it('creates a normalized test tree and derives its question total', async () => {
    prisma.test.create.mockResolvedValue({ id: 'test-1' });
    const input = makeCreateInput();

    await service.create(input, 'admin-1');

    expect(prisma.test.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalQuestions: 1,
          createdBy: { connect: { id: 'admin-1' } },
          fullListeningAudio: { connect: { id: 'audio-1' } },
          sections: expect.objectContaining({ create: expect.any(Array) }),
        }),
      }),
    );
  });

  it('replaces content atomically only while a test is a draft', async () => {
    prisma.test.findUnique
      .mockResolvedValueOnce({ status: 'DRAFT' })
      .mockResolvedValueOnce({ id: 'test-1', sections: [] });
    prisma.testSection.deleteMany.mockResolvedValue({ count: 1 });
    prisma.test.update.mockResolvedValue({ id: 'test-1' });

    await service.replaceContent('test-1', makeCreateInput().content!);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.testSection.deleteMany).toHaveBeenCalledWith({
      where: { testId: 'test-1' },
    });
    expect(prisma.test.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ totalQuestions: 1 }),
      }),
    );
  });

  it('does not delete a test that already has attempts', async () => {
    prisma.test.findUnique.mockResolvedValue({
      status: 'PUBLISHED',
      _count: { attempts: 1 },
      versions: [],
    });

    await expect(service.remove('test-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.test.delete).not.toHaveBeenCalled();
  });

  it('deletes an unattempted published test and cleans its snapshots', async () => {
    prisma.test.findUnique.mockResolvedValue({
      status: 'PUBLISHED',
      _count: { attempts: 0 },
      versions: [
        {
          candidatePayloadStorageKey: 'tests/test-1/v1/candidate.json',
          answerKeyStorageKey: 'tests/test-1/v1/answer-key.enc',
          reviewPayloadStorageKey: 'tests/test-1/v1/review.enc',
        },
      ],
    });
    prisma.test.delete.mockResolvedValue({ id: 'test-1' });
    storage.delete.mockResolvedValue(undefined);

    await service.remove('test-1');

    expect(prisma.test.delete).toHaveBeenCalledWith({
      where: { id: 'test-1' },
    });
    expect(storage.delete).toHaveBeenCalledTimes(3);
  });

  it('archives a published test and its current versions', async () => {
    prisma.test.findUnique.mockResolvedValue({ status: 'PUBLISHED' });
    prisma.test.update.mockResolvedValue({ id: 'test-1' });
    prisma.testVersion.updateMany.mockResolvedValue({ count: 1 });

    await service.archive('test-1');

    expect(prisma.test.update).toHaveBeenCalledWith({
      where: { id: 'test-1' },
      data: {
        status: 'ARCHIVED',
        currentPublishedVersionId: null,
        publishedAt: null,
      },
    });
    expect(prisma.testVersion.updateMany).toHaveBeenCalledWith({
      where: { testId: 'test-1', status: 'PUBLISHED' },
      data: { status: 'ARCHIVED' },
    });
  });
});

function makeCreateInput(): CreateTestDraftInput {
  return {
    title: 'TOEIC draft',
    type: 'FULL_TEST',
    durationMinutes: 120,
    fullListeningAudioId: 'audio-1',
    content: {
      sections: [
        {
          title: 'Part 5',
          kind: 'READING',
          part: 'PART_5',
          order: 0,
          directionMode: 'DEFAULT',
          questionGroups: [
            {
              type: 'INCOMPLETE_SENTENCE',
              order: 0,
              stimuli: [],
              questions: [
                {
                  number: 101,
                  promptHtml: '<p>Question</p>',
                  vocabularyTags: [],
                  order: 0,
                  options: [
                    {
                      label: 'A',
                      contentHtml: 'Option',
                      isCorrect: true,
                      order: 0,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  };
}
