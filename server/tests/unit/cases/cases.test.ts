import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock prisma
vi.mock('../../../src/lib/prisma', () => ({
  default: {
    case: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    subCase: {
      findUnique: vi.fn(),
    },
    question: {
      findMany: vi.fn(),
    },
  },
}));

// Mock auth middleware to inject user
vi.mock('../../../src/middleware/auth', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-1', role: 'student' };
    next();
  },
}));

import prisma from '../../../src/lib/prisma';
import casesRouter from '../../../src/routes/cases';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/cases', casesRouter);
  return app;
}

const CASE_DB_ID = '550e8400-e29b-41d4-a716-446655440000';
const SUB_CASE_DB_ID = '660e8400-e29b-41d4-a716-446655440001';

const mockCase = (overrides: Record<string, unknown> = {}) => ({
  id: CASE_DB_ID,
  caseId: 'LITFL-ECG-0001',
  sourceUrl: 'https://litfl.com/ecg-case-001',
  sourceType: 'top_150_ecg',
  title: 'Inferior STEMI',
  authors: ['Dr. Smith'],
  lastUpdated: null,
  keywords: ['STEMI', 'inferior'],
  clinicalContext: 'A 55-year-old male presents with chest pain.',
  createdAt: new Date(),
  caseTags: {
    id: 'tag-1',
    caseDbId: CASE_DB_ID,
    primaryTopic: 'acute_coronary_syndromes',
    secondaryTopics: [],
    litflCategory: 'ECG',
    difficulty: 'beginner',
    boardRelevance: 'high',
    clinicalUrgency: 'emergent',
  },
  ...overrides,
});

const mockSubCase = (overrides: Record<string, unknown> = {}) => ({
  id: SUB_CASE_DB_ID,
  subCaseId: 'LITFL-ECG-0001-SC-01',
  caseDbId: CASE_DB_ID,
  subCaseLabel: 'Case 1',
  subCaseContext: 'Initial presentation',
  media: [
    {
      id: 'media-1',
      type: 'ecg_12lead',
      url: 'https://example.com/ecg.png',
      altText: '12-lead ECG showing ST elevation',
      attribution: 'LITFL CC-BY',
      caption: 'Initial ECG',
      timing: 'initial',
    },
  ],
  questions: [
    {
      id: 'q-1',
      body: 'Describe and interpret this ECG',
      sequence: 1,
      questionFormat: 'describe_and_interpret',
      answerSummary: 'Inferior STEMI with right ventricular infarction',
      interpretationText: 'ST elevation in leads II, III, aVF',
      ecgFindings: [
        { id: 'ef-1', category: 'General', findings: ['Rate: 80 bpm'], sortOrder: 0 },
      ],
      answerLinks: [
        { id: 'al-1', text: 'inferior STEMI', url: 'https://litfl.com/inferior-stemi' },
      ],
    },
  ],
  ...overrides,
});

