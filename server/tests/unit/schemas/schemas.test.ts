import { describe, it, expect } from 'vitest';
import {
  googleAuthSchema,
  createAttemptSchema,
  getAttemptsQuerySchema,
  createSessionSchema,
  endSessionSchema,
  getSessionsQuerySchema,
  questionImportSchema,
  getQuestionsQuerySchema,
  litflImportSchema,
  getCasesQuerySchema,
  updateProfileSchema,
  createMediaSchema,
  uploadUrlSchema,
  uuidParamsSchema,
  paginationQuerySchema,
} from '../../../src/schemas';

// ─── Helpers ─────────────────────────────────────────────

const validUuid = '550e8400-e29b-41d4-a716-446655440000';

// ─── Auth ────────────────────────────────────────────────

describe('googleAuthSchema', () => {
  it('accepts a valid idToken', () => {
    const result = googleAuthSchema.safeParse({ idToken: 'some-token' });
    expect(result.success).toBe(true);
  });

  it('rejects empty idToken', () => {
    const result = googleAuthSchema.safeParse({ idToken: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing idToken', () => {
    const result = googleAuthSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ─── Attempts ────────────────────────────────────────────

describe('createAttemptSchema', () => {
  const validAttempt = {
    sessionId: validUuid,
    questionId: validUuid,
    selectedOptionId: validUuid,
    durationMs: 5000,
  };

  it('accepts valid attempt', () => {
    expect(createAttemptSchema.safeParse(validAttempt).success).toBe(true);
  });

  it('accepts optional fields', () => {
    const result = createAttemptSchema.safeParse({
      ...validAttempt,
      confidenceRating: 2,
      answerFormat: 'free_text',
      rawResponseText: 'my answer',
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-uuid sessionId', () => {
    const result = createAttemptSchema.safeParse({ ...validAttempt, sessionId: 'bad' });
    expect(result.success).toBe(false);
  });

  it('rejects zero durationMs', () => {
    const result = createAttemptSchema.safeParse({ ...validAttempt, durationMs: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects confidenceRating out of range', () => {
    const result = createAttemptSchema.safeParse({ ...validAttempt, confidenceRating: 4 });
    expect(result.success).toBe(false);
  });

  it('rejects invalid answerFormat', () => {
    const result = createAttemptSchema.safeParse({ ...validAttempt, answerFormat: 'morse_code' });
    expect(result.success).toBe(false);
  });
});

describe('getAttemptsQuerySchema', () => {
  it('accepts empty query (defaults applied)', () => {
    const result = getAttemptsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ page: 1, limit: 20 });
  });

  it('coerces string page/limit', () => {
    const result = getAttemptsQuerySchema.safeParse({ page: '3', limit: '50' });
    expect(result.success).toBe(true);
    expect(result.data?.page).toBe(3);
    expect(result.data?.limit).toBe(50);
  });
});

// ─── Sessions ────────────────────────────────────────────

describe('createSessionSchema', () => {
  it('accepts adaptive mode without categoryId', () => {
    expect(createSessionSchema.safeParse({ mode: 'adaptive' }).success).toBe(true);
  });

  it('accepts exam_simulation mode', () => {
    expect(createSessionSchema.safeParse({ mode: 'exam_simulation' }).success).toBe(true);
  });

  it('accepts weak_spot_sprint with categoryId', () => {
    const result = createSessionSchema.safeParse({
      mode: 'weak_spot_sprint',
      categoryId: validUuid,
    });
    expect(result.success).toBe(true);
  });

  it('rejects weak_spot_sprint without categoryId', () => {
    const result = createSessionSchema.safeParse({ mode: 'weak_spot_sprint' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('categoryId');
    }
  });

  it('rejects invalid mode', () => {
    expect(createSessionSchema.safeParse({ mode: 'turbo' }).success).toBe(false);
  });
});

describe('endSessionSchema', () => {
  it('accepts valid datetime string', () => {
    const result = endSessionSchema.safeParse({ endedAt: '2024-01-15T10:30:00Z' });
    expect(result.success).toBe(true);
  });

  it('rejects missing endedAt', () => {
    expect(endSessionSchema.safeParse({}).success).toBe(false);
  });
});

describe('getSessionsQuerySchema', () => {
  it('applies defaults', () => {
    const result = getSessionsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ page: 1, limit: 20 });
  });
});

// ─── Questions ───────────────────────────────────────────

describe('questionImportSchema', () => {
  const validQuestion = {
    body: 'What is the diagnosis?',
    type: 'single_best_answer',
    difficulty: 3,
    categoryId: validUuid,
    explanation: 'The answer is...',
    ncpaTaskArea: 'Cardiology',
    options: [
      { body: 'Option A', isCorrect: true },
      { body: 'Option B', isCorrect: false },
    ],
  };

  it('accepts valid question array', () => {
    expect(questionImportSchema.safeParse([validQuestion]).success).toBe(true);
  });

  it('rejects empty array', () => {
    expect(questionImportSchema.safeParse([]).success).toBe(false);
  });

  it('rejects difficulty out of range', () => {
    const result = questionImportSchema.safeParse([{ ...validQuestion, difficulty: 6 }]);
    expect(result.success).toBe(false);
  });

  it('rejects invalid question type', () => {
    const result = questionImportSchema.safeParse([{ ...validQuestion, type: 'essay' }]);
    expect(result.success).toBe(false);
  });
});

describe('getQuestionsQuerySchema', () => {
  it('applies defaults', () => {
    const result = getQuestionsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data?.page).toBe(1);
  });

  it('rejects difficulty out of range', () => {
    const result = getQuestionsQuerySchema.safeParse({ difficulty: '0' });
    expect(result.success).toBe(false);
  });
});

// ─── Users ───────────────────────────────────────────────

describe('updateProfileSchema', () => {
  it('accepts valid profile update', () => {
    const result = updateProfileSchema.safeParse({
      targetExam: 'PANCE',
      examDate: '2025-06-15T00:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty object (all optional)', () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(true);
  });

  it('rejects invalid targetExam', () => {
    expect(updateProfileSchema.safeParse({ targetExam: 'MCAT' }).success).toBe(false);
  });
});

// ─── Media ───────────────────────────────────────────────

describe('createMediaSchema', () => {
  const validMedia = {
    questionId: validUuid,
    type: 'image',
    url: 'https://example.com/img.jpg',
    altText: 'An ECG showing STEMI',
    attribution: 'LITFL, CC BY-NC-SA 4.0',
  };

  it('accepts valid media', () => {
    expect(createMediaSchema.safeParse(validMedia).success).toBe(true);
  });

  it('rejects empty altText (Req 15.5, 16.4)', () => {
    const result = createMediaSchema.safeParse({ ...validMedia, altText: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty attribution (Req 16.4)', () => {
    const result = createMediaSchema.safeParse({ ...validMedia, attribution: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing altText', () => {
    const { altText, ...noAlt } = validMedia;
    expect(createMediaSchema.safeParse(noAlt).success).toBe(false);
  });

  it('accepts extended ECG media types', () => {
    const result = createMediaSchema.safeParse({ ...validMedia, type: 'ecg_12lead' });
    expect(result.success).toBe(true);
  });
});

describe('uploadUrlSchema', () => {
  it('accepts valid upload request', () => {
    expect(uploadUrlSchema.safeParse({ filename: 'ecg.jpg', contentType: 'image/jpeg' }).success).toBe(true);
  });

  it('rejects empty filename', () => {
    expect(uploadUrlSchema.safeParse({ filename: '', contentType: 'image/jpeg' }).success).toBe(false);
  });
});

// ─── Common ──────────────────────────────────────────────

describe('uuidParamsSchema', () => {
  it('accepts valid uuid', () => {
    expect(uuidParamsSchema.safeParse({ id: validUuid }).success).toBe(true);
  });

  it('rejects non-uuid', () => {
    expect(uuidParamsSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
  });
});

describe('paginationQuerySchema', () => {
  it('applies defaults', () => {
    const result = paginationQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ page: 1, limit: 20 });
  });

  it('rejects page < 1', () => {
    expect(paginationQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });

  it('rejects limit > 100', () => {
    expect(paginationQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });
});
