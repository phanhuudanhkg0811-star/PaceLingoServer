import { contentHash, normalizeImport } from './import-normalizer';

describe('normalizeImport', () => {
  it('normalizes compact AI output into the test draft contract', () => {
    const result = normalizeImport(
      {
        schemaVersion: 1,
        externalId: 'part-5-a',
        test: {
          title: 'Imported Part 5',
          type: 'PART_PRACTICE',
          durationMinutes: 15,
        },
        sections: [
          {
            part: 5,
            groups: [
              {
                questions: [
                  {
                    number: 101,
                    prompt: 'The room is _____.',
                    correctOption: 'B',
                    options: ['prepare', 'ready', 'readily', 'readiness'],
                  },
                ],
              },
            ],
          },
        ],
      },
      false,
    );

    expect(result.validation.valid).toBe(true);
    expect(result.validation.stats.questions).toBe(1);
    const normalized = result.normalized as {
      content: {
        sections: Array<{
          part: string;
          directionMode: string;
          questionGroups: Array<{
            type: string;
            questions: Array<{
              options: Array<{ label: string; isCorrect: boolean }>;
            }>;
          }>;
        }>;
      };
    };
    const section = normalized.content.sections[0];
    expect(section.part).toBe('PART_5');
    expect(section.directionMode).toBe('DEFAULT');
    expect(section.questionGroups[0].type).toBe('INCOMPLETE_SENTENCE');
    expect(section.questionGroups[0].questions[0].options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'B', isCorrect: true }),
      ]),
    );
  });

  it('reports an invalid question by its JSON path', () => {
    const result = normalizeImport(makeSource({ number: 0 }), false);

    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'INVALID_QUESTION_NUMBER',
          path: 'sections.0.questionGroups.0.questions.0.number',
        }),
      ]),
    );
  });

  it('can skip invalid questions and preserve a warning', () => {
    const result = normalizeImport(makeSource({ promptHtml: '' }), true);

    expect(result.validation.valid).toBe(true);
    expect(result.validation.stats.questions).toBe(0);
    expect(result.validation.stats.skippedQuestions).toBe(1);
    expect(result.validation.warnings[0].code).toBe('SKIPPED_INVALID_QUESTION');
  });

  it('hashes equivalent object key orders identically', () => {
    expect(contentHash({ a: 1, b: { c: 2 } })).toBe(
      contentHash({ b: { c: 2 }, a: 1 }),
    );
  });

  it('wraps independent questions into a section and group', () => {
    const result = normalizeImport(
      {
        schemaVersion: 1,
        title: 'Independent questions',
        type: 'PART_PRACTICE',
        durationMinutes: 10,
        part: 'PART_5',
        questions: [
          {
            number: 101,
            prompt: 'A question',
            options: ['A', 'B', 'C', 'D'],
            correctOption: 'A',
          },
        ],
      },
      false,
    );

    expect(result.validation.valid).toBe(true);
    expect(result.validation.stats).toEqual(
      expect.objectContaining({ sections: 1, groups: 1, questions: 1 }),
    );
  });

  it('preserves common Part 6 passageHtml output as an HTML stimulus', () => {
    const result = normalizeImport(
      {
        schemaVersion: 1,
        test: { title: 'Part 6', type: 'PART_PRACTICE' },
        sections: [
          {
            part: 6,
            groups: [
              {
                passageHtml: '<article><h2>Memo</h2><p>Passage</p></article>',
                questions: [
                  {
                    number: 131,
                    prompt: 'Question',
                    options: ['A', 'B', 'C', 'D'],
                  },
                ],
              },
            ],
          },
        ],
      },
      false,
    );

    const normalized = result.normalized as {
      content: {
        sections: Array<{
          questionGroups: Array<{
            stimuli: Array<{ type: string; contentHtml: string }>;
          }>;
        }>;
      };
    };
    expect(result.validation.valid).toBe(true);
    const stimulus =
      normalized.content.sections[0].questionGroups[0].stimuli[0];
    expect(stimulus.type).toBe('HTML');
    expect(stimulus.contentHtml).toContain('Memo');
  });

  it('preserves multiple Part 7 documents as ordered stimuli', () => {
    const result = normalizeImport(
      {
        schemaVersion: 1,
        test: { title: 'Part 7', type: 'PART_PRACTICE' },
        sections: [
          {
            part: 7,
            groups: [
              {
                type: 'MULTIPLE_PASSAGE',
                documents: ['<p>First document</p>', '<p>Second document</p>'],
                questions: [
                  {
                    number: 176,
                    prompt: 'Question',
                    options: ['A', 'B', 'C', 'D'],
                  },
                ],
              },
            ],
          },
        ],
      },
      false,
    );

    const normalized = result.normalized as {
      content: {
        sections: Array<{
          questionGroups: Array<{
            stimuli: Array<{ contentHtml: string; order: number }>;
          }>;
        }>;
      };
    };
    expect(result.validation.valid).toBe(true);
    expect(normalized.content.sections[0].questionGroups[0].stimuli).toEqual([
      expect.objectContaining({
        contentHtml: '<p>First document</p>',
        order: 0,
      }),
      expect.objectContaining({
        contentHtml: '<p>Second document</p>',
        order: 1,
      }),
    ]);
  });
});

function makeSource(questionOverride: Record<string, unknown>) {
  return {
    schemaVersion: 1,
    test: { title: 'Test', durationMinutes: 30, type: 'PART_PRACTICE' },
    sections: [
      {
        part: 'PART_5',
        questionGroups: [
          {
            questions: [
              {
                number: 101,
                promptHtml: 'Question',
                options: ['A'],
                ...questionOverride,
              },
            ],
          },
        ],
      },
    ],
  };
}
