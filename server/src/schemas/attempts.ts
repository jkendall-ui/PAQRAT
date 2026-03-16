import { z } from 'zod';

export const createAttemptSchema = z.object({
  sessionId: z.string().uuid(),
  questionId: z.string().uuid(),
  selectedOptionId: z.string().uuid().optional(),
  durationMs: z.number().int().positive().optional(),
  duration: z.number().int().positive().optional(),
  confidenceRating: z.number().int().min(1).max(3).optional(),
  answerFormat: z.enum(['multiple_choice', 'free_text', 'audio']).optional(),
  rawResponseText: z.string().optional(),
}).transform((data) => ({
  ...data,
  // Client sends "duration" but server expects "durationMs"
  durationMs: data.durationMs ?? data.duration ?? 1000,
}));

export const ecgInterpretationAttemptSchema = z.object({
  sessionId: z.string().uuid(),
  questionId: z.string().uuid(),
  answers: z.record(z.string(), z.string()),
});

export const getAttemptsQuerySchema = z.object({
  sessionId: z.string().uuid().optional(),
  questionId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
