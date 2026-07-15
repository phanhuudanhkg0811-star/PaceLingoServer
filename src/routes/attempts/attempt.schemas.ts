import { z } from 'zod';

const answerSchema = z.object({
  questionId: z.string().min(1),
  optionId: z.string().min(1).nullable(),
  isFlagged: z.boolean(),
  clientSequence: z.number().int().nonnegative(),
  answeredAt: z.iso.datetime().nullable(),
});

const timingSchema = z.object({
  questionId: z.string().min(1),
  activeTimeMs: z.number().int().nonnegative().max(86_400_000),
  visitCount: z.number().int().nonnegative().max(100_000),
  firstViewedAt: z.iso.datetime().nullable(),
  lastViewedAt: z.iso.datetime().nullable(),
  clientSequence: z.number().int().nonnegative(),
});

export const attemptBatchSchema = z.object({
  answers: z.array(answerSchema).max(100).default([]),
  timings: z.array(timingSchema).max(100).default([]),
});

export const attemptProgressSchema = z.object({
  currentSection: z.enum(['LISTENING', 'READING']),
  currentQuestionId: z.string().min(1).nullable(),
});

export const startAttemptSchema = z.object({
  restart: z.boolean().optional().default(false),
});

export const retryAttemptSchema = z.object({
  maxQuestions: z.number().int().min(1).max(100).optional(),
});

export const practiceSubmitSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1),
        optionId: z.string().min(1).nullable(),
      }),
    )
    .max(100),
});

export type AttemptBatchInput = z.infer<typeof attemptBatchSchema>;
export type AttemptProgressInput = z.infer<typeof attemptProgressSchema>;
export type StartAttemptInput = z.infer<typeof startAttemptSchema>;
export type RetryAttemptInput = z.infer<typeof retryAttemptSchema>;
export type PracticeSubmitInput = z.infer<typeof practiceSubmitSchema>;
