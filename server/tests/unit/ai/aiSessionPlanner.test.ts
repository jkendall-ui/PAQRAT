import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma
vi.mock('../../../src/lib/prisma', () => ({
  default: {
    question: { findMany: vi.fn() },
    topicScore: { findMany: vi.fn() },
    attempt: { findMany: vi.fn() },
  },
}));

// Mock claudeService
vi.mock('../../../src/services/claudeService', () => ({
  callClaudeWithRetry: vi.fn(),
}));

import prisma from '../../../src/lib/prisma';
import { callClaudeWithRetry } from '../../../src/services/claudeService';
import { planAdaptiveSession } from '../../../src/services/aiSessionPlanner';

describe('aiSessionPlanner', () => {
  const availableQuestions = [
    { id: 'q-1', categoryId: 'cat-1', difficulty: 2 },
    { id: 'q-2', categoryId: 'cat-1', difficulty: 3 },
    { id: 'q-3', categoryId: 'cat-2', difficulty: 4 },
    { id: 'q-4', categoryId: 'cat-2', difficulty: 1 },
    { id: 'q-5', categoryId: 'cat-3', difficulty: 5 },
  ];

  const topicScores = [
    {
      categoryId: 'cat-1',
      eloScore: 1050,
      attemptCount: 10,
      correctCount: 7,
      category: { name: 'Cardiovascular' },
    },
    {
      categoryId: 'cat-2',
      eloScore: 850,
      attemptCount: 10,
      correctCount: 4,
      category: { name: 'Pulmonary' },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.question.findMany).mockResolvedValue(availableQuestions as any);
    vi.mocked(prisma.topicScore.findMany).mockResolvedValue(topicScores as any);
    vi.mocked(prisma.attempt.findMany).mockResolvedValue([]);
  });

  it('returns question IDs from valid Claude response', async () => {
    vi.mocked(callClaudeWithRetry).mockResolvedValue(JSON.stringify(['q-1', 'q-3', 'q-5']));

    const result = await planAdaptiveSession('user-1', 20);

    expect(result).toEqual(['q-1', 'q-3', 'q-5']);
    expect(callClaudeWithRetry).toHaveBeenCalledTimes(1);
  });

  it('falls back to random selection when Claude returns invalid JSON', async () => {
    vi.mocked(callClaudeWithRetry).mockResolvedValue('not valid json at all');

    const result = await planAdaptiveSession('user-1', 3);

    expect(result.length).toBeLessThanOrEqual(3);
    result.forEach((id) => {
      expect(availableQuestions.some((q) => q.id === id)).toBe(true);
    });
  });

  it('falls back when Claude returns IDs not in available pool', async () => {
    vi.mocked(callClaudeWithRetry).mockResolvedValue(
      JSON.stringify(['nonexistent-1', 'nonexistent-2'])
    );

    const result = await planAdaptiveSession('user-1', 3);

    // Should fall back to random since no valid IDs
    expect(result.length).toBeLessThanOrEqual(3);
    result.forEach((id) => {
      expect(availableQuestions.some((q) => q.id === id)).toBe(true);
    });
  });

  it('returns empty array when no available questions', async () => {
    vi.mocked(prisma.question.findMany).mockResolvedValue([]);

    const result = await planAdaptiveSession('user-1', 20);

    expect(result).toEqual([]);
    expect(callClaudeWithRetry).not.toHaveBeenCalled();
  });

  it('handles Claude API errors gracefully by falling back', async () => {
    vi.mocked(callClaudeWithRetry).mockRejectedValue(new Error('API unavailable'));

    const result = await planAdaptiveSession('user-1', 3);

    expect(result.length).toBeLessThanOrEqual(3);
    result.forEach((id) => {
      expect(availableQuestions.some((q) => q.id === id)).toBe(true);
    });
  });
});
