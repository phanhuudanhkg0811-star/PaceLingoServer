import { z } from 'zod';

export const toeicParts = [
  'PART_1',
  'PART_2',
  'PART_3',
  'PART_4',
  'PART_5',
  'PART_6',
  'PART_7',
] as const;

const optionalId = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  z.string().trim().min(1).optional(),
);

const optionalHtml = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  z.string().trim().max(20_000).optional(),
);

export const directionTemplateListSchema = z.object({
  part: z.enum(toeicParts).optional(),
  language: z.string().trim().min(2).max(12).default('en'),
});

export const createDirectionTemplateSchema = z.object({
  part: z.enum(toeicParts),
  directionText: z.string().trim().min(1).max(10_000),
  directionAudioAssetId: optionalId,
  exampleHtml: optionalHtml,
  exampleAudioAssetId: optionalId,
  language: z.string().trim().min(2).max(12).default('en'),
  isDefault: z.boolean().default(false),
});

export const updateDirectionTemplateSchema = z
  .object({
    directionText: z.string().trim().min(1).max(10_000).optional(),
    directionAudioAssetId: z
      .union([z.string().trim().min(1), z.null()])
      .optional(),
    exampleHtml: z.union([z.string().trim().max(20_000), z.null()]).optional(),
    exampleAudioAssetId: z
      .union([z.string().trim().min(1), z.null()])
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export const resolveDirectionSchema = z
  .object({
    part: z.enum(toeicParts),
    mode: z.enum(['DEFAULT', 'CUSTOM', 'NONE']).default('DEFAULT'),
    templateId: optionalId,
    language: z.string().trim().min(2).max(12).default('en'),
  })
  .superRefine((value, context) => {
    if (value.mode === 'CUSTOM' && !value.templateId) {
      context.addIssue({
        code: 'custom',
        path: ['templateId'],
        message: 'CUSTOM mode requires templateId',
      });
    }
  });

export type DirectionTemplateListQuery = z.infer<
  typeof directionTemplateListSchema
>;
export type CreateDirectionTemplateInput = z.infer<
  typeof createDirectionTemplateSchema
>;
export type UpdateDirectionTemplateInput = z.infer<
  typeof updateDirectionTemplateSchema
>;
export type ResolveDirectionQuery = z.infer<typeof resolveDirectionSchema>;
