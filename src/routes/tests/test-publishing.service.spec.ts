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

  it('keeps Part 1 and Part 2 spoken choices private until review', () => {
    const test = makeTestTree();
    const section = test.sections[0];
    section.kind = 'LISTENING';
    section.part = 'PART_2';
    section.questionGroups[0].questions[0].promptHtml =
      'Where is the conference?';
    section.questionGroups[0].questions[0].options = [
      {
        id: 'option-a',
        label: 'A',
        contentHtml: 'At the Riverview Hotel.',
        isCorrect: true,
        order: 0,
      },
      {
        id: 'option-b',
        label: 'B',
        contentHtml: 'A three-day vacation.',
        isCorrect: false,
        order: 1,
      },
      {
        id: 'option-c',
        label: 'C',
        contentHtml: 'In the supply cabinet.',
        isCorrect: false,
        order: 2,
      },
    ];

    const snapshots = buildSnapshots(test, []);
    const serializedCandidate = JSON.stringify(snapshots.candidate);
    const candidateQuestion =
      snapshots.candidate.sections[0].questionGroups[0].questions[0];
    const reviewQuestion = snapshots.review.groups[0].questions[0];

    expect(candidateQuestion.promptHtml).toBe(
      '<p>Choose the best response.</p>',
    );
    expect(
      candidateQuestion.options.map((option) => option.contentHtml),
    ).toEqual(['', '', '']);
    expect(serializedCandidate).not.toContain('Riverview');
    expect(serializedCandidate).not.toContain('three-day vacation');
    expect(reviewQuestion.promptHtml).toBe('Where is the conference?');
    expect(reviewQuestion.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'A',
          contentHtml: 'At the Riverview Hotel.',
        }),
      ]),
    );

    section.part = 'PART_1';
    const partOneSnapshots = buildSnapshots(test, []);
    const partOneQuestion =
      partOneSnapshots.candidate.sections[0].questionGroups[0].questions[0];
    expect(partOneQuestion.promptHtml).toBe('<p>Question</p>');
    expect(
      partOneQuestion.options.every((option) => option.contentHtml === ''),
    ).toBe(true);
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