describe('Cases Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /cases', () => {
    it('returns paginated cases with default pagination', async () => {
      const cases = [mockCase()];
      vi.mocked(prisma.case.findMany).mockResolvedValue(cases as any);
      vi.mocked(prisma.case.count).mockResolvedValue(1);

      const app = createApp();
      const res = await request(app).get('/cases');

      expect(res.status).toBe(200);
      expect(res.body.cases).toHaveLength(1);
      expect(res.body.total).toBe(1);
      expect(prisma.case.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 })
      );
    });

    it('respects pagination parameters', async () => {
      vi.mocked(prisma.case.findMany).mockResolvedValue([]);
      vi.mocked(prisma.case.count).mockResolvedValue(50);

      const app = createApp();
      const res = await request(app).get('/cases?page=3&limit=10');

      expect(res.status).toBe(200);
      expect(prisma.case.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 })
      );
    });

    it('filters by source_type', async () => {
      vi.mocked(prisma.case.findMany).mockResolvedValue([]);
      vi.mocked(prisma.case.count).mockResolvedValue(0);

      const app = createApp();
      const res = await request(app).get('/cases?source_type=top_150_ecg');

      expect(res.status).toBe(200);
      expect(prisma.case.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ sourceType: 'top_150_ecg' }),
        })
      );
    });

    it('filters by primary_topic through caseTags relation', async () => {
      vi.mocked(prisma.case.findMany).mockResolvedValue([]);
      vi.mocked(prisma.case.count).mockResolvedValue(0);

      const app = createApp();
      const res = await request(app).get('/cases?primary_topic=acute_coronary_syndromes');

      expect(res.status).toBe(200);
      expect(prisma.case.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            caseTags: expect.objectContaining({ primaryTopic: 'acute_coronary_syndromes' }),
          }),
        })
      );
    });

    it('filters by difficulty through caseTags relation', async () => {
      vi.mocked(prisma.case.findMany).mockResolvedValue([]);
      vi.mocked(prisma.case.count).mockResolvedValue(0);

      const app = createApp();
      const res = await request(app).get('/cases?difficulty=beginner');

      expect(res.status).toBe(200);
      expect(prisma.case.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            caseTags: expect.objectContaining({ difficulty: 'beginner' }),
          }),
        })
      );
    });

    it('filters by board_relevance through caseTags relation', async () => {
      vi.mocked(prisma.case.findMany).mockResolvedValue([]);
      vi.mocked(prisma.case.count).mockResolvedValue(0);

      const app = createApp();
      const res = await request(app).get('/cases?board_relevance=high');

      expect(res.status).toBe(200);
      expect(prisma.case.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            caseTags: expect.objectContaining({ boardRelevance: 'high' }),
          }),
        })
      );
    });

    it('filters by clinical_urgency through caseTags relation', async () => {
      vi.mocked(prisma.case.findMany).mockResolvedValue([]);
      vi.mocked(prisma.case.count).mockResolvedValue(0);

      const app = createApp();
      const res = await request(app).get('/cases?clinical_urgency=emergent');

      expect(res.status).toBe(200);
      expect(prisma.case.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            caseTags: expect.objectContaining({ clinicalUrgency: 'emergent' }),
          }),
        })
      );
    });

    it('searches on title and clinicalContext', async () => {
      vi.mocked(prisma.case.findMany).mockResolvedValue([]);
      vi.mocked(prisma.case.count).mockResolvedValue(0);

      const app = createApp();
      const res = await request(app).get('/cases?search=STEMI');

      expect(res.status).toBe(200);
      expect(prisma.case.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { title: { contains: 'STEMI', mode: 'insensitive' } },
              { clinicalContext: { contains: 'STEMI', mode: 'insensitive' } },
            ],
          }),
        })
      );
    });

    it('combines multiple filters', async () => {
      vi.mocked(prisma.case.findMany).mockResolvedValue([]);
      vi.mocked(prisma.case.count).mockResolvedValue(0);

      const app = createApp();
      const res = await request(app).get(
        '/cases?source_type=top_150_ecg&difficulty=beginner&search=STEMI'
      );

      expect(res.status).toBe(200);
      expect(prisma.case.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sourceType: 'top_150_ecg',
            caseTags: expect.objectContaining({ difficulty: 'beginner' }),
            OR: expect.any(Array),
          }),
        })
      );
    });

    it('rejects invalid source_type', async () => {
      const app = createApp();
      const res = await request(app).get('/cases?source_type=invalid');

      expect(res.status).toBe(400);
    });

    it('rejects invalid difficulty', async () => {
      const app = createApp();
      const res = await request(app).get('/cases?difficulty=expert');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /cases/:caseId', () => {
    it('returns full case detail with sub-cases, tags, pearls, references', async () => {
      const caseRecord = mockCase({
        subCases: [{ id: SUB_CASE_DB_ID, subCaseId: 'LITFL-ECG-0001-SC-01' }],
        clinicalPearls: [{ id: 'cp-1', text: 'Always check right-sided leads', sortOrder: 0 }],
        caseReferences: [{ id: 'ref-1', citation: 'Braunwald 2024', url: 'https://example.com' }],
      });
      vi.mocked(prisma.case.findUnique).mockResolvedValue(caseRecord as any);

      const app = createApp();
      const res = await request(app).get('/cases/LITFL-ECG-0001');

      expect(res.status).toBe(200);
      expect(res.body.case.caseId).toBe('LITFL-ECG-0001');
      expect(res.body.subCases).toHaveLength(1);
      expect(res.body.tags).toBeDefined();
      expect(res.body.clinicalPearls).toHaveLength(1);
      expect(res.body.references).toHaveLength(1);
    });

    it('queries by case_id field (not UUID)', async () => {
      vi.mocked(prisma.case.findUnique).mockResolvedValue(null);

      const app = createApp();
      await request(app).get('/cases/LITFL-ECG-0001');

      expect(prisma.case.findUnique).toHaveBeenCalledWith({
        where: { caseId: 'LITFL-ECG-0001' },
        include: {
          subCases: true,
          caseTags: true,
          clinicalPearls: { orderBy: { sortOrder: 'asc' } },
          caseReferences: true,
        },
      });
    });

    it('returns 404 for non-existent case', async () => {
      vi.mocked(prisma.case.findUnique).mockResolvedValue(null);

      const app = createApp();
      const res = await request(app).get('/cases/LITFL-ECG-9999');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /cases/:caseId/sub-cases/:subCaseId', () => {
    it('returns sub-case with media and questions', async () => {
      vi.mocked(prisma.case.findUnique).mockResolvedValue({ id: CASE_DB_ID, caseId: 'LITFL-ECG-0001' } as any);
      const subCase = mockSubCase();
      vi.mocked(prisma.subCase.findUnique).mockResolvedValue(subCase as any);

      const app = createApp();
      const res = await request(app).get('/cases/LITFL-ECG-0001/sub-cases/LITFL-ECG-0001-SC-01');

      expect(res.status).toBe(200);
      expect(res.body.subCase.subCaseId).toBe('LITFL-ECG-0001-SC-01');
      expect(res.body.media).toHaveLength(1);
      expect(res.body.questions).toHaveLength(1);
      expect(res.body.questions[0].ecgFindings).toHaveLength(1);
      expect(res.body.questions[0].answerLinks).toHaveLength(1);
    });

    it('returns 404 when case does not exist', async () => {
      vi.mocked(prisma.case.findUnique).mockResolvedValue(null);

      const app = createApp();
      const res = await request(app).get('/cases/LITFL-ECG-9999/sub-cases/LITFL-ECG-9999-SC-01');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.error.message).toBe('Case not found');
    });

    it('returns 404 when sub-case does not exist', async () => {
      vi.mocked(prisma.case.findUnique).mockResolvedValue({ id: CASE_DB_ID, caseId: 'LITFL-ECG-0001' } as any);
      vi.mocked(prisma.subCase.findUnique).mockResolvedValue(null);

      const app = createApp();
      const res = await request(app).get('/cases/LITFL-ECG-0001/sub-cases/NONEXISTENT');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.error.message).toBe('Sub-case not found');
    });

    it('returns 404 when sub-case belongs to a different case', async () => {
      vi.mocked(prisma.case.findUnique).mockResolvedValue({ id: CASE_DB_ID, caseId: 'LITFL-ECG-0001' } as any);
      vi.mocked(prisma.subCase.findUnique).mockResolvedValue({
        id: SUB_CASE_DB_ID,
        subCaseId: 'LITFL-ECG-0002-SC-01',
        caseDbId: 'different-case-db-id',
      } as any);

      const app = createApp();
      const res = await request(app).get('/cases/LITFL-ECG-0001/sub-cases/LITFL-ECG-0002-SC-01');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('includes ecgFindings and answerLinks in questions', async () => {
      vi.mocked(prisma.case.findUnique).mockResolvedValue({ id: CASE_DB_ID, caseId: 'LITFL-ECG-0001' } as any);
      vi.mocked(prisma.subCase.findUnique).mockResolvedValue(mockSubCase() as any);

      const app = createApp();
      await request(app).get('/cases/LITFL-ECG-0001/sub-cases/LITFL-ECG-0001-SC-01');

      expect(prisma.subCase.findUnique).toHaveBeenCalledWith({
        where: { subCaseId: 'LITFL-ECG-0001-SC-01' },
        include: {
          media: true,
          questions: {
            orderBy: { sequence: 'asc' },
            include: {
              ecgFindings: { orderBy: { sortOrder: 'asc' } },
              answerLinks: true,
            },
          },
        },
      });
    });
  });

  describe('GET /cases/:caseId/sub-cases/:subCaseId/questions', () => {
    it('returns questions in sequence order with structured answers', async () => {
      vi.mocked(prisma.case.findUnique).mockResolvedValue({ id: CASE_DB_ID, caseId: 'LITFL-ECG-0001' } as any);
      vi.mocked(prisma.subCase.findUnique).mockResolvedValue({
        id: SUB_CASE_DB_ID,
        subCaseId: 'LITFL-ECG-0001-SC-01',
        caseDbId: CASE_DB_ID,
      } as any);

      const mockQuestions = [
        {
          id: 'q-1',
          body: 'Describe this ECG',
          sequence: 1,
          questionFormat: 'describe_and_interpret',
          answerSummary: 'Inferior STEMI',
          interpretationText: 'ST elevation in II, III, aVF',
          ecgFindings: [{ id: 'ef-1', category: 'General', findings: ['Rate: 80 bpm'] }],
          answerLinks: [{ id: 'al-1', text: 'STEMI', url: 'https://litfl.com/stemi' }],
          media: [],
        },
        {
          id: 'q-2',
          body: 'What is the diagnosis?',
          sequence: 2,
          questionFormat: 'what_is_diagnosis',
          answerSummary: 'Inferior STEMI with RV involvement',
          interpretationText: null,
          ecgFindings: [],
          answerLinks: [],
          media: [],
        },
      ];
      vi.mocked(prisma.question.findMany).mockResolvedValue(mockQuestions as any);

      const app = createApp();
      const res = await request(app).get(
        '/cases/LITFL-ECG-0001/sub-cases/LITFL-ECG-0001-SC-01/questions'
      );

      expect(res.status).toBe(200);
      expect(res.body.questions).toHaveLength(2);
      expect(res.body.questions[0].sequence).toBe(1);
      expect(res.body.questions[0].answerSummary).toBe('Inferior STEMI');
      expect(res.body.questions[0].ecgFindings).toHaveLength(1);
      expect(res.body.questions[0].answerLinks).toHaveLength(1);
      expect(res.body.questions[1].sequence).toBe(2);
    });

    it('queries questions by sub-case database ID with correct includes', async () => {
      vi.mocked(prisma.case.findUnique).mockResolvedValue({ id: CASE_DB_ID, caseId: 'LITFL-ECG-0001' } as any);
      vi.mocked(prisma.subCase.findUnique).mockResolvedValue({
        id: SUB_CASE_DB_ID,
        subCaseId: 'LITFL-ECG-0001-SC-01',
        caseDbId: CASE_DB_ID,
      } as any);
      vi.mocked(prisma.question.findMany).mockResolvedValue([]);

      const app = createApp();
      await request(app).get(
        '/cases/LITFL-ECG-0001/sub-cases/LITFL-ECG-0001-SC-01/questions'
      );

      expect(prisma.question.findMany).toHaveBeenCalledWith({
        where: { subCaseId: SUB_CASE_DB_ID },
        orderBy: { sequence: 'asc' },
        include: {
          ecgFindings: { orderBy: { sortOrder: 'asc' } },
          answerLinks: true,
          media: true,
        },
      });
    });

    it('returns 404 when case does not exist', async () => {
      vi.mocked(prisma.case.findUnique).mockResolvedValue(null);

      const app = createApp();
      const res = await request(app).get(
        '/cases/LITFL-ECG-9999/sub-cases/LITFL-ECG-9999-SC-01/questions'
      );

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when sub-case does not exist', async () => {
      vi.mocked(prisma.case.findUnique).mockResolvedValue({ id: CASE_DB_ID, caseId: 'LITFL-ECG-0001' } as any);
      vi.mocked(prisma.subCase.findUnique).mockResolvedValue(null);

      const app = createApp();
      const res = await request(app).get(
        '/cases/LITFL-ECG-0001/sub-cases/NONEXISTENT/questions'
      );

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when sub-case belongs to different case', async () => {
      vi.mocked(prisma.case.findUnique).mockResolvedValue({ id: CASE_DB_ID, caseId: 'LITFL-ECG-0001' } as any);
      vi.mocked(prisma.subCase.findUnique).mockResolvedValue({
        id: SUB_CASE_DB_ID,
        subCaseId: 'LITFL-ECG-0002-SC-01',
        caseDbId: 'different-case-db-id',
      } as any);

      const app = createApp();
      const res = await request(app).get(
        '/cases/LITFL-ECG-0001/sub-cases/LITFL-ECG-0002-SC-01/questions'
      );

      expect(res.status).toBe(404);
    });
  });
});
