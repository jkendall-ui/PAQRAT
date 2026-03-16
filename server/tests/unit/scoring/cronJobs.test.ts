import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks (vi.mock factories are hoisted above imports) ──
const mockPrisma = vi.hoisted(() => ({
  topicScore: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  attempt: {
    findMany: vi.fn(),
  },
}));

const scheduledCallbacks = vi.hoisted(() => {
  const cbs: Array<{ expression: string; callback: () => Promise<void> }> = [];
  return cbs;
});

vi.mock('../../../src/lib/prisma', () => ({
  default: mockPrisma,
}));

vi.mock('node-cron', () => ({
  default: {
    schedule: (expression: string, callback: () => Promise<void>) => {
      scheduledCallbacks.push({ expression, callback });
    },
  },
}));

import { runEloRecalculation } from '../../../src/cron/eloRecalculation';
import { runSpacedRepetitionDecay } from '../../../src/cron/spacedRepetitionDecay';
import { runAnalyticsRollup } from '../../../src/cron/analyticsRollup';
import { registerCronJobs, getLastRunTimes } from '../../../src/cron';

beforeEach(() => {
  vi.clearAllMocks();
  scheduledCallbacks.length = 0;
});

// ── Elo Recalculation ────────────────────────────────────
describe('runEloRecalculation', () => {
  it('replays attempts and recalculates Elo from 1000', async () => {
    const topicScore = {
      id: 'ts-1',
      userId: 'user-1',
      categoryId: 'cat-1',
      eloScore: 900,
      attemptCount: 0,
      correctCount: 0,
    };

    mockPrisma.topicScore.findMany.mockResolvedValue([topicScore]);

    // Two attempts: first correct (difficulty 3 → Elo 1000), second incorrect (difficulty 4 → Elo 1200)
    mockPrisma.attempt.findMany.mockResolvedValue([
      {
        isCorrect: true,
        question: { difficulty: 3, categoryId: 'cat-1' },
        createdAt: new Date('2024-01-01'),
      },
      {
        isCorrect: false,
        question: { difficulty: 4, categoryId: 'cat-1' },
        createdAt: new Date('2024-01-02'),
      },
    ]);

    mockPrisma.topicScore.update.mockResolvedValue({});

    const count = await runEloRecalculation();

    expect(count).toBe(1);
    expect(mockPrisma.topicScore.update).toHaveBeenCalledOnce();

    const updateCall = mockPrisma.topicScore.update.mock.calls[0][0];
    expect(updateCall.where.id).toBe('ts-1');
    expect(updateCall.data.attemptCount).toBe(2);
    expect(updateCall.data.correctCount).toBe(1);
    // Recalculated from 1000, not the old value of 900
    expect(updateCall.data.eloScore).not.toBe(900);
    expect(typeof updateCall.data.eloScore).toBe('number');
  });

  it('handles topic score with no attempts — resets to 1000', async () => {
    mockPrisma.topicScore.findMany.mockResolvedValue([
      { id: 'ts-2', userId: 'user-2', categoryId: 'cat-2', eloScore: 1100 },
    ]);
    mockPrisma.attempt.findMany.mockResolvedValue([]);
    mockPrisma.topicScore.update.mockResolvedValue({});

    const count = await runEloRecalculation();

    expect(count).toBe(1);
    const updateCall = mockPrisma.topicScore.update.mock.calls[0][0];
    expect(updateCall.data.eloScore).toBe(1000);
    expect(updateCall.data.attemptCount).toBe(0);
    expect(updateCall.data.correctCount).toBe(0);
  });
});

// ── Spaced Repetition Decay ──────────────────────────────
describe('runSpacedRepetitionDecay', () => {
  it('applies decay based on days since last review', async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    mockPrisma.topicScore.findMany.mockResolvedValue([
      {
        id: 'ts-1',
        userId: 'user-1',
        categoryId: 'cat-1',
        eloScore: 1000,
        lastReviewedAt: threeDaysAgo,
      },
    ]);
    mockPrisma.topicScore.update.mockResolvedValue({});

    const count = await runSpacedRepetitionDecay();

    expect(count).toBe(1);
    const updateCall = mockPrisma.topicScore.update.mock.calls[0][0];
    // 1000 * 0.995^3 ≈ 985.07
    expect(updateCall.data.eloScore).toBeCloseTo(1000 * Math.pow(0.995, 3), 0);
  });

  it('respects the minimum score floor of 400', async () => {
    const longAgo = new Date(Date.now() - 10000 * 24 * 60 * 60 * 1000);

    mockPrisma.topicScore.findMany.mockResolvedValue([
      {
        id: 'ts-2',
        userId: 'user-2',
        categoryId: 'cat-2',
        eloScore: 500,
        lastReviewedAt: longAgo,
      },
    ]);
    mockPrisma.topicScore.update.mockResolvedValue({});

    await runSpacedRepetitionDecay();

    const updateCall = mockPrisma.topicScore.update.mock.calls[0][0];
    expect(updateCall.data.eloScore).toBe(400);
  });

  it('only queries topic scores with lastReviewedAt set', async () => {
    mockPrisma.topicScore.findMany.mockResolvedValue([]);

    await runSpacedRepetitionDecay();

    expect(mockPrisma.topicScore.findMany).toHaveBeenCalledWith({
      where: { lastReviewedAt: { not: null } },
    });
  });
});

// ── Analytics Rollup ─────────────────────────────────────
describe('runAnalyticsRollup', () => {
  it('runs without error (placeholder)', async () => {
    await expect(runAnalyticsRollup()).resolves.toBeUndefined();
  });
});

// ── Cron Registration ────────────────────────────────────
describe('registerCronJobs', () => {
  it('schedules jobs at 2 AM and 3 AM UTC', () => {
    registerCronJobs();

    expect(scheduledCallbacks).toHaveLength(2);
    expect(scheduledCallbacks[0].expression).toBe('0 2 * * *');
    expect(scheduledCallbacks[1].expression).toBe('0 3 * * *');
  });
});

// ── getLastRunTimes ──────────────────────────────────────
describe('getLastRunTimes', () => {
  it('returns a Map', () => {
    const times = getLastRunTimes();
    expect(times).toBeInstanceOf(Map);
  });
});
