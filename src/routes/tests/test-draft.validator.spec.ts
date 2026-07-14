import { testContentSchema } from './test-draft.schemas';
import { type DraftTree, validateTestDraft } from './test-draft.validator';

describe('validateTestDraft', () => {
  it('accepts a structurally complete 200-question TOEIC test', () => {
    const draft = makeFullTest();

    const result = validateTestDraft(draft);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.stats.totalQuestions).toBe(200);
    expect(result.stats.questionsByPart).toEqual({
      PART_1: 6,
      PART_2: 25,
      PART_3: 39,
      PART_4: 30,
      PART_5: 30,
      PART_6: 16,
      PART_7: 54,
    });
  });

  it('reports content and answer-key problems without rejecting a draft save', () => {
    const draft = makeFullTest();
    draft.fullListeningAudioId = null;
    draft.sections[0].kind = 'READING';
    draft.sections[0].questionGroups[0].questions[0].options[0].isCorrect = false;

    const result = validateTestDraft(draft);
    const codes = result.errors.map((issue) => issue.code);

    expect(result.valid).toBe(false);
    expect(codes).toEqual(
      expect.arrayContaining([
        'MISSING_FULL_LISTENING_AUDIO',
        'INVALID_SECTION_KIND',
        'INVALID_CORRECT_OPTION',
      ]),
    );
  });

  it('rejects duplicate ordering keys at the request boundary', () => {
    const content = {
      sections: [
        {
          title: 'Part 1',
          part: 'PART_1',
          kind: 'LISTENING',
          order: 1,
          questionGroups: [],
        },
        {
          title: 'Part 2',
          part: 'PART_2',
          kind: 'LISTENING',
          order: 1,
          questionGroups: [],
        },
      ],
    };

    const result = testContentSchema.safeParse(content);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes('section order'),
        ),
      ).toBe(true);
    }
  });
});

function makeFullTest(): DraftTree {
  let nextNumber = 1;
  const sectionDefinitions: Array<
    [
      NonNullable<DraftTree['sections'][number]['part']>,
      DraftTree['sections'][number]['kind'],
      DraftTree['sections'][number]['questionGroups'][number]['type'],
      number,
      number,
    ]
  > = [
    ['PART_1', 'LISTENING', 'PHOTO', 6, 1],
    ['PART_2', 'LISTENING', 'QUESTION_RESPONSE', 25, 1],
    ['PART_3', 'LISTENING', 'CONVERSATION', 13, 3],
    ['PART_4', 'LISTENING', 'TALK', 10, 3],
    ['PART_5', 'READING', 'INCOMPLETE_SENTENCE', 30, 1],
    ['PART_6', 'READING', 'TEXT_COMPLETION', 4, 4],
    ['PART_7', 'READING', 'SINGLE_PASSAGE', 18, 3],
  ];

  const sections = sectionDefinitions.map(
    ([part, kind, groupType, groupCount, questionsPerGroup], sectionIndex) => ({
      ...makeSection(part, kind, groupType, sectionIndex, groupCount),
      questionGroups: Array.from({ length: groupCount }, (_, groupIndex) => ({
        type: groupType,
        transcriptHtml:
          part === 'PART_3' || part === 'PART_4' ? '<p>Transcript</p>' : null,
        stimuli: makeStimuli(part),
        questions: Array.from({ length: questionsPerGroup }, () => {
          const number = nextNumber++;
          const optionCount = part === 'PART_2' ? 3 : 4;
          return {
            number,
            options: Array.from({ length: optionCount }, (_, optionIndex) => ({
              isCorrect: optionIndex === 0,
            })),
          };
        }),
        order: groupIndex,
      })),
    }),
  );

  return {
    type: 'FULL_TEST',
    totalQuestions: 200,
    durationMinutes: 120,
    fullListeningAudioId: 'full-audio',
    sections,
  };
}

function makeSection(
  part: NonNullable<DraftTree['sections'][number]['part']>,
  kind: DraftTree['sections'][number]['kind'],
  groupType: DraftTree['sections'][number]['questionGroups'][number]['type'],
  order: number,
  groupCount: number,
): DraftTree['sections'][number] {
  return {
    part,
    kind,
    questionGroups: Array.from({ length: groupCount }, (_, groupIndex) => ({
      type: groupType,
      transcriptHtml: null,
      stimuli: [],
      questions: [],
      order: groupIndex,
    })),
  };
}

function makeStimuli(
  part: NonNullable<DraftTree['sections'][number]['part']>,
): DraftTree['sections'][number]['questionGroups'][number]['stimuli'] {
  if (part === 'PART_1') {
    return [
      { type: 'IMAGE', mediaAssetId: 'photo', contentHtml: null },
      { type: 'AUDIO', mediaAssetId: 'audio', contentHtml: null },
    ];
  }
  if (['PART_2', 'PART_3', 'PART_4'].includes(part)) {
    return [{ type: 'AUDIO', mediaAssetId: 'audio', contentHtml: null }];
  }
  if (part === 'PART_6' || part === 'PART_7') {
    return [
      { type: 'HTML', mediaAssetId: null, contentHtml: '<p>Passage</p>' },
    ];
  }
  return [];
}
