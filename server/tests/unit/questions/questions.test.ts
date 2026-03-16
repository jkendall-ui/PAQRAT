import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock prisma
vi.mock('../../../src/lib/prisma', () => ({
  default: {
    question: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
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
import questionsRouter from '../../../src/routes/questions';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/questions', questionsRouter);
  return app;
}

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const CATEGORY_UUID = '660e8400-e29b-41d4-a716-446655440001';

const mockQuestion = (overrides: Record<string, unknown> = {}) => ({
  id: VALID_UUID,
  body: 'What is the most common cause of chest pain?',
  type: 'single_best_answer',
  difficulty: 3,
  categoryId: CATEGORY_UUID,
  explanation: 'Musculoskeletal causes are most common.',
  ncpaTaskArea: 'Cardiology',
  isActive: true,
  createdAt: new Date(),
  category: { id: CATEGORY_UUID, name: 'Cardiology' },
  ...overrides,
});

describe('Questions Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /questions', () => {
    it('returns paginated questions', async () => {
      const questions = [mockQuestion(), mockQuestion({ id: '770e8400-e29b-41d4-a716-446655440002' })];
      vi.mocked(prisma.question.findMany).mockResolvedValue(questions as any);
      vi.mocked(prisma.question.count).mockResolvedValue(2);

      const app = createApp();
      const res = await request(app).get('/questions?page=1&limit=20');

      expect(res.status).toBe(200);
      expect(res.body.questions).toHaveLength(2);
      expect(res.body.total).toBe(2);
    });

    it('filters by categoryId', async () => {
      vi.mocked(prisma.question.findMany).mockResolvedValue([]);
      vi.mocked(prisma.question.count).mockResolvedValue(0);

      const app = createApp();
      const res = await request(app).get(`/questions?categoryId=${CATEGORY_UUID}`);

      expect(res.status).toBe(200);
      expect(prisma.question.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ categoryId: CATEGORY_UUID, isActive: true }),
        })
      );
    });

    it('filters by difficulty', async () => {
      vi.mocked(prisma.question.findMany).mockResolvedValue([]);
      vi.mocked(prisma.question.count).mockResolvedValue(0);

      const app = createApp();
      const res = await request(app).get('/questions?difficulty=3');

      expect(res.status).toBe(200);
      expect(prisma.question.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ difficulty: 3, isActive: true }),
        })
      );
    });

    it('filters by search term using case-insensitive contains', async () => {
      vi.mocked(prisma.question.findMany).mockResolvedValue([]);
      vi.mocked(prisma.question.count).mockResolvedValue(0);

      const app = createApp();
      const res = await request(app).get('/questions?search=chest');

      expect(res.status).toBe(200);
      expect(prisma.question.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            body: { contains: 'chest', mode: 'insensitive' },
          }),
        })
      );
    });

    it('excludes inactive questions (always filters isActive: true)', async () => {
      vi.mocked(prisma.question.findMany).mockResolvedValue([]);
      vi.mocked(prisma.question.count).mockResolvedValue(0);

      const app = createApp();
      await request(app).get('/questions');

      expect(prisma.question.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
        })
      );
      expect(prisma.question.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ isActive: true }),
      });
    });

    it('applies pagination correctly', async () => {
      vi.mocked(prisma.question.findMany).mockResolvedValue([]);
      vi.mocked(prisma.question.count).mockResolvedValue(50);

      const app = createApp();
      const res = await request(app).get('/questions?page=3&limit=10');

      expect(res.status).toBe(200);
      expect(prisma.question.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 })
      );
    });

    it('includes category name in response', async () => {
      const questions = [mockQuestion()];
      vi.mocked(prisma.question.findMany).mockResolvedValue(questions as any);
      vi.mocked(prisma.question.count).mockResolvedValue(1);

      const app = createApp();
      const res = await request(app).get('/questions');

      expect(res.status).toBe(200);
      expect(prisma.question.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            category: { select: { id: true, name: true } },
          }),
        })
      );
    });
  });

  describe('GET /questions/:id', () => {
    it('returns question with options and media', async () => {
      const question = mockQuestion({
        options: [
          { id: 'opt-1', body: 'Option A', isCorrect: true },
          { id: 'opt-2', body: 'Option B', isCorrect: false },
        ],
        media: [
          { id: 'media-1', type: 'image', url: 'https://example.com/img.png', altText: 'ECG' },
        ],
      });
      vi.mocked(prisma.question.findUnique).mockResolvedValue(question as any);

      const app = createApp();
      const res = await request(app).get(`/questions/${VALID_UUID}`);

      expect(res.status).toBe(200);
      expect(res.body.question.id).toBe(VALID_UUID);
      expect(res.body.question.options).toHaveLength(2);
      expect(res.body.question.media).toHaveLength(1);
      expect(res.body.question.category.name).toBe('Cardiology');
    });

    it('returns 404 for inactive question', async () => {
      vi.mocked(prisma.question.findUnique).mockResolvedValue(null);

      const app = createApp();
      const res = await request(app).get(`/questions/${VALID_UUID}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 for non-existent question', async () => {
      vi.mocked(prisma.question.findUnique).mockResolvedValue(null);

      const app = createApp();
      const res = await request(app).get(`/questions/${VALID_UUID}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 for invalid UUID', async () => {
      const app = createApp();
      const res = await request(app).get('/questions/not-a-uuid');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('queries with isActive: true to exclude inactive questions', async () => {
      vi.mocked(prisma.question.findUnique).mockResolvedValue(null);

      const app = createApp();
      await request(app).get(`/questions/${VALID_UUID}`);

      expect(prisma.question.findUnique).toHaveBeenCalledWith({
        where: { id: VALID_UUID, isActive: true },
        include: {
          options: true,
          media: true,
          category: { select: { id: true, name: true } },
        },
      });
    });
  });
});
