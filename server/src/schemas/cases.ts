import { z } from 'zod';

// ─── Enums ───────────────────────────────────────────────

const sourceTypeEnum = z.enum(['top_150_ecg', 'ecg_exigency', 'clinical_case', 'ecg_library']);

const mediaTypeEnum = z.enum([
  'ecg_12lead',
  'ecg_rhythm_strip',
  'ecg_right_sided',
  'ecg_posterior',
  'ecg_single_lead',
  'algorithm_diagram',
  'clinical_image',
  'video',
]);

const timingEnum = z.enum(['initial', 'post_treatment', 'serial', 'comparison']);

const questionFormatEnum = z.enum([
  'describe_and_interpret',
  'what_is_diagnosis',
  'identify_features',
  'clinical_decision',
  'differential_diagnosis',
  'algorithm_application',
  'compare_ecgs',
]);

const primaryTopicEnum = z.enum([
  'normal_ecg',
  'sinus_rhythms',
  'atrial_arrhythmias',
  'junctional_rhythms',
  'ventricular_arrhythmias',
  'heart_blocks',
  'bundle_branch_blocks',
  'fascicular_blocks',
  'pre_excitation',
  'acute_coronary_syndromes',
  'stemi_equivalents',
  'st_segment_changes',
  't_wave_abnormalities',
  'axis_deviation',
  'chamber_enlargement',
  'electrolyte_disturbances',
  'drug_effects',
  'pericardial_disease',
  'cardiomyopathy',
  'pacemaker_ecg',
  'pediatric_ecg',
  'pulmonary_embolism',
  'intervals_and_segments',
  'ecg_artifacts',
  'diagnostic_algorithms',
]);

const litflCategoryEnum = z.enum([
  'ECG',
  'Cardiology',
  'ICE',
  'Toxicology',
  'Metabolic',
  'Resus',
  'Pulmonary',
  'Neurology',
  'Other',
]);

const difficultyEnum = z.enum(['beginner', 'intermediate', 'advanced']);
const boardRelevanceEnum = z.enum(['high', 'medium', 'low']);
const clinicalUrgencyEnum = z.enum(['emergent', 'urgent', 'routine']);

// ─── Sub-schemas ─────────────────────────────────────────

const relatedLinkSchema = z.object({
  text: z.string().min(1),
  url: z.string().url(),
});

const ecgFindingSchema = z.object({
  category: z.string().min(1),
  findings: z.array(z.string()).min(1),
});

const answerSchema = z.object({
  summary: z.string().min(1),
  ecg_findings: z.array(ecgFindingSchema),
  interpretation_text: z.string().optional(),
  related_links: z.array(relatedLinkSchema).optional(),
});

const questionSchema = z.object({
  question_id: z.string().min(1),
  sequence: z.number().int().min(1),
  question_stem: z.string().min(1),
  question_format: questionFormatEnum,
  related_media_ids: z.array(z.string()).optional(),
  answer: answerSchema,
});

const mediaSchema = z.object({
  media_id: z.string().min(1),
  type: mediaTypeEnum,
  url: z.string().url(),
  local_filename: z.string().min(1),
  alt_text: z.string().min(1),
  caption: z.string().optional(),
  timing: timingEnum.optional(),
  attribution: z.string().min(1),
});

const subCaseSchema = z.object({
  sub_case_id: z.string().min(1),
  sub_case_label: z.string().optional(),
  sub_case_context: z.string().optional(),
  media: z.array(mediaSchema),
  questions: z.array(questionSchema),
});

const referenceSchema = z.object({
  citation: z.string().min(1),
  url: z.string().url().optional(),
});

const tagsSchema = z.object({
  primary_topic: primaryTopicEnum,
  secondary_topics: z.array(z.string()).optional().default([]),
  litfl_category: litflCategoryEnum,
  difficulty: difficultyEnum,
  board_relevance: boardRelevanceEnum,
  clinical_urgency: clinicalUrgencyEnum.optional(),
});

const caseSchema = z.object({
  case_id: z.string().regex(/^LITFL-(ECG|EX|CC)-[0-9]{4}$/),
  source_url: z.string().url(),
  source_type: sourceTypeEnum,
  title: z.string().min(1),
  authors: z.array(z.string()),
  last_updated: z.string().optional(),
  keywords: z.array(z.string()),
  clinical_context: z.string().min(1),
  sub_cases: z.array(subCaseSchema).min(1),
  clinical_pearls: z.array(z.string()).optional().default([]),
  references: z.array(referenceSchema).optional().default([]),
  tags: tagsSchema,
});

const metadataSchema = z.object({
  version: z.string().min(1),
  generated_at: z.string(),
  total_cases: z.number().int(),
  total_questions: z.number().int(),
  source: z.string().min(1),
  license: z.string().min(1),
  target_audience: z.string().optional(),
});

// ─── Export schemas ──────────────────────────────────────

export const litflImportSchema = z.object({
  metadata: metadataSchema,
  cases: z.array(caseSchema).min(1),
  defaultCategoryId: z.string().uuid().optional(),
});

export const getCasesQuerySchema = z.object({
  source_type: sourceTypeEnum.optional(),
  primary_topic: z.string().optional(),
  difficulty: difficultyEnum.optional(),
  board_relevance: boardRelevanceEnum.optional(),
  clinical_urgency: clinicalUrgencyEnum.optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const caseExportQuerySchema = z.object({
  source_type: sourceTypeEnum.optional(),
  primary_topic: primaryTopicEnum.optional(),
  difficulty: difficultyEnum.optional(),
});
