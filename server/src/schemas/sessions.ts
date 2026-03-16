import { z } from 'zod';

export const createSessionSchema = z
  .object({
    mode: z.enum(['diagnostic', 'adaptive', 'exam_simulation', 'weak_spot_sprint', 'ecg_interpretation']),
    categoryId: z.string().uuid().optional(),
  })
  .refine(
    (data) => data.mode !== 'weak_spot_sprint' || data.categoryId !== undefined,
    {
      message: 'categoryId is required for weak_spot_sprint mode',
      path: ['categoryId'],
    }
  );

export const endSessionSchema = z.object({
  endedAt: z.coerce.date(),
});

export const getSessionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
