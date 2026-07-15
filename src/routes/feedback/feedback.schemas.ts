import { z } from 'zod';

export const contactFeedbackSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().max(254),
  subject: z.string().trim().min(3).max(160),
  message: z.string().trim().min(10).max(5_000),
  website: z.literal('').optional(),
});

export const questionErrorSchema = z.object({
  attemptId: z.string().min(1),
  questionId: z.string().min(1),
  questionNumber: z.number().int().positive(),
  category: z.enum([
    'WRONG_ANSWER',
    'CONTENT_TYPO',
    'MISSING_MEDIA',
    'AUDIO_PROBLEM',
    'OTHER',
  ]),
  message: z.string().trim().min(5).max(2_000),
});

export const feedbackStatusSchema = z.object({
  status: z.enum(['OPEN', 'RESOLVED', 'DISMISSED']),
});

export type ContactFeedbackInput = z.infer<typeof contactFeedbackSchema>;
export type QuestionErrorInput = z.infer<typeof questionErrorSchema>;
export type FeedbackStatusInput = z.infer<typeof feedbackStatusSchema>;
