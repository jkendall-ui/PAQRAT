import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectGaps } from '../../../src/services/gapDetector';

// Mock Prisma client
vi.mock('../../../src/lib/prisma', () => {
  return {
    default: {
      attempt: {
        findMany: vi.fn(),
      },
      studySession: {
        findMany: vi.fn(),
      },
      topicScore: {
        findMany: vi.fn(),
      },
    },
  };
});

import prisma from '../../../src/lib/prisma';

const mockAttemptFindMany = vi.mocked(prisma.attempt.findMany);
const mockStudySessionFindMany = vi.mocked(prisma.studySession.findMany);
const mockTopicScoreFindMany = vi.mocked(prisma.topicScore.findMany);

describe('gapDetector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('detectGaps', () => {
    it('flags a category with >40% error rate over last 10 attempts', async () => {
      const userId = 'user-1';
      const categoryId = 'cat-cardio';

      // First call: get distinct attempted categories
      mockAttemptFindMany.mockResolvedValueOnce([
        { question: { categoryId } },
        { question: { categoryId } },
      ] as any);

      // Second call: get last 10 attempts for the category (5 correct, 5 incorrect = 50% error)
      mockAttemptFindMany.mockResolvedValueOnce([
        { isCorrect: false },
        { isCorrect: false },
        { isCorrect: false },
        { isCorrect: false },
        { isCorrect: false },
        { isCorrect: true },
        { isCorrect: true },
        { isCorrect: true },
        { isCorrect: true },
        { isCorrect: true },
      ] as any);

      // No recent sessions for Elo decline check
      mockStudySessionFindMany.mockResolvedValueOnce([]);

      const gaps = await detectGaps(userId);

      expect(gaps).toContain(categoryId);
    });

    it('does not flag a category with ≤40% error rate', async () => {
      const userId = 'user-1';
      const categoryId = 'cat-pulm';

      // First call: get distinct attempted categories
      mockAttemptFindMany.mockResolvedValueOnce([
        { question: { categoryId } },
      ] as any);

      // Second call: 3 incorrect out of 10 = 30% error rate (≤40%)
      mockAttemptFindMany.mockResolvedValueOnce([
        { isCorrect: false },
        { isCorrect: false },
        { isCorrect: false },
        { isCorrect: true },
        { isCorrect: true },
        { isCorrect: true },
        { isCorrect: true },
        { isCorrect: true },
        { isCorrect: true },
        { isCorrect: true },
      ] as any);

      // No recent sessions
      mockStudySessionFindMany.mockResolvedValueOnce([]);

      const gaps = await detectGaps(userId);

      expect(gaps).not.toContain(categoryId);
      expect(gaps).toHaveLength(0);
    });

    it('flags a category with declining Elo over last 3 sessions', async () => {
      const userId = 'user-1';
      const categoryId = 'cat-neuro';

      // No attempted categories for error rate check (empty)
      mockAttemptFindMany.mockResolvedValueOnce([] as any);

      // 3 recent sessions (newest first)
      mockStudySessionFindMany.mockResolvedValueOnce([
        { id: 'session-3', startedAt: new Date('2024-01-03') },
        { id: 'session-2', startedAt: new Date('2024-01-02') },
        { id: 'session-1', startedAt: new Date('2024-01-01') },
      ] as any);

      // Topic scores for the user
      mockTopicScoreFindMany.mockResolvedValueOnce([
        { categoryId, eloScore: 900 },
      ] as any);

      // Session 3 (newest): 1 correct out of 4 = 25% accuracy
      mockAttemptFindMany.mockResolvedValueOnce([
        { isCorrect: true },
        { isCorrect: false },
        { isCorrect: false },
        { isCorrect: false },
      ] as any);

      // Session 2: 2 correct out of 4 = 50% accuracy
      mockAttemptFindMany.mockResolvedValueOnce([
        { isCorrect: true },
        { isCorrect: true },
        { isCorrect: false },
        { isCorrect: false },
      ] as any);

      // Session 1 (oldest): 3 correct out of 4 = 75% accuracy
      mockAttemptFindMany.mockResolvedValueOnce([
        { isCorrect: true },
        { isCorrect: true },
        { isCorrect: true },
        { isCorrect: false },
      ] as any);

      const gaps = await detectGaps(userId);

      expect(gaps).toContain(categoryId);
    });

    it('returns empty array for user with no attempts', async () => {
      const userId = 'user-new';

      // No attempted categories
      mockAttemptFindMany.mockResolvedValueOnce([] as any);

      // No sessions
      mockStudySessionFindMany.mockResolvedValueOnce([]);

      const gaps = await detectGaps(userId);

      expect(gaps).toEqual([]);
    });

    it('does not produce duplicates when both conditions flag the same category', async () => {
      const userId = 'user-1';
      const categoryId = 'cat-cardio';

      // Error rate check: category with >40% error rate
      mockAttemptFindMany.mockResolvedValueOnce([
        { question: { categoryId } },
      ] as any);

      // 6 incorrect out of 10 = 60% error rate
      mockAttemptFindMany.mockResolvedValueOnce([
        { isCorrect: false },
        { isCorrect: false },
        { isCorrect: false },
        { isCorrect: false },
        { isCorrect: false },
        { isCorrect: false },
        { isCorrect: true },
        { isCorrect: true },
        { isCorrect: true },
        { isCorrect: true },
      ] as any);

      // Elo decline check: 3 sessions
      mockStudySessionFindMany.mockResolvedValueOnce([
        { id: 'session-3', startedAt: new Date('2024-01-03') },
        { id: 'session-2', startedAt: new Date('2024-01-02') },
        { id: 'session-1', startedAt: new Date('2024-01-01') },
      ] as any);

      // Same category in topic scores
      mockTopicScoreFindMany.mockResolvedValueOnce([
        { categoryId, eloScore: 850 },
      ] as any);

      // Session 3 (newest): 20% accuracy — declining
      mockAttemptFindMany.mockResolvedValueOnce([
        { isCorrect: true },
        { isCorrect: false },
        { isCorrect: false },
        { isCorrect: false },
        { isCorrect: false },
      ] as any);

      // Session 2: 40% accuracy
      mockAttemptFindMany.mockResolvedValueOnce([
        { isCorrect: true },
        { isCorrect: true },
        { isCorrect: false },
        { isCorrect: false },
        { isCorrect: false },
      ] as any);

      // Session 1 (oldest): 80% accuracy
      mockAttemptFindMany.mockResolvedValueOnce([
        { isCorrect: true },
        { isCorrect: true },
        { isCorrect: true },
        { isCorrect: true },
        { isCorrect: false },
      ] as any);

      const gaps = await detectGaps(userId);

      // Should contain the category only once (no duplicates)
      expect(gaps.filter((id) => id === categoryId)).toHaveLength(1);
      expect(gaps).toContain(categoryId);
    });
  });
});
