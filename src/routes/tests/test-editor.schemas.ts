import { z } from 'zod';

const nullableText = (max: number) =>
  z.union([z.string().trim().max(max), z.null()]).optional();

export const updateGroupSchema = z
  .object({
    title: nullableText(250),
    transcriptHtml: nullableText(50_000),
    type: z
      .enum([
        'PHOTO',
        'QUESTION_RESPONSE',
        'CONVERSATION',
        'TALK',
        'INCOMPLETE_SENTENCE',
        'TEXT_COMPLETION',
        'SINGLE_PASSAGE',
        'MULTIPLE_PASSAGE',
      ])
      .optional(),
  })
  .refine((input) => Object.keys(input).length > 0, 'No changes supplied');

const editableOptionSchema = z.object({
  label: z.string().trim().min(1).max(8),
  contentHtml: z.string().trim().min(1).max(20_000),
  isCorrect: z.boolean(),
  order: z.number().int().min(0),
});

export const updateQuestionSchema = z
  .object({
    number: z.number().int().positive(),
    promptHtml: z.string().trim().min(1).max(50_000),
    explanationHtml: nullableText(50_000),
    grammarTopic: nullableText(120),
    vocabularyTags: z.array(z.string().trim().min(1).max(80)).max(30),
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).nullable().optional(),
    options: z.array(editableOptionSchema).min(1).max(4),
  })
  .superRefine((input, context) => {
    const labels = new Set<string>();
    const orders = new Set<number>();
    input.options.forEach((option, index) => {
      if (labels.has(option.label.toUpperCase())) {
        context.addIssue({
          code: 'custom',
          path: ['options', index, 'label'],
          message: `Duplicate option label ${option.label}`,
        });
      }
      if (orders.has(option.order)) {
        context.addIssue({
          code: 'custom',
          path: ['options', index, 'order'],
          message: `Duplicate option order ${option.order}`,
        });
      }
      labels.add(option.label.toUpperCase());
      orders.add(option.order);
    });
  });

export const moveQuestionSchema = z.object({
  targetGroupId: z.string().trim().min(1),
});

export const stimulusSchema = z
  .object({
    type: z.enum(['HTML', 'IMAGE', 'AUDIO']),
    contentHtml: nullableText(100_000),
    mediaAssetId: z.union([z.string().trim().min(1), z.null()]).optional(),
    altText: nullableText(500),
    order: z.number().int().min(0).optional(),
  })
  .superRefine((input, context) => {
    if (input.type === 'HTML' && !input.contentHtml) {
      context.addIssue({
        code: 'custom',
        path: ['contentHtml'],
        message: 'HTML stimulus requires contentHtml',
      });
    }
  });

export const reorderStimuliSchema = z.object({
  stimulusIds: z.array(z.string().trim().min(1)).min(1),
});

const timelineEventSchema = z
  .object({
    type: z.enum([
      'DIRECTION',
      'EXAMPLE',
      'QUESTION',
      'QUESTION_GROUP',
      'PART_TRANSITION',
      'LISTENING_END',
    ]),
    startMs: z.number().int().min(0),
    endMs: z.number().int().positive(),
    order: z.number().int().min(0),
    sectionId: z.string().trim().min(1).nullable().optional(),
    groupId: z.string().trim().min(1).nullable().optional(),
    questionId: z.string().trim().min(1).nullable().optional(),
  })
  .refine((event) => event.endMs > event.startMs, {
    path: ['endMs'],
    message: 'endMs must be greater than startMs',
  });

export const timelineSchema = z
  .object({ events: z.array(timelineEventSchema).max(2000) })
  .superRefine((input, context) => {
    const orders = new Set<number>();
    input.events.forEach((event, index) => {
      if (orders.has(event.order)) {
        context.addIssue({
          code: 'custom',
          path: ['events', index, 'order'],
          message: `Duplicate timeline order ${event.order}`,
        });
      }
      orders.add(event.order);
      if (event.type === 'QUESTION' && !event.questionId) {
        context.addIssue({
          code: 'custom',
          path: ['events', index, 'questionId'],
          message: 'QUESTION event requires a question target',
        });
      }
      if (event.type === 'QUESTION_GROUP' && !event.groupId) {
        context.addIssue({
          code: 'custom',
          path: ['events', index, 'groupId'],
          message: 'QUESTION_GROUP event requires a group target',
        });
      }
      if (
        ['DIRECTION', 'PART_TRANSITION'].includes(event.type) &&
        !event.sectionId
      ) {
        context.addIssue({
          code: 'custom',
          path: ['events', index, 'sectionId'],
          message: `${event.type} event requires a section target`,
        });
      }
    });
  });

const audioSegmentSchema = z
  .object({
    audioAssetId: z.string().trim().min(1),
    startMs: z.number().int().min(0),
    endMs: z.number().int().positive(),
    segmentType: z.enum(['ANSWER_EVIDENCE', 'CONTEXT']),
  })
  .refine((segment) => segment.endMs > segment.startMs, {
    path: ['endMs'],
    message: 'endMs must be greater than startMs',
  });

export const audioSegmentsSchema = z.object({
  segments: z.array(audioSegmentSchema).max(20),
});

export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;
export type MoveQuestionInput = z.infer<typeof moveQuestionSchema>;
export type StimulusInput = z.infer<typeof stimulusSchema>;
export type ReorderStimuliInput = z.infer<typeof reorderStimuliSchema>;
export type TimelineInput = z.infer<typeof timelineSchema>;
export type AudioSegmentsInput = z.infer<typeof audioSegmentsSchema>;
