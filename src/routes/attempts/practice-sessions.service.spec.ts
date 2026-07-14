import type { PrismaService } from '../../shared/database/prisma.service';
import { PracticeSessionsService } from './practice-sessions.service';

describe('PracticeSessionsService', () => {
  const prisma = {
    practiceSession: { findFirst: jest.fn() },
  };
  const service = new PracticeSessionsService(
    prisma as unknown as PrismaService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('hides correct answers and explanations before retry submission', async () => {
    prisma.practiceSession.findFirst.mockResolvedValue(session('IN_PROGRESS'));

    const result = await service.findOne('practice-1', 'user-1');
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('isCorrect');
    expect(serialized).not.toContain('correctOptionId');
    expect(serialized).not.toContain('Secret explanation');
  });

  it('returns grading and explanations after retry submission', async () => {
    prisma.practiceSession.findFirst.mockResolvedValue(session('COMPLETED'));

    const result = await service.findOne('practice-1', 'user-1');

    expect(result.questions[0]).toMatchObject({
      correctOptionId: 'option-a',
      isCorrect: true,
      explanationHtml: 'Secret explanation',
    });
  });
});

function session(status: 'IN_PROGRESS' | 'COMPLETED') {
  return {
    id: 'practice-1',
    sourceAttemptId: 'attempt-1',
    sourceType: 'WRONG_ANSWERS',
    mode: 'RETRY',
    status,
    durationMinutes: null,
    createdAt: new Date(),
    completedAt: status === 'COMPLETED' ? new Date() : null,
    sourceAttempt: { test: { id: 'test-1', title: 'Test' } },
    questions: [
      {
        order: 0,
        selectedOptionId: 'option-a',
        answeredAt: new Date(),
        question: {
          id: 'question-1',
          number: 101,
          promptHtml: 'Question',
          explanationHtml: 'Secret explanation',
          grammarTopic: null,
          vocabularyTags: [],
          difficulty: null,
          options: [
            {
              id: 'option-a',
              label: 'A',
              contentHtml: 'Answer',
              isCorrect: true,
            },
          ],
          group: {
            id: 'group-1',
            title: null,
            stimuli: [],
            section: { kind: 'READING', part: 'PART_5', title: 'Part 5' },
          },
        },
      },
    ],
  };
}
