import { z } from 'zod';

export const startCandidateRuntimeSchema = z.object({
  runtimeToken: z.string().trim().min(1).optional(),
});

export type StartCandidateRuntimeInput = z.infer<
  typeof startCandidateRuntimeSchema
>;
