import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock prisma
vi.mock('../../../src/lib/prisma', () => ({
  default: {
    topicScore: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    category: {
      findUnique: vi.fn(),
    },
    attempt: {
      findMany: vi.fn(),
    },
    studySession: {
      findMany: vi.fn(),
    },
  },
}));

// Mock readinessCalculator
vi.mock('../../../src/services/readinessCalculator', () => ({
  calculateReadiness: vi.fn(),
}));

// Mock gapDetector
vi.mock('../../../src/services/gapDetector', () => ({
  detectGaps: vi.fn(),
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
import { detectGaps } from '../../../src/services/gapDetector';
import progressRouter, { calculateStreak, getMasteryLevel } from '../../../src/routes/progress';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/progress', progressRouter);
  return app;
}

describe('Progress Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /progress/scores', () => {
    it('returns topic scores and readiness score', async () => {
      const topicScores = [
        {
          id: 'ts-1',
          userId: 'user-1',
          categoryId: 'cat-1',
          eloScore: 1100,
          attemptCount: 10,
          correctCount: 7,
          decayFactor: 1.0,
          lastReviewedAt: null,
          category: { name: 'Cardiology' },
        },
        {
          id: 'ts-2',
          userId: 'user-1',
          categoryId: 'cat-2',
          eloScore: 900,
          attemptCount: 5,
          correctCount: 3,
          decayFactor: 1.0,
          lastReviewedAt: null,
          category: { name: 'Pulmonary' },
        },
      ];

      vi.mocked(prisma.topicScore.findMany).mockResolvedValue(topicScores as any);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        examDate: new Date('2025-12-01'),
      } as any);
      vi.mocked(calculateReadiness).mockReturnValue(72.5);

      const app = createApp();
      const res = await request(app).get('/progress/scores');

      expect(res.status).toBe(200);
      expect(res.body.topicScores).toHaveLength(2);
      expect(res.body.readinessScore).toBe(72.5);
      expect(calculateReadiness).toHaveBeenCalledWith(
        [
          { categoryId: 'cat-1', eloScore: 1100 },
          { categoryId: 'cat-2', eloScore: 900 },
        ],
        { 'cat-1': 0.5, 'cat-2': 0.5 },
        expect.any(Date)
      );
    });

    it('returns readiness 0 when no topic scores exist', async () => {
      vi.mocked(prisma.topicScore.findMany).mockResolvedValue([]);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ examDate: null } as any);
      vi.mocked(calculateReadiness).mockReturnValue(0);

      const app = createApp();
      const res = await request(app).get('/progress/scores');

      expect(res.status).toBe(200);
      expect(res.body.topicScores).toHaveLength(0);
      expect(res.body.readinessScore).toBe(0);
    });
  });

  describe('GET /progress/heatmap', () => {
    it('returns categories with mastery levels', async () => {
      const topicScores = [
        {
          id: 'ts-1',
          userId: 'user-1',
          categoryId: 'cat-1',
          eloScore: 1300,
          attemptCount: 20,
          correctCount: 16,
          category: { name: 'Cardiology' },
        },
        {
          id: 'ts-2',
          userId: 'user-1',
          categoryId: 'cat-2',
          eloScore: 500,
          attemptCount: 3,
          correctCount: 1,
          category: { name: 'Pulmonary' },
        },
      ];

      vi.mocked(prisma.topicScore.findMany).mockResolvedValue(topicScores as any);

      const app = createApp();
      const res = await request(app).get('/progress/heatmap');

      expect(res.status).toBe(200);
      expect(res.body.categories).toHaveLength(2);
      expect(res.body.categories[0]).toEqual({
        categoryId: 'cat-1',
        categoryName: 'Cardiology',
        eloScore: 1300,
        masteryLevel: 'expert',
        attemptCount: 20,
        correctCount: 16,
      });
      expect(res.body.categories[1]).toEqual({
        categoryId: 'cat-2',
        categoryName: 'Pulmonary',
        eloScore: 500,
        masteryLevel: 'novice',
        attemptCount: 3,
        correctCount: 1,
      });
    });
  });

  describe('GET /progress/gaps', () => {
    it('returns gap categories with details', async () => {
      vi.mocked(detectGaps).mockResolvedValue(['cat-1']);
      vi.mocked(prisma.category.findUnique).mockResolvedValue({ name: 'Cardiology' } as any);
      vi.mocked(prisma.topicScore.findUnique).mockResolvedValue({ eloScore: 750 } as any);
      vi.mocked(prisma.attempt.findMany).mockResolvedValue([
        { isCorrect: false },
        { isCorrect: false },
        { isCorrect: true },
        { isCorrect: false },
        { isCorrect: true },
        { isCorrect: false },
        { isCorrect: false },
        { isCorrect: true },
        { isCorrect: false },
        { isCorrect: false },
      ] as any);

      const app = createApp();
      const res = await request(app).get('/progress/gaps');

      expect(res.status).toBe(200);
      expect(res.body.gaps).toHaveLength(1);
      expect(res.body.gaps[0].categoryId).toBe('cat-1');
      expect(res.body.gaps[0].categoryName).toBe('Cardiology');
      expect(res.body.gaps[0].eloScore).toBe(750);
      expect(res.body.gaps[0].errorRate).toBe(0.7);
    });

    it('returns empty gaps when no categories flagged', async () => {
      vi.mocked(detectGaps).mockResolvedValue([]);

      const app = createApp();
      const res = await request(app).get('/progress/gaps');

      expect(res.status).toBe(200);
      expect(res.body.gaps).toHaveLength(0);
    });
  });

  describe('GET /progress/streak', () => {
    it('returns streak data with sessions', async () => {
      const today = new Date();
      const yesterday = new Date(Date.now() - 86400000);
      const twoDaysAgo = new Date(Date.now() - 2 * 86400000);

      vi.mocked(prisma.studySession.findMany).mockResolvedValue([
        { startedAt: today },
        { startedAt: yesterday },
        { startedAt: twoDaysAgo },
      ] as any);

      const app = createApp();
      const res = await request(app).get('/progress/streak');

      expect(res.status).toBe(200);
      expect(res.body.currentStreak).toBeGreaterThanOrEqual(3);
      expect(res.body.longestStreak).toBeGreaterThanOrEqual(3);
      expect(res.body.lastStudyDate).toBeTruthy();
    });

    it('returns 0 streak when no sessions exist', async () => {
      vi.mocked(prisma.studySession.findMany).mockResolvedValue([]);

      const app = createApp();
      const res = await request(app).get('/progress/streak');

      expect(res.status).toBe(200);
      expect(res.body.currentStreak).toBe(0);
      expect(res.body.longestStreak).toBe(0);
      expect(res.body.lastStudyDate).toBeNull();
    });
  });
});


