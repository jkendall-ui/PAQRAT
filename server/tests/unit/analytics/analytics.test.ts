import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock prisma
vi.mock('../../../src/lib/prisma', () => ({
  default: {
    attempt: {
      findMany: vi.fn(),
    },
    topicScore: {
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock readinessCalculator
vi.mock('../../../src/services/readinessCalculator', () => ({
  calculateReadiness: vi.fn(),
}));

// Mock auth middleware to inject user
vi.mock('../../../src/middleware/auth', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-1', role: 'student' };
    next();
  },
}));

import prisma from '../../../src/lib/prisma';
import { calculateReadiness } from '../../../src/services/readinessCalculator';
import analyticsRouter, { getScoreBand } from '../../../src/routes/analytics';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/analytics', analyticsRouter);
  return app;
}

describe('Analytics Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /analytics/trends', () => {
    it('returns daily accuracy data', async () => {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      vi.mocked(prisma.attempt.findMany).mockResolvedValue([
        { isCorrect: true, createdAt: new Date(`${todayStr}T10:00:00Z`) },
        { isCorrect: false, createdAt: new Date(`${todayStr}T11:00:00Z`) },
        { isCorrect: true, createdAt: new Date(`${todayStr}T12:00:00Z`) },
      ] as any);

      const app = createApp();
      const res = await request(app).get('/analytics/trends');

      expect(res.status).toBe(200);
      expect(res.body.days).toBe(30);
      expect(res.body.trends).toHaveLength(1);
      expect(res.body.trends[0].date).toBe(todayStr);
      expect(res.body.trends[0].totalAttempts).toBe(3);
      expect(res.body.trends[0].correctAttempts).toBe(2);
      expect(res.body.trends[0].accuracy).toBeCloseTo(2 / 3);
    });

    it('respects days parameter', async () => {
      vi.mocked(prisma.attempt.findMany).mockResolvedValue([]);

      const app = createApp();
      const res = await request(app).get('/analytics/trends?days=7');

      expect(res.status).toBe(200);
      expect(res.body.days).toBe(7);
      expect(res.body.trends).toHaveLength(0);

      // Verify prisma was called with a date filter in the past
      const callArgs = vi.mocked(prisma.attempt.findMany).mock.calls[0][0] as any;
      const filterDate = new Date(callArgs.where.createdAt.gte);
      expect(filterDate).toBeInstanceOf(Date);
      expect(filterDate.getTime()).toBeLessThan(Date.now());
    });

    it('returns empty array when no attempts', async () => {
      vi.mocked(prisma.attempt.findMany).mockResolvedValue([]);

      const app = createApp();
      const res = await request(app).get('/analytics/trends');

      expect(res.status).toBe(200);
      expect(res.body.trends).toHaveLength(0);
      expect(res.body.days).toBe(30);
    });

    it('groups attempts by date correctly', async () => {
      const day1 = '2025-03-15';
      const day2 = '2025-03-16';

      vi.mocked(prisma.attempt.findMany).mockResolvedValue([
        { isCorrect: true, createdAt: new Date(`${day1}T10:00:00Z`) },
        { isCorrect: false, createdAt: new Date(`${day1}T11:00:00Z`) },
        { isCorrect: true, createdAt: new Date(`${day2}T09:00:00Z`) },
      ] as any);

      const app = createApp();
      const res = await request(app).get('/analytics/trends');

      expect(res.status).toBe(200);
      expect(res.body.trends).toHaveLength(2);

      const day1Trend = res.body.trends.find((t: any) => t.date === day1);
      const day2Trend = res.body.trends.find((t: any) => t.date === day2);

      expect(day1Trend.totalAttempts).toBe(2);
      expect(day1Trend.correctAttempts).toBe(1);
      expect(day1Trend.accuracy).toBe(0.5);

      expect(day2Trend.totalAttempts).toBe(1);
      expect(day2Trend.correctAttempts).toBe(1);
      expect(day2Trend.accuracy).toBe(1);
    });

    it('rejects invalid days parameter', async () => {
      const app = createApp();
      const res = await request(app).get('/analytics/trends?days=0');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects days exceeding 365', async () => {
      const app = createApp();
      const res = await request(app).get('/analytics/trends?days=366');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /analytics/summary', () => {
    it('returns correct aggregation', async () => {
      vi.mocked(prisma.attempt.findMany).mockResolvedValue([
        { isCorrect: true, durationMs: 5000 },
        { isCorrect: false, durationMs: 3000 },
        { isCorrect: true, durationMs: 4000 },
        { isCorrect: true, durationMs: 6000 },
      ] as any);

      vi.mocked(prisma.topicScore.findMany).mockResolvedValue([
        { categoryId: 'cat-1', eloScore: 1100 },
      ] as any);

      vi.mocked(prisma.user.findUnique).mockResolvedValue({ examDate: null } as any);
      vi.mocked(calculateReadiness).mockReturnValue(70);

      const app = createApp();
      const res = await request(app).get('/analytics/summary');

      expect(res.status).toBe(200);
      expect(res.body.totalAttempts).toBe(4);
      expect(res.body.correctAttempts).toBe(3);
      expect(res.body.accuracyRate).toBe(0.75);
      expect(res.body.totalStudyTimeMs).toBe(18000);
      expect(res.body.predictedScoreBand).toBe('Pass (moderate confidence)');
      expect(res.body.readinessScore).toBe(70);
    });

    it('returns 0 accuracy when no attempts', async () => {
      vi.mocked(prisma.attempt.findMany).mockResolvedValue([]);
      vi.mocked(prisma.topicScore.findMany).mockResolvedValue([]);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ examDate: null } as any);
      vi.mocked(calculateReadiness).mockReturnValue(0);

      const app = createApp();
      const res = await request(app).get('/analytics/summary');

      expect(res.status).toBe(200);
      expect(res.body.totalAttempts).toBe(0);
      expect(res.body.correctAttempts).toBe(0);
      expect(res.body.accuracyRate).toBe(0);
      expect(res.body.totalStudyTimeMs).toBe(0);
      expect(res.body.predictedScoreBand).toBe('Needs improvement');
      expect(res.body.readinessScore).toBe(0);
    });
  });
});

describe('getScoreBand', () => {
  it('returns "Pass (high confidence)" for readiness >= 80', () => {
    expect(getScoreBand(80)).toBe('Pass (high confidence)');
    expect(getScoreBand(95)).toBe('Pass (high confidence)');
    expect(getScoreBand(100)).toBe('Pass (high confidence)');
  });

  it('returns "Pass (moderate confidence)" for readiness >= 60 and < 80', () => {
    expect(getScoreBand(60)).toBe('Pass (moderate confidence)');
    expect(getScoreBand(70)).toBe('Pass (moderate confidence)');
    expect(getScoreBand(79.9)).toBe('Pass (moderate confidence)');
  });

  it('returns "Borderline" for readiness >= 40 and < 60', () => {
    expect(getScoreBand(40)).toBe('Borderline');
    expect(getScoreBand(50)).toBe('Borderline');
    expect(getScoreBand(59.9)).toBe('Borderline');
  });

  it('returns "Needs improvement" for readiness < 40', () => {
    expect(getScoreBand(0)).toBe('Needs improvement');
    expect(getScoreBand(20)).toBe('Needs improvement');
    expect(getScoreBand(39.9)).toBe('Needs improvement');
  });
});
