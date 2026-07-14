import { z } from 'zod';

export const parseImportSchema = z.object({
  source: z.unknown(),
  targetTestId: z.string().trim().min(1).optional(),
  skipInvalidQuestions: z.boolean().default(false),
});

export const updateImportSchema = z.object({
  source: z.unknown(),
  skipInvalidQuestions: z.boolean().default(false),
});

export const publishImportSchema = z
  .object({
    mode: z.enum(['CREATE_TEST', 'REPLACE_CONTENT', 'APPEND_PARTS']),
    targetTestId: z.string().trim().min(1).optional(),
  })
  .superRefine((input, context) => {
    if (input.mode !== 'CREATE_TEST' && !input.targetTestId) {
      context.addIssue({
        code: 'custom',
        path: ['targetTestId'],
        message: `${input.mode} requires targetTestId`,
      });
    }
  });

export const importListSchema = z.object({
  status: z
    .enum(['PARSED', 'NEEDS_REVIEW', 'VALIDATED', 'PUBLISHED', 'DISCARDED'])
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export type ParseImportInput = z.infer<typeof parseImportSchema>;
export type UpdateImportInput = z.infer<typeof updateImportSchema>;
export type PublishImportInput = z.infer<typeof publishImportSchema>;
export type ImportListQuery = z.infer<typeof importListSchema>;
