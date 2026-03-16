import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock prisma
vi.mock('../../../src/lib/prisma', () => ({
  default: {
    studySession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    question: {
      findMany: vi.fn(),
    },
  },
}));

// Mock diagnosticService
vi.mock('../../../src/services/diagnosticService', () => ({
  canStartAdvancedSession: vi.fn(),
  generateDiagnosticQuestions: vi.fn(),
  initializeTopicScores: vi.fn(),
}));

// Mock aiSessionPlanner
vi.mock('../../../src/services/aiSessionPlanner', () => ({
  planAdaptiveSession: vi.fn(),
}));

// Mock auth middleware to inject user
vi.mock('../../../src/middleware/auth', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-1', role: 'student' };
    next();
  },
}));

import prisma from '../../../src/lib/prisma';
import { canStartAdvancedSession, generateDiagnosticQuestions, initializeTopicScores } from '../../../src/services/diagnosticService';
import { planAdaptiveSession } from '../../../src/services/aiSessionPlanner';
import sessionsRouter from '../../../src/routes/sessions';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/sessions', sessionsRouter);
  return app;
}

describe('Sessions Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /sessions', () => {
    it('creates a diagnostic session and returns question IDs', async () => {
      const questionIds = ['q-1', 'q-2', 'q-3'];
      vi.mocked(generateDiagnosticQuestions).mockResolvedValue(questionIds);
      vi.mocked(prisma.studySession.create).mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        mode: 'adaptive',
        startedAt: new Date(),
        endedAt: null,
        aiPlan: { diagnostic: true },
      });

      const app = createApp();
      const res = await request(app)
        .post('/sessions')
        .send({ mode: 'diagnostic' });

      expect(res.status).toBe(201);
      expect(res.body.session.id).toBe('session-1');
      expect(res.body.questionIds).toEqual(questionIds);
      expect(generateDiagnosticQuestions).toHaveBeenCalledWith('user-1');
    });

    it('creates an adaptive session with AI-planned questions when diagnostic completed', async () => {
      vi.mocked(canStartAdvancedSession).mockResolvedValue(true);
      vi.mocked(planAdaptiveSession).mockResolvedValue(
        Array.from({ length: 20 }, (_, i) => `q-${i}`)
      );
      vi.mocked(prisma.studySession.create).mockResolvedValue({
        id: 'session-2',
        userId: 'user-1',
        mode: 'adaptive',
        startedAt: new Date(),
        endedAt: null,
        aiPlan: null,
      });

      const app = createApp();
      const res = await request(app)
        .post('/sessions')
        .send({ mode: 'adaptive' });

      expect(res.status).toBe(201);
      expect(res.body.questionIds.length).toBe(20);
      expect(planAdaptiveSession).toHaveBeenCalledWith('user-1', 20);
    });

    it('returns 403 for adaptive mode without diagnostic completion', async () => {
      vi.mocked(canStartAdvancedSession).mockResolvedValue(false);

      const app = createApp();
      const res = await request(app)
        .post('/sessions')
        .send({ mode: 'adaptive' });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toBe('Complete the diagnostic assessment first');
    });

    it('returns 403 for exam_simulation mode without diagnostic completion', async () => {
      vi.mocked(canStartAdvancedSession).mockResolvedValue(false);

      const app = createApp();
      const res = await request(app)
        .post('/sessions')
        .send({ mode: 'exam_simulation' });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toBe('Complete the diagnostic assessment first');
    });

    it('creates an exam_simulation session with up to 120 questions', async () => {
      vi.mocked(canStartAdvancedSession).mockResolvedValue(true);
      vi.mocked(prisma.question.findMany).mockResolvedValue(
        Array.from({ length: 200 }, (_, i) => ({ id: `q-${i}` })) as any
      );
      vi.mocked(prisma.studySession.create).mockResolvedValue({
        id: 'session-3',
        userId: 'user-1',
        mode: 'exam_simulation',
        startedAt: new Date(),
        endedAt: null,
        aiPlan: null,
      });

      const app = createApp();
      const res = await request(app)
        .post('/sessions')
        .send({ mode: 'exam_simulation' });

      expect(res.status).toBe(201);
      expect(res.body.questionIds.length).toBe(120);
    });

    it('creates a weak_spot_sprint session with up to 10 questions from category', async () => {
      vi.mocked(prisma.question.findMany).mockResolvedValue(
        Array.from({ length: 15 }, (_, i) => ({ id: `q-cat-${i}` })) as any
      );
      vi.mocked(prisma.studySession.create).mockResolvedValue({
        id: 'session-4',
        userId: 'user-1',
        mode: 'weak_spot_sprint',
        startedAt: new Date(),
        endedAt: null,
        aiPlan: null,
      });

      const app = createApp();
      const res = await request(app)
        .post('/sessions')
        .send({ mode: 'weak_spot_sprint', categoryId: '550e8400-e29b-41d4-a716-446655440000' });

      expect(res.status).toBe(201);
      expect(res.body.questionIds.length).toBe(10);
      expect(prisma.question.findMany).toHaveBeenCalledWith({
        where: { isActive: true, categoryId: '550e8400-e29b-41d4-a716-446655440000' },
        select: { id: true },
      });
    });

    it('returns 400 for weak_spot_sprint without categoryId', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/sessions')
        .send({ mode: 'weak_spot_sprint' });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /sessions/:id', () => {
    it('updates endedAt on an owned session', async () => {
      const endedAt = new Date().toISOString();
      vi.mocked(prisma.studySession.findUnique).mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        mode: 'adaptive',
        startedAt: new Date(),
        endedAt: null,
        aiPlan: null,
      });
      vi.mocked(prisma.studySession.update).mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        mode: 'adaptive',
        startedAt: new Date(),
        endedAt: new Date(endedAt),
        aiPlan: null,
      });

      const app = createApp();
      const res = await request(app)
        .patch('/sessions/550e8400-e29b-41d4-a716-446655440000')
        .send({ endedAt });

      expect(res.status).toBe(200);
      expect(res.body.session.id).toBe('session-1');
    });

    it('returns 404 for non-owned session', async () => {
      vi.mocked(prisma.studySession.findUnique).mockResolvedValue({
        id: 'session-1',
        userId: 'user-other',
        mode: 'adaptive',
        startedAt: new Date(),
        endedAt: null,
        aiPlan: null,
      });

      const app = createApp();
      const res = await request(app)
        .patch('/sessions/550e8400-e29b-41d4-a716-446655440000')
        .send({ endedAt: new Date().toISOString() });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 for non-existent session', async () => {
      vi.mocked(prisma.studySession.findUnique).mockResolvedValue(null);

      const app = createApp();
      const res = await request(app)
        .patch('/sessions/550e8400-e29b-41d4-a716-446655440000')
        .send({ endedAt: new Date().toISOString() });

      expect(res.status).toBe(404);
    });

    it('calls initializeTopicScores when ending a diagnostic session', async () => {
      const endedAt = new Date().toISOString();
      vi.mocked(prisma.studySession.findUnique).mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        mode: 'adaptive',
        startedAt: new Date(),
        endedAt: null,
        aiPlan: { diagnostic: true },
      });
      vi.mocked(prisma.studySession.update).mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        mode: 'adaptive',
        startedAt: new Date(),
        endedAt: new Date(endedAt),
        aiPlan: { diagnostic: true },
      });
      vi.mocked(initializeTopicScores).mockResolvedValue(undefined);

      const app = createApp();
      const res = await request(app)
        .patch('/sessions/550e8400-e29b-41d4-a716-446655440000')
        .send({ endedAt });

      expect(res.status).toBe(200);
      expect(initializeTopicScores).toHaveBeenCalledWith('user-1');
    });
  });

  describe('GET /sessions', () => {
    it('returns paginated sessions for the authenticated user', async () => {
      const sessions = [
        { id: 's-1', userId: 'user-1', mode: 'adaptive', startedAt: new Date(), endedAt: null, aiPlan: null },
        { id: 's-2', userId: 'user-1', mode: 'exam_simulation', startedAt: new Date(), endedAt: null, aiPlan: null },
      ];
      vi.mocked(prisma.studySession.findMany).mockResolvedValue(sessions as any);
      vi.mocked(prisma.studySession.count).mockResolvedValue(2);

      const app = createApp();
      const res = await request(app)
        .get('/sessions?page=1&limit=20');

      expect(res.status).toBe(200);
      expect(res.body.sessions).toHaveLength(2);
      expect(res.body.total).toBe(2);
    });

    it('applies pagination correctly', async () => {
      vi.mocked(prisma.studySession.findMany).mockResolvedValue([]);
      vi.mocked(prisma.studySession.count).mockResolvedValue(25);

      const app = createApp();
      const res = await request(app)
        .get('/sessions?page=2&limit=10');

      expect(res.status).toBe(200);
      expect(prisma.studySession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 })
      );
    });
  });

  describe('GET /sessions/:id', () => {
    it('returns session with attempts for owned session', async () => {
      const attempts = [
        { id: 'a-1', questionId: 'q-1', isCorrect: true },
        { id: 'a-2', questionId: 'q-2', isCorrect: false },
      ];
      vi.mocked(prisma.studySession.findUnique).mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        mode: 'adaptive',
        startedAt: new Date(),
        endedAt: null,
        aiPlan: { questionIds: [] },
        attempts,
      } as any);

      const app = createApp();
      const res = await request(app)
        .get('/sessions/550e8400-e29b-41d4-a716-446655440000');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('session-1');
      expect(res.body.questions).toEqual([]);
      expect(res.body.attempts).toHaveLength(2);
    });

    it('returns 404 for non-owned session', async () => {
      vi.mocked(prisma.studySession.findUnique).mockResolvedValue({
        id: 'session-1',
        userId: 'user-other',
        mode: 'adaptive',
        startedAt: new Date(),
        endedAt: null,
        aiPlan: null,
        attempts: [],
      } as any);

      const app = createApp();
      const res = await request(app)
        .get('/sessions/550e8400-e29b-41d4-a716-446655440000');

      expect(res.status).toBe(404);
    });

    it('returns 404 for non-existent session', async () => {
      vi.mocked(prisma.studySession.findUnique).mockResolvedValue(null);

      const app = createApp();
      const res = await request(app)
        .get('/sessions/550e8400-e29b-41d4-a716-446655440000');

      expect(res.status).toBe(404);
    });
  });
});
