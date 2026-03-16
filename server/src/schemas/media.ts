import { z } from 'zod';

export const createMediaSchema = z.object({
  questionId: z.string().uuid(),
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

export const uploadUrlSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
});
