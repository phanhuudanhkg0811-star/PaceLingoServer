import { z } from 'zod';

const optionalText = (max: number) =>
  z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().max(max).optional(),
  );

export const mediaUploadSchema = z.object({
  altText: optionalText(500),
});

export const updateMediaSchema = z
  .object({
    originalName: z.string().trim().min(1).max(255).optional(),
    altText: z.union([z.string().trim().max(500), z.null()]).optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    'At least one field is required',
  );

export const mediaListQuerySchema = z.object({
  search: optionalText(200),
  type: z.enum(['IMAGE', 'AUDIO']).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export type MediaUploadInput = z.infer<typeof mediaUploadSchema>;
export type UpdateMediaInput = z.infer<typeof updateMediaSchema>;
export type MediaListQuery = z.infer<typeof mediaListQuerySchema>;
