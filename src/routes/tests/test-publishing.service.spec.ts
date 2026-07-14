import {
  buildSnapshots,
  decryptSnapshot,
  encryptSnapshot,
} from './test-publishing.service';
import type { TestDraftsService } from './test-drafts.service';

type TestTree = Awaited<ReturnType<TestDraftsService['findTree']>>;

describe('buildSnapshots', () => {
  it('never exposes answers, explanations or transcripts to candidates', () => {
    const snapshots = buildSnapshots(makeTestTree(), []);
    const serialized = JSON.stringify(snapshots.candidate);

    expect(serialized).not.toContain('isCorrect');
    expect(serialized).not.toContain('explanationHtml');
    expect(serialized).not.toContain('transcriptHtml');
    expect(serialized).not.toContain('Correct because');
    expect(snapshots.answerKey.questions).toEqual([
      {
        questionId: 'question-1',
        number: 1,
        kind: 'READING',
        part: 'PART_5',
        correctOptionId: 'option-a',
      },
    ]);
    expect(snapshots.answerKey.scoreConversion).toBeNull();
  });

  it('encrypts private snapshots before public-bucket storage', () => {
    const plainText = '{"correctOptionId":"secret-answer"}';
    const encrypted = encryptSnapshot(plainText, 'a-strong-test-secret');

    expect(encrypted.toString('utf8')).not.toContain('secret-answer');
    expect(decryptSnapshot(encrypted, 'a-strong-test-secret')).toBe(plainText);
  });
});

function makeTestTree() {
  return {
    id: 'test-1',
    title: 'Draft',
    description: null,
    type: 'PART_PRACTICE',
    status: 'DRAFT',
    durationMinutes: 10,
    totalQuestions: 1,
    scoreConversionProfile: null,
    fullListeningAudio: null,
    timelineEvents: [],
    sections: [
      {
        id: 'section-1',
        title: 'Part 5',
        kind: 'READING',
        part: 'PART_5',
        order: 0,
        durationMinutes: null,
        directionMode: 'NONE',
        directionTemplate: null,
        questionGroups: [
          {
            id: 'group-1',
            type: 'INCOMPLETE_SENTENCE',
            title: null,
            transcriptHtml: 'Secret transcript',
            order: 0,
            stimuli: [],
            questions: [
              {
                id: 'question-1',
                number: 1,
                promptHtml: 'Question',
                explanationHtml: 'Correct because...',
                grammarTopic: null,
                vocabularyTags: [],
                difficulty: null,
                order: 0,
                options: [
                  {
                    id: 'option-a',
                    label: 'A',
                    contentHtml: 'Answer',
                    isCorrect: true,
                    order: 0,
                  },
                ],
                audioSegments: [],
              },
            ],
          },
        ],
      },
    ],
  } as unknown as TestTree;
}
