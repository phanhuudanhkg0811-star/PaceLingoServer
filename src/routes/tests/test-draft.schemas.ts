import { z } from 'zod';

const testTypes = ['FULL_TEST', 'MINI_TEST', 'PART_PRACTICE'] as const;
const sectionKinds = ['LISTENING', 'READING'] as const;
const toeicParts = [
  'PART_1',
  'PART_2',
  'PART_3',
  'PART_4',
  'PART_5',
  'PART_6',
  'PART_7',
] as const;
const directionModes = ['DEFAULT', 'CUSTOM', 'NONE'] as const;
const groupTypes = [
  'PHOTO',
  'QUESTION_RESPONSE',
  'CONVERSATION',
  'TALK',
  'INCOMPLETE_SENTENCE',
  'TEXT_COMPLETION',
  'SINGLE_PASSAGE',
  'MULTIPLE_PASSAGE',
] as const;
const stimulusTypes = ['HTML', 'IMAGE', 'AUDIO'] as const;
const difficulties = ['EASY', 'MEDIUM', 'HARD'] as const;

const optionSchema = z.object({
  label: z.string().trim().min(1).max(8),
  contentHtml: z.string().trim().min(1),
  isCorrect: z.boolean().default(false),
  order: z.number().int().min(0),
});

const questionSchema = z.object({
  externalId: z.string().trim().min(1).max(120).optional(),
  number: z.number().int().positive(),
  promptHtml: z.string().trim().min(1),
  explanationHtml: z.string().trim().optional(),
  grammarTopic: z.string().trim().min(1).max(120).optional(),
  vocabularyTags: z.array(z.string().trim().min(1).max(80)).default([]),
  difficulty: z.enum(difficulties).optional(),
  order: z.number().int().min(0),
  options: z.array(optionSchema).max(4).default([]),
});

const stimulusSchema = z.object({
  type: z.enum(stimulusTypes),
  contentHtml: z.string().trim().optional(),
  mediaAssetId: z.string().trim().min(1).optional(),
  altText: z.string().trim().max(500).optional(),
  order: z.number().int().min(0),
});

const groupSchema = z.object({
  externalId: z.string().trim().min(1).max(120).optional(),
  type: z.enum(groupTypes),
  title: z.string().trim().min(1).max(250).optional(),
  transcriptHtml: z.string().trim().optional(),
  order: z.number().int().min(0),
  stimuli: z.array(stimulusSchema).default([]),
  questions: z.array(questionSchema).default([]),
});

const sectionSchema = z
  .object({
    title: z.string().trim().min(1).max(250),
    kind: z.enum(sectionKinds),
    part: z.enum(toeicParts).optional(),
    order: z.number().int().min(0),
    durationMinutes: z.number().int().positive().optional(),
    directionMode: z.enum(directionModes).default('DEFAULT'),
    directionTemplateId: z.string().trim().min(1).optional(),
    questionGroups: z.array(groupSchema).default([]),
  })
  .superRefine((section, context) => {
    if (section.directionMode === 'CUSTOM' && !section.directionTemplateId) {
      context.addIssue({
        code: 'custom',
        path: ['directionTemplateId'],
        message: 'CUSTOM direction mode requires directionTemplateId',
      });
    }
    if (section.directionMode !== 'CUSTOM' && section.directionTemplateId) {
      context.addIssue({
        code: 'custom',
        path: ['directionTemplateId'],
        message: 'Only CUSTOM direction mode may select a template',
      });
    }
  });

export const testContentSchema = z
  .object({
    sections: z.array(sectionSchema).max(7),
  })
  .superRefine((content, context) => {
    reportDuplicates(
      content.sections,
      (section) => section.order,
      context,
      ['sections'],
      'section order',
    );
    reportDuplicates(
      content.sections.filter((section) => section.part),
      (section) => section.part,
      context,
      ['sections'],
      'TOEIC part',
    );

    const allQuestionNumbers: number[] = [];
    content.sections.forEach((section, sectionIndex) => {
      reportDuplicates(
        section.questionGroups,
        (group) => group.order,
        context,
        ['sections', sectionIndex, 'questionGroups'],
        'group order',
      );
      section.questionGroups.forEach((group, groupIndex) => {
        const groupPath = [
          'sections',
          sectionIndex,
          'questionGroups',
          groupIndex,
        ];
        reportDuplicates(
          group.stimuli,
          (stimulus) => stimulus.order,
          context,
          [...groupPath, 'stimuli'],
          'stimulus order',
        );
        reportDuplicates(
          group.questions,
          (question) => question.order,
          context,
          [...groupPath, 'questions'],
          'question order',
        );
        group.questions.forEach((question, questionIndex) => {
          allQuestionNumbers.push(question.number);
          reportDuplicates(
            question.options,
            (option) => option.label.toUpperCase(),
            context,
            [...groupPath, 'questions', questionIndex, 'options'],
            'option label',
          );
          reportDuplicates(
            question.options,
            (option) => option.order,
            context,
            [...groupPath, 'questions', questionIndex, 'options'],
            'option order',
          );
        });
      });
    });
    reportDuplicates(
      allQuestionNumbers,
      (number) => number,
      context,
      ['sections'],
      'question number',
    );
  });

const testMetadataSchema = z.object({
  title: z.string().trim().min(1).max(250),
  description: z.string().trim().max(5000).optional(),
  type: z.enum(testTypes).default('FULL_TEST'),
  durationMinutes: z.number().int().positive().max(300),
  scoreConversionProfileId: z.string().trim().min(1).optional(),
  fullListeningAudioId: z.string().trim().min(1).optional(),
  listeningIntroAudioId: z.string().trim().min(1).optional(),
});

export const createTestDraftSchema = testMetadataSchema.extend({
  content: testContentSchema.optional(),
});

export const updateTestDraftSchema = testMetadataSchema.partial().extend({
  description: z.union([z.string().trim().max(5000), z.null()]).optional(),
  fullListeningAudioId: z
    .union([z.string().trim().min(1), z.null()])
    .optional(),
  listeningIntroAudioId: z
    .union([z.string().trim().min(1), z.null()])
    .optional(),
});

export type CreateTestDraftInput = z.infer<typeof createTestDraftSchema>;
export type UpdateTestDraftInput = z.infer<typeof updateTestDraftSchema>;
export type TestContentInput = z.infer<typeof testContentSchema>;

function reportDuplicates<T, K>(
  items: T[],
  select: (item: T) => K,
  context: z.RefinementCtx,
  path: PropertyKey[],
  label: string,
) {
  const seen = new Set<K>();
  for (const item of items) {
    const value = select(item);
    if (value === undefined || value === null) continue;
    if (seen.has(value)) {
      context.addIssue({
        code: 'custom',
        path,
        message: `Duplicate ${label}: ${String(value)}`,
      });
    }
    seen.add(value);
  }
}
