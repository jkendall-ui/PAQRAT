import { z } from 'zod';

const questionOptionSchema = z.object({
  body: z.string().min(1),
  isCorrect: z.boolean(),
  explanation: z.string().optional(),
});

const questionMediaImportSchema = z.object({
  type: z.enum([
    'image',
    'audio',
    'video_embed',
    'pdf',
    'ecg_12lead',
    'ecg_rhythm_strip',
    'ecg_right_sided',
    'ecg_posterior',
    'ecg_single_lead',
    'algorithm_diagram',
    'clinical_image',
    'video',
  ]),
  url: z.string().url(),
  altText: z.string().min(1),
  attribution: z.string().min(1),
  caption: z.string().optional(),
});

const questionEntrySchema = z.object({
  body: z.string().min(1),
  type: z.enum(['single_best_answer', 'case_based']),
  difficulty: z.number().int().min(1).max(5),
  categoryId: z.string().uuid(),
  explanation: z.string().min(1),
  ncpaTaskArea: z.string().min(1),
  options: z.array(questionOptionSchema).min(1),
  media: z.array(questionMediaImportSchema).optional(),
});

export const questionImportSchema = z.array(questionEntrySchema).min(1);

export const questionImportBodySchema = z.object({
  questions: z.array(questionEntrySchema).min(1),
});

export const questionExportQuerySchema = z.object({
  categoryId: z.string().uuid().optional(),
});

export const getQuestionsQuerySchema = z.object({
  categoryId: z.string().uuid().optional(),
  difficulty: z.coerce.number().int().min(1).max(5).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
