import { z } from 'zod';

export const createBookmarkSchema = z.object({
  questionId: z.string().uuid(),
});

export const getBookmarksQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
