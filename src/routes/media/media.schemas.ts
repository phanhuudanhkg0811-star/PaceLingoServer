import { z } from 'zod';

const optionalText = (max: number) =>
  z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().max(max).optional(),
  );

const optionalId = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().trim().min(1).max(100).optional(),
);

export const mediaUploadSchema = z.object({
  altText: optionalText(500),
  folderId: optionalId,
});

export const updateMediaSchema = z
  .object({
    originalName: z.string().trim().min(1).max(255).optional(),
    altText: z.union([z.string().trim().max(500), z.null()]).optional(),
    folderId: z.union([z.string().trim().min(1).max(100), z.null()]).optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    'At least one field is required',
  );

export const mediaListQuerySchema = z.object({
  search: optionalText(200),
  type: z.enum(['IMAGE', 'AUDIO']).optional(),
  folder: optionalText(100),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const createMediaFolderSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const updateMediaFolderSchema = createMediaFolderSchema;

export type MediaUploadInput = z.infer<typeof mediaUploadSchema>;
export type UpdateMediaInput = z.infer<typeof updateMediaSchema>;
export type MediaListQuery = z.infer<typeof mediaListQuerySchema>;
export type CreateMediaFolderInput = z.infer<typeof createMediaFolderSchema>;
export type UpdateMediaFolderInput = z.infer<typeof updateMediaFolderSchema>;
