import { z } from 'zod';

export const updateProfileSchema = z.object({
  targetExam: z.enum(['PANCE', 'PANRE']).optional(),
  examDate: z.string().datetime().optional(),
});