describe('calculateStreak', () => {
  it('returns 0 for empty session dates', () => {
    const result = calculateStreak([]);
    expect(result.currentStreak).toBe(0);
    expect(result.longestStreak).toBe(0);
  });

  it('returns streak of 1 for a single session today', () => {
    const result = calculateStreak([new Date()]);
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(1);
  });

  it('counts consecutive days as a streak', () => {
    const today = new Date();
    const yesterday = new Date(Date.now() - 86400000);
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000);

    const result = calculateStreak([today, yesterday, twoDaysAgo]);
    expect(result.currentStreak).toBe(3);
    expect(result.longestStreak).toBe(3);
  });

  it('grace day: single-day gap does not break streak', () => {
    // Studied today, skipped yesterday, studied day before
    const today = new Date();
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000);

    const result = calculateStreak([today, twoDaysAgo]);
    expect(result.currentStreak).toBe(2);
    expect(result.longestStreak).toBe(2);
  });

  it('two-day gap breaks the streak', () => {
    // Studied today, gap of 3 days (diffDays = 3), studied 3 days ago
    const today = new Date();
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000);

    const result = calculateStreak([today, threeDaysAgo]);
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(1);
  });

  it('returns 0 current streak if last study was more than 1 day ago', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000);
    const fourDaysAgo = new Date(Date.now() - 4 * 86400000);

    const result = calculateStreak([threeDaysAgo, fourDaysAgo]);
    expect(result.currentStreak).toBe(0);
    expect(result.longestStreak).toBe(2);
  });

  it('deduplicates multiple sessions on the same day', () => {
    const today1 = new Date();
    const today2 = new Date();
    const yesterday = new Date(Date.now() - 86400000);

    const result = calculateStreak([today1, today2, yesterday]);
    expect(result.currentStreak).toBe(2);
    expect(result.longestStreak).toBe(2);
  });

  it('handles grace day in the middle of a longer streak', () => {
    // Mon, (skip Tue), Wed, Thu, Fri — streak should be 4 with grace day
    const fri = new Date();
    const thu = new Date(Date.now() - 86400000);
    const wed = new Date(Date.now() - 2 * 86400000);
    // skip Tue
    const mon = new Date(Date.now() - 4 * 86400000);

    const result = calculateStreak([fri, thu, wed, mon]);
    expect(result.currentStreak).toBe(4);
    expect(result.longestStreak).toBe(4);
  });
});

describe('getMasteryLevel', () => {
  it('returns novice for scores below 600', () => {
    expect(getMasteryLevel(400)).toBe('novice');
    expect(getMasteryLevel(599)).toBe('novice');
  });

  it('returns developing for scores 600-799', () => {
    expect(getMasteryLevel(600)).toBe('developing');
    expect(getMasteryLevel(799)).toBe('developing');
  });

  it('returns competent for scores 800-999', () => {
    expect(getMasteryLevel(800)).toBe('competent');
    expect(getMasteryLevel(999)).toBe('competent');
  });

  it('returns proficient for scores 1000-1199', () => {
    expect(getMasteryLevel(1000)).toBe('proficient');
    expect(getMasteryLevel(1199)).toBe('proficient');
  });

  it('returns expert for scores 1200+', () => {
    expect(getMasteryLevel(1200)).toBe('expert');
    expect(getMasteryLevel(1500)).toBe('expert');
  });
});
