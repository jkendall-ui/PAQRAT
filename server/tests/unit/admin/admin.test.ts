import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock prisma
vi.mock('../../../src/lib/prisma', () => ({
  default: {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    topicScore: {
      findMany: vi.fn(),
    },
    attempt: {
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    studySession: {
      count: vi.fn(),
    },
    question: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    questionOption: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    questionMedia: {
      createMany: vi.fn(),
    },
    category: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    case: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// Mock readinessCalculator
vi.mock('../../../src/services/readinessCalculator', () => ({
  calculateReadiness: vi.fn(),
}));

// Mock auth middleware — admin by default
vi.mock('../../../src/middleware/auth', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = { userId: 'admin-1', role: 'admin' };
    next();
  },
}));

import prisma from '../../../src/lib/prisma';
import { calculateReadiness } from '../../../src/services/readinessCalculator';
import adminRouter from '../../../src/routes/admin';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminRouter);
  return app;
}

describe('Admin Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── GET /admin/users ──────────────────────────────────

  describe('GET /admin/users', () => {
    it('returns paginated user list with lastActive', async () => {
      const mockUsers = [
        {
          id: 'u1',
          name: 'Alice',
          email: 'alice@test.com',
          createdAt: new Date('2025-01-01'),
          plan: 'free',
          role: 'student',
          isBlocked: false,
          attempts: [{ createdAt: new Date('2025-06-01') }],
        },
        {
          id: 'u2',
          name: 'Bob',
          email: 'bob@test.com',
          createdAt: new Date('2025-02-01'),
          plan: 'pro',
          role: 'student',
          isBlocked: true,
          attempts: [],
        },
      ];

      vi.mocked(prisma.user.findMany).mockResolvedValue(mockUsers as any);
      vi.mocked(prisma.user.count).mockResolvedValue(2);

      const app = createApp();
      const res = await request(app).get('/admin/users?page=1&limit=20');

      expect(res.status).toBe(200);
      expect(res.body.users).toHaveLength(2);
      expect(res.body.total).toBe(2);
      expect(res.body.users[0].lastActive).toBeTruthy();
      expect(res.body.users[1].lastActive).toBeNull();
    });

    it('supports search filter on name/email', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);
      vi.mocked(prisma.user.count).mockResolvedValue(0);

      const app = createApp();
      const res = await request(app).get('/admin/users?search=alice');

      expect(res.status).toBe(200);
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { name: { contains: 'alice', mode: 'insensitive' } },
              { email: { contains: 'alice', mode: 'insensitive' } },
            ],
          },
        })
      );
    });

    it('uses default pagination when not provided', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);
      vi.mocked(prisma.user.count).mockResolvedValue(0);

      const app = createApp();
      const res = await request(app).get('/admin/users');

      expect(res.status).toBe(200);
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20,
        })
      );
    });
  });

  // ─── PATCH /admin/users/:id/block ──────────────────────

  describe('PATCH /admin/users/:id/block', () => {
    const userId = '550e8400-e29b-41d4-a716-446655440000';

    it('blocks a user', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: userId } as any);
      vi.mocked(prisma.user.update).mockResolvedValue({
        id: userId,
        isBlocked: true,
      } as any);

      const app = createApp();
      const res = await request(app)
        .patch(`/admin/users/${userId}/block`)
        .send({ isBlocked: true });

      expect(res.status).toBe(200);
      expect(res.body.user.isBlocked).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { isBlocked: true },
      });
    });

    it('unblocks a user', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: userId } as any);
      vi.mocked(prisma.user.update).mockResolvedValue({
        id: userId,
        isBlocked: false,
      } as any);

      const app = createApp();
      const res = await request(app)
        .patch(`/admin/users/${userId}/block`)
        .send({ isBlocked: false });

      expect(res.status).toBe(200);
      expect(res.body.user.isBlocked).toBe(false);
    });

    it('returns 404 for non-existent user', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const app = createApp();
      const res = await request(app)
        .patch(`/admin/users/${userId}/block`)
        .send({ isBlocked: true });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 for invalid body', async () => {
      const app = createApp();
      const res = await request(app)
        .patch(`/admin/users/${userId}/block`)
        .send({ isBlocked: 'not-a-boolean' });

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid UUID param', async () => {
      const app = createApp();
      const res = await request(app)
        .patch('/admin/users/not-a-uuid/block')
        .send({ isBlocked: true });

      expect(res.status).toBe(400);
    });
  });

  // ─── GET /admin/users/:id/progress ─────────────────────

  describe('GET /admin/users/:id/progress', () => {
    const userId = '550e8400-e29b-41d4-a716-446655440000';

    it('returns topic scores, readiness score, and attempts', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: userId,
        examDate: new Date('2025-12-01'),
      } as any);

      vi.mocked(prisma.topicScore.findMany).mockResolvedValue([
        {
          categoryId: 'cat-1',
          eloScore: 1100,
          attemptCount: 10,
          correctCount: 7,
          category: { name: 'Cardiology' },
        },
      ] as any);

      vi.mocked(prisma.attempt.findMany).mockResolvedValue([
        {
          id: 'a1',
          questionId: 'q1',
          isCorrect: true,
          durationMs: 5000,
          createdAt: new Date(),
          confidenceRating: 2,
        },
      ] as any);

      vi.mocked(calculateReadiness).mockReturnValue(65);

      const app = createApp();
      const res = await request(app).get(`/admin/users/${userId}/progress`);

      expect(res.status).toBe(200);
      expect(res.body.topicScores).toHaveLength(1);
      expect(res.body.topicScores[0].categoryName).toBe('Cardiology');
      expect(res.body.readinessScore).toBe(65);
      expect(res.body.attempts).toHaveLength(1);
      expect(calculateReadiness).toHaveBeenCalled();
    });

    it('returns 404 for non-existent user', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const app = createApp();
      const res = await request(app).get(`/admin/users/${userId}/progress`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns empty data for user with no scores or attempts', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: userId,
        examDate: null,
      } as any);
      vi.mocked(prisma.topicScore.findMany).mockResolvedValue([]);
      vi.mocked(prisma.attempt.findMany).mockResolvedValue([]);
      vi.mocked(calculateReadiness).mockReturnValue(0);

      const app = createApp();
      const res = await request(app).get(`/admin/users/${userId}/progress`);

      expect(res.status).toBe(200);
      expect(res.body.topicScores).toHaveLength(0);
      expect(res.body.readinessScore).toBe(0);
      expect(res.body.attempts).toHaveLength(0);
    });
  });

  // ─── GET /admin/reports ────────────────────────────────

  describe('GET /admin/reports', () => {
    it('returns active users, session count, and attempt volume', async () => {
      vi.mocked(prisma.attempt.groupBy).mockResolvedValue([
        { userId: 'u1' },
        { userId: 'u2' },
        { userId: 'u3' },
      ] as any);
      vi.mocked(prisma.studySession.count).mockResolvedValue(42);
      vi.mocked(prisma.attempt.count).mockResolvedValue(500);

      const app = createApp();
      const res = await request(app).get('/admin/reports');

      expect(res.status).toBe(200);
      expect(res.body.activeUsers).toBe(3);
      expect(res.body.sessionCount).toBe(42);
      expect(res.body.attemptVolume).toBe(500);
    });

    it('returns zero counts when no data exists', async () => {
      vi.mocked(prisma.attempt.groupBy).mockResolvedValue([]);
      vi.mocked(prisma.studySession.count).mockResolvedValue(0);
      vi.mocked(prisma.attempt.count).mockResolvedValue(0);

      const app = createApp();
      const res = await request(app).get('/admin/reports');

      expect(res.status).toBe(200);
      expect(res.body.activeUsers).toBe(0);
      expect(res.body.sessionCount).toBe(0);
      expect(res.body.attemptVolume).toBe(0);
    });
  });

  // ─── POST /admin/questions ─────────────────────────────

  describe('POST /admin/questions', () => {
    const validBody = {
      body: 'What is the most common cause of chest pain?',
      type: 'single_best_answer',
      difficulty: 3,
      categoryId: '550e8400-e29b-41d4-a716-446655440000',
      explanation: 'Musculoskeletal causes are most common.',
      ncpaTaskArea: 'Cardiology',
      options: [
        { body: 'Musculoskeletal', isCorrect: true, explanation: 'Most common cause' },
        { body: 'Cardiac', isCorrect: false },
      ],
    };

    it('creates a question with options in a transaction', async () => {
      const mockQuestion = {
        id: 'q1',
        ...validBody,
        isActive: true,
        createdAt: new Date(),
        options: [
          { id: 'o1', questionId: 'q1', body: 'Musculoskeletal', isCorrect: true, explanation: 'Most common cause' },
          { id: 'o2', questionId: 'q1', body: 'Cardiac', isCorrect: false, explanation: null },
        ],
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        return fn({
          question: {
            create: vi.fn().mockResolvedValue({ id: 'q1' }),
            findUnique: vi.fn().mockResolvedValue(mockQuestion),
          },
          questionOption: {
            createMany: vi.fn().mockResolvedValue({ count: 2 }),
          },
        });
      });

      const app = createApp();
      const res = await request(app)
        .post('/admin/questions')
        .send(validBody);

      expect(res.status).toBe(201);
      expect(res.body.question.id).toBe('q1');
      expect(res.body.question.options).toHaveLength(2);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('returns 400 for missing required fields', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/admin/questions')
        .send({ body: 'Incomplete question' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid difficulty', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/admin/questions')
        .send({ ...validBody, difficulty: 6 });

      expect(res.status).toBe(400);
    });

    it('returns 400 for empty options array', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/admin/questions')
        .send({ ...validBody, options: [] });

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid question type', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/admin/questions')
        .send({ ...validBody, type: 'invalid_type' });

      expect(res.status).toBe(400);
    });
  });

  // ─── PATCH /admin/questions/:id ────────────────────────

  describe('PATCH /admin/questions/:id', () => {
    const questionId = '550e8400-e29b-41d4-a716-446655440000';

    it('updates question fields', async () => {
      const mockUpdated = {
        id: questionId,
        body: 'Updated stem',
        difficulty: 4,
        isActive: true,
        options: [],
      };

      vi.mocked(prisma.question.findUnique).mockResolvedValue({ id: questionId } as any);
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        return fn({
          question: {
            update: vi.fn().mockResolvedValue(mockUpdated),
            findUnique: vi.fn().mockResolvedValue(mockUpdated),
          },
          questionOption: {
            deleteMany: vi.fn(),
            createMany: vi.fn(),
          },
        });
      });

      const app = createApp();
      const res = await request(app)
        .patch(`/admin/questions/${questionId}`)
        .send({ body: 'Updated stem', difficulty: 4 });

      expect(res.status).toBe(200);
      expect(res.body.question.body).toBe('Updated stem');
    });

    it('replaces options when provided', async () => {
      const newOptions = [
        { body: 'New option A', isCorrect: true },
        { body: 'New option B', isCorrect: false },
      ];
      const mockUpdated = {
        id: questionId,
        body: 'Stem',
        options: newOptions.map((o, i) => ({ id: `o${i}`, questionId, ...o })),
      };

      vi.mocked(prisma.question.findUnique).mockResolvedValue({ id: questionId } as any);

      let deleteManyCalledWith: any = null;
      let createManyCalledWith: any = null;

      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        return fn({
          question: {
            update: vi.fn(),
            findUnique: vi.fn().mockResolvedValue(mockUpdated),
          },
          questionOption: {
            deleteMany: vi.fn().mockImplementation((args: any) => {
              deleteManyCalledWith = args;
              return { count: 2 };
            }),
            createMany: vi.fn().mockImplementation((args: any) => {
              createManyCalledWith = args;
              return { count: 2 };
            }),
          },
        });
      });

      const app = createApp();
      const res = await request(app)
        .patch(`/admin/questions/${questionId}`)
        .send({ options: newOptions });

      expect(res.status).toBe(200);
      expect(deleteManyCalledWith).toEqual({ where: { questionId } });
      expect(createManyCalledWith.data).toHaveLength(2);
    });

    it('returns 404 for non-existent question', async () => {
      vi.mocked(prisma.question.findUnique).mockResolvedValue(null);

      const app = createApp();
      const res = await request(app)
        .patch(`/admin/questions/${questionId}`)
        .send({ body: 'Updated' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 for invalid UUID param', async () => {
      const app = createApp();
      const res = await request(app)
        .patch('/admin/questions/not-a-uuid')
        .send({ body: 'Updated' });

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid difficulty in update', async () => {
      const app = createApp();
      const res = await request(app)
        .patch(`/admin/questions/${questionId}`)
        .send({ difficulty: 0 });

      expect(res.status).toBe(400);
    });
  });

  // ─── PATCH /admin/questions/:id/deactivate ─────────────

  describe('PATCH /admin/questions/:id/deactivate', () => {
    const questionId = '550e8400-e29b-41d4-a716-446655440000';

    it('deactivates a question', async () => {
      vi.mocked(prisma.question.findUnique).mockResolvedValue({
        id: questionId,
        isActive: true,
      } as any);
      vi.mocked(prisma.question.update).mockResolvedValue({
        id: questionId,
        isActive: false,
        options: [],
      } as any);

      const app = createApp();
      const res = await request(app)
        .patch(`/admin/questions/${questionId}/deactivate`);

      expect(res.status).toBe(200);
      expect(res.body.question.isActive).toBe(false);
      expect(prisma.question.update).toHaveBeenCalledWith({
        where: { id: questionId },
        data: { isActive: false },
        include: { options: true },
      });
    });

    it('returns 404 for non-existent question', async () => {
      vi.mocked(prisma.question.findUnique).mockResolvedValue(null);

      const app = createApp();
      const res = await request(app)
        .patch(`/admin/questions/${questionId}/deactivate`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 for invalid UUID param', async () => {
      const app = createApp();
      const res = await request(app)
        .patch('/admin/questions/not-a-uuid/deactivate');

      expect(res.status).toBe(400);
    });
  });

  // ─── POST /admin/questions/import ──────────────────────

  describe('POST /admin/questions/import', () => {
    const catId = '550e8400-e29b-41d4-a716-446655440000';

    const validImportBody = {
      questions: [
        {
          body: 'What is the most common arrhythmia?',
          type: 'single_best_answer',
          difficulty: 2,
          categoryId: catId,
          explanation: 'AFib is the most common sustained arrhythmia.',
          ncpaTaskArea: 'Cardiology',
          options: [
            { body: 'Atrial fibrillation', isCorrect: true, explanation: 'Correct' },
            { body: 'Ventricular tachycardia', isCorrect: false },
          ],
        },
        {
          body: 'Which valve is most commonly affected by rheumatic fever?',
          type: 'single_best_answer',
          difficulty: 3,
          categoryId: catId,
          explanation: 'The mitral valve is most commonly affected.',
          ncpaTaskArea: 'Cardiology',
          options: [
            { body: 'Mitral valve', isCorrect: true },
            { body: 'Aortic valve', isCorrect: false },
          ],
        },
      ],
    };

    it('imports a batch of valid questions', async () => {
      vi.mocked(prisma.category.findMany).mockResolvedValue([{ id: catId }] as any);

      let createCount = 0;
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        return fn({
          question: {
            create: vi.fn().mockImplementation(() => {
              createCount++;
              return Promise.resolve({ id: `q${createCount}` });
            }),
          },
          questionOption: {
            createMany: vi.fn().mockResolvedValue({ count: 2 }),
          },
          questionMedia: {
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
        });
      });

      const app = createApp();
      const res = await request(app)
        .post('/admin/questions/import')
        .send(validImportBody);

      expect(res.status).toBe(201);
      expect(res.body.imported).toBe(2);
    });

    it('imports questions with media', async () => {
      const bodyWithMedia = {
        questions: [
          {
            ...validImportBody.questions[0],
            media: [
              {
                type: 'image',
                url: 'https://example.com/ecg.png',
                altText: 'ECG showing AFib',
                attribution: 'CC BY 4.0',
              },
            ],
          },
        ],
      };

      vi.mocked(prisma.category.findMany).mockResolvedValue([{ id: catId }] as any);

      let mediaCreateCalled = false;
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        return fn({
          question: {
            create: vi.fn().mockResolvedValue({ id: 'q1' }),
          },
          questionOption: {
            createMany: vi.fn().mockResolvedValue({ count: 2 }),
          },
          questionMedia: {
            createMany: vi.fn().mockImplementation(() => {
              mediaCreateCalled = true;
              return Promise.resolve({ count: 1 });
            }),
          },
        });
      });

      const app = createApp();
      const res = await request(app)
        .post('/admin/questions/import')
        .send(bodyWithMedia);

      expect(res.status).toBe(201);
      expect(res.body.imported).toBe(1);
      expect(mediaCreateCalled).toBe(true);
    });

    it('rejects entire batch when a category does not exist', async () => {
      vi.mocked(prisma.category.findMany).mockResolvedValue([]);

      const app = createApp();
      const res = await request(app)
        .post('/admin/questions/import')
        .send(validImportBody);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.errors).toHaveLength(2);
      expect(res.body.error.errors[0].index).toBe(0);
      expect(res.body.error.errors[1].index).toBe(1);
    });

    it('returns 400 for empty questions array', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/admin/questions/import')
        .send({ questions: [] });

      expect(res.status).toBe(400);
    });

    it('returns 400 when a question has invalid fields', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/admin/questions/import')
        .send({
          questions: [
            {
              body: 'Valid body',
              type: 'invalid_type',
              difficulty: 6,
              categoryId: 'not-a-uuid',
              explanation: '',
              ncpaTaskArea: '',
              options: [],
            },
          ],
        });

      expect(res.status).toBe(400);
    });

    it('returns 400 when body is missing questions key', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/admin/questions/import')
        .send([{ body: 'test' }]);

      expect(res.status).toBe(400);
    });
  });

  // ─── GET /admin/questions/export ───────────────────────

  describe('GET /admin/questions/export', () => {
    it('exports all active questions', async () => {
      const mockQuestions = [
        {
          body: 'Question 1',
          type: 'single_best_answer',
          difficulty: 2,
          categoryId: 'cat-1',
          explanation: 'Explanation 1',
          ncpaTaskArea: 'Cardiology',
          options: [
            { body: 'Option A', isCorrect: true, explanation: 'Correct' },
            { body: 'Option B', isCorrect: false, explanation: null },
          ],
          media: [],
        },
      ];

      vi.mocked(prisma.question.findMany).mockResolvedValue(mockQuestions as any);

      const app = createApp();
      const res = await request(app).get('/admin/questions/export');

      expect(res.status).toBe(200);
      expect(res.body.questions).toHaveLength(1);
      expect(res.body.questions[0].body).toBe('Question 1');
      expect(res.body.questions[0].options).toHaveLength(2);
      expect(res.body.questions[0].options[0].explanation).toBe('Correct');
      // Option B has null explanation, should not be included
      expect(res.body.questions[0].options[1].explanation).toBeUndefined();
      // No media key when empty
      expect(res.body.questions[0].media).toBeUndefined();
    });

    it('exports questions with media', async () => {
      const mockQuestions = [
        {
          body: 'Question with media',
          type: 'single_best_answer',
          difficulty: 3,
          categoryId: 'cat-1',
          explanation: 'Explanation',
          ncpaTaskArea: 'Cardiology',
          options: [{ body: 'A', isCorrect: true, explanation: null }],
          media: [
            {
              type: 'image',
              url: 'https://example.com/img.png',
              altText: 'ECG image',
              attribution: 'CC BY 4.0',
              caption: null,
            },
          ],
        },
      ];

      vi.mocked(prisma.question.findMany).mockResolvedValue(mockQuestions as any);

      const app = createApp();
      const res = await request(app).get('/admin/questions/export');

      expect(res.status).toBe(200);
      expect(res.body.questions[0].media).toHaveLength(1);
      expect(res.body.questions[0].media[0].altText).toBe('ECG image');
      // null caption should not be included
      expect(res.body.questions[0].media[0].caption).toBeUndefined();
    });

    it('filters by categoryId when provided', async () => {
      vi.mocked(prisma.question.findMany).mockResolvedValue([]);

      const catId = '550e8400-e29b-41d4-a716-446655440000';
      const app = createApp();
      const res = await request(app).get(`/admin/questions/export?categoryId=${catId}`);

      expect(res.status).toBe(200);
      expect(prisma.question.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true, categoryId: catId },
        })
      );
    });

    it('returns empty array when no active questions exist', async () => {
      vi.mocked(prisma.question.findMany).mockResolvedValue([]);

      const app = createApp();
      const res = await request(app).get('/admin/questions/export');

      expect(res.status).toBe(200);
      expect(res.body.questions).toEqual([]);
    });

    it('returns 400 for invalid categoryId format', async () => {
      const app = createApp();
      const res = await request(app).get('/admin/questions/export?categoryId=not-a-uuid');

      expect(res.status).toBe(400);
    });
  });

  // ─── POST /admin/cases/import ──────────────────────────

  describe('POST /admin/cases/import', () => {
    const validLitflPayload = {
      metadata: {
        version: '2.0.0',
        generated_at: '2026-03-15T15:00:00Z',
        total_cases: 1,
        total_questions: 1,
        source: 'LITFL ECG Library — litfl.com',
        license: 'CC BY-NC-SA 4.0',
      },
      cases: [
        {
          case_id: 'LITFL-ECG-0001',
          source_url: 'https://litfl.com/ecg-case-001/',
          source_type: 'top_150_ecg',
          title: 'ECG Case 001',
          authors: ['Ed Burns', 'Robert Buttner'],
          last_updated: '2024-10-08',
          keywords: ['STEMI', 'inferior'],
          clinical_context: 'Middle-aged patient presenting with chest pain.',
          sub_cases: [
            {
              sub_case_id: 'LITFL-ECG-0001-A',
              media: [
                {
                  media_id: 'LITFL-ECG-0001-IMG-01',
                  type: 'ecg_12lead',
                  url: 'https://litfl.com/wp-content/uploads/ecg001.jpg',
                  local_filename: 'LITFL-ECG-0001_01.jpg',
                  alt_text: '12-lead ECG showing ST elevation',
                  timing: 'initial',
                  attribution: 'LITFL ECG Library, CC BY-NC-SA 4.0',
                },
              ],
              questions: [
                {
                  question_id: 'LITFL-ECG-0001-A-Q1',
                  sequence: 1,
                  question_stem: 'Describe and interpret this ECG',
                  question_format: 'describe_and_interpret',
                  related_media_ids: ['LITFL-ECG-0001-IMG-01'],
                  answer: {
                    summary: 'Inferior STEMI with right ventricular infarction',
                    ecg_findings: [
                      {
                        category: 'General',
                        findings: ['Sinus rhythm, rate 84bpm', 'Normal axis'],
                      },
                    ],
                    interpretation_text: 'Classic inferior STEMI pattern.',
                    related_links: [
                      { text: 'inferior STEMI', url: 'https://litfl.com/inferior-stemi-ecg-library/' },
                    ],
                  },
                },
              ],
            },
          ],
          clinical_pearls: ['RV infarction complicates 40% of inferior STEMIs'],
          references: [{ citation: 'Burns E. ECG Case 001.' }],
          tags: {
            primary_topic: 'acute_coronary_syndromes',
            secondary_topics: ['heart_blocks'],
            litfl_category: 'ECG',
            difficulty: 'beginner',
            board_relevance: 'high',
            clinical_urgency: 'emergent',
          },
        },
      ],
    };

    it('imports a valid LITFL case payload', async () => {
      vi.mocked(prisma.category.findFirst).mockResolvedValue({ id: 'cat-1', name: 'Cardiology' } as any);

      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        return fn({
          case: {
            create: vi.fn().mockResolvedValue({ id: 'case-db-1' }),
          },
          caseTag: {
            create: vi.fn().mockResolvedValue({ id: 'tag-1' }),
          },
          clinicalPearl: {
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          caseReference: {
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          subCase: {
            create: vi.fn().mockResolvedValue({ id: 'sc-1' }),
          },
          questionMedia: {
            create: vi.fn().mockResolvedValue({ id: 'media-db-1' }),
          },
          question: {
            create: vi.fn().mockResolvedValue({ id: 'q-1' }),
          },
          ecgFinding: {
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          answerLink: {
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          questionMediaRef: {
            create: vi.fn().mockResolvedValue({ id: 'ref-1' }),
          },
        });
      });

      const app = createApp();
      const res = await request(app)
        .post('/admin/cases/import')
        .send(validLitflPayload);

      expect(res.status).toBe(201);
      expect(res.body.imported).toBe(1);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('imports with explicit defaultCategoryId', async () => {
      const catId = '550e8400-e29b-41d4-a716-446655440000';
      vi.mocked(prisma.category.findUnique).mockResolvedValue({ id: catId, name: 'ECG' } as any);

      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        return fn({
          case: { create: vi.fn().mockResolvedValue({ id: 'case-db-1' }) },
          caseTag: { create: vi.fn().mockResolvedValue({ id: 'tag-1' }) },
          clinicalPearl: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
          caseReference: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
          subCase: { create: vi.fn().mockResolvedValue({ id: 'sc-1' }) },
          questionMedia: { create: vi.fn().mockResolvedValue({ id: 'media-db-1' }) },
          question: { create: vi.fn().mockResolvedValue({ id: 'q-1' }) },
          ecgFinding: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
          answerLink: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
          questionMediaRef: { create: vi.fn().mockResolvedValue({ id: 'ref-1' }) },
        });
      });

      const app = createApp();
      const res = await request(app)
        .post('/admin/cases/import')
        .send({ ...validLitflPayload, defaultCategoryId: catId });

      expect(res.status).toBe(201);
      expect(res.body.imported).toBe(1);
    });

    it('returns 400 when defaultCategoryId does not exist', async () => {
      const catId = '550e8400-e29b-41d4-a716-446655440000';
      vi.mocked(prisma.category.findUnique).mockResolvedValue(null);

      const app = createApp();
      const res = await request(app)
        .post('/admin/cases/import')
        .send({ ...validLitflPayload, defaultCategoryId: catId });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('not found');
    });

    it('returns 400 for invalid case_id pattern', async () => {
      const invalidPayload = {
        ...validLitflPayload,
        cases: [
          {
            ...validLitflPayload.cases[0],
            case_id: 'INVALID-ID',
          },
        ],
      };

      const app = createApp();
      const res = await request(app)
        .post('/admin/cases/import')
        .send(invalidPayload);

      expect(res.status).toBe(400);
    });

    it('returns 400 for missing required metadata fields', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/admin/cases/import')
        .send({ metadata: { version: '1.0' }, cases: [] });

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid source_type', async () => {
      const invalidPayload = {
        ...validLitflPayload,
        cases: [
          {
            ...validLitflPayload.cases[0],
            source_type: 'invalid_source',
          },
        ],
      };

      const app = createApp();
      const res = await request(app)
        .post('/admin/cases/import')
        .send(invalidPayload);

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid question_format', async () => {
      const invalidPayload = {
        ...validLitflPayload,
        cases: [
          {
            ...validLitflPayload.cases[0],
            sub_cases: [
              {
                ...validLitflPayload.cases[0].sub_cases[0],
                questions: [
                  {
                    ...validLitflPayload.cases[0].sub_cases[0].questions[0],
                    question_format: 'invalid_format',
                  },
                ],
              },
            ],
          },
        ],
      };

      const app = createApp();
      const res = await request(app)
        .post('/admin/cases/import')
        .send(invalidPayload);

      expect(res.status).toBe(400);
    });
  });

  // ─── GET /admin/cases/export ───────────────────────────

  describe('GET /admin/cases/export', () => {
    const mockCaseData = [
      {
        id: 'case-db-1',
        caseId: 'LITFL-ECG-0001',
        sourceUrl: 'https://litfl.com/ecg-case-001/',
        sourceType: 'top_150_ecg',
        title: 'ECG Case 001',
        authors: ['Ed Burns'],
        lastUpdated: new Date('2024-10-08'),
        keywords: ['STEMI'],
        clinicalContext: 'Chest pain patient.',
        createdAt: new Date(),
        subCases: [
          {
            id: 'sc-1',
            subCaseId: 'LITFL-ECG-0001-A',
            subCaseLabel: null,
            subCaseContext: null,
            media: [
              {
                id: 'media-1',
                type: 'ecg_12lead',
                url: 'https://litfl.com/ecg001.jpg',
                altText: '12-lead ECG',
                attribution: 'LITFL, CC BY-NC-SA 4.0',
                caption: null,
                mediaRefId: 'LITFL-ECG-0001-IMG-01',
                localFilename: 'LITFL-ECG-0001_01.jpg',
                timing: 'initial',
              },
            ],
            questions: [
              {
                id: 'q-1',
                body: 'Describe and interpret this ECG',
                sequence: 1,
                questionFormat: 'describe_and_interpret',
                answerSummary: 'Inferior STEMI',
                interpretationText: 'Classic pattern.',
                ecgFindings: [
                  { category: 'General', findings: ['Sinus rhythm'] },
                ],
                answerLinks: [
                  { text: 'inferior STEMI', url: 'https://litfl.com/inferior-stemi/' },
                ],
                questionMediaRefs: [
                  {
                    media: {
                      id: 'media-1',
                      mediaRefId: 'LITFL-ECG-0001-IMG-01',
                    },
                  },
                ],
              },
            ],
          },
        ],
        clinicalPearls: [{ text: 'RV infarction complicates 40% of inferior STEMIs', sortOrder: 0 }],
        caseReferences: [{ citation: 'Burns E. ECG Case 001.', url: null }],
        caseTags: {
          primaryTopic: 'acute_coronary_syndromes',
          secondaryTopics: ['heart_blocks'],
          litflCategory: 'ECG',
          difficulty: 'beginner',
          boardRelevance: 'high',
          clinicalUrgency: 'emergent',
        },
      },
    ];

    it('exports all cases in LITFL JSON format', async () => {
      vi.mocked(prisma.case.findMany).mockResolvedValue(mockCaseData as any);

      const app = createApp();
      const res = await request(app).get('/admin/cases/export');

      expect(res.status).toBe(200);
      expect(res.body.metadata).toBeDefined();
      expect(res.body.metadata.version).toBe('2.0.0');
      expect(res.body.metadata.total_cases).toBe(1);
      expect(res.body.metadata.total_questions).toBe(1);
      expect(res.body.cases).toHaveLength(1);

      const exported = res.body.cases[0];
      expect(exported.case_id).toBe('LITFL-ECG-0001');
      expect(exported.source_type).toBe('top_150_ecg');
      expect(exported.title).toBe('ECG Case 001');
      expect(exported.sub_cases).toHaveLength(1);
      expect(exported.sub_cases[0].media).toHaveLength(1);
      expect(exported.sub_cases[0].questions).toHaveLength(1);
      expect(exported.sub_cases[0].questions[0].answer.summary).toBe('Inferior STEMI');
      expect(exported.sub_cases[0].questions[0].answer.ecg_findings).toHaveLength(1);
      expect(exported.sub_cases[0].questions[0].answer.interpretation_text).toBe('Classic pattern.');
      expect(exported.sub_cases[0].questions[0].answer.related_links).toHaveLength(1);
      expect(exported.clinical_pearls).toEqual(['RV infarction complicates 40% of inferior STEMIs']);
      expect(exported.references).toHaveLength(1);
      expect(exported.tags.primary_topic).toBe('acute_coronary_syndromes');
      expect(exported.tags.difficulty).toBe('beginner');
    });

    it('exports with source_type filter', async () => {
      vi.mocked(prisma.case.findMany).mockResolvedValue([]);

      const app = createApp();
      const res = await request(app).get('/admin/cases/export?source_type=top_150_ecg');

      expect(res.status).toBe(200);
      expect(prisma.case.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ sourceType: 'top_150_ecg' }),
        })
      );
    });

    it('exports with primary_topic and difficulty filters', async () => {
      vi.mocked(prisma.case.findMany).mockResolvedValue([]);

      const app = createApp();
      const res = await request(app).get(
        '/admin/cases/export?primary_topic=acute_coronary_syndromes&difficulty=beginner'
      );

      expect(res.status).toBe(200);
      expect(prisma.case.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            caseTags: {
              primaryTopic: 'acute_coronary_syndromes',
              difficulty: 'beginner',
            },
          }),
        })
      );
    });

    it('returns empty cases array when no cases exist', async () => {
      vi.mocked(prisma.case.findMany).mockResolvedValue([]);

      const app = createApp();
      const res = await request(app).get('/admin/cases/export');

      expect(res.status).toBe(200);
      expect(res.body.cases).toEqual([]);
      expect(res.body.metadata.total_cases).toBe(0);
      expect(res.body.metadata.total_questions).toBe(0);
    });

    it('returns 400 for invalid source_type filter', async () => {
      const app = createApp();
      const res = await request(app).get('/admin/cases/export?source_type=invalid');

      expect(res.status).toBe(400);
    });
  });
});
