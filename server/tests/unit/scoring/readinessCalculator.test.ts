import { describe, it, expect } from 'vitest';
import { calculateReadiness, TopicScoreInput } from '../../../src/services/readinessCalculator';

describe('readinessCalculator', () => {
  describe('calculateReadiness', () => {
    it('returns 0 for empty topic scores', () => {
      expect(calculateReadiness([], {})).toBe(0);
      expect(calculateReadiness([], { cat1: 0.5 })).toBe(0);
    });

    it('returns 100 for all scores at 1400 (max Elo)', () => {
      const scores: TopicScoreInput[] = [
        { categoryId: 'cat1', eloScore: 1400 },
        { categoryId: 'cat2', eloScore: 1400 },
        { categoryId: 'cat3', eloScore: 1400 },
      ];
      const weights: Record<string, number> = {
        cat1: 0.4,
        cat2: 0.35,
        cat3: 0.25,
      };
      expect(calculateReadiness(scores, weights)).toBe(100);
    });

    it('returns 0 for all scores at 400 (min Elo)', () => {
      const scores: TopicScoreInput[] = [
        { categoryId: 'cat1', eloScore: 400 },
        { categoryId: 'cat2', eloScore: 400 },
      ];
      const weights: Record<string, number> = {
        cat1: 0.6,
        cat2: 0.4,
      };
      expect(calculateReadiness(scores, weights)).toBe(0);
    });

    it('weighted average is correct with known weights', () => {
      const scores: TopicScoreInput[] = [
        { categoryId: 'cat1', eloScore: 900 },  // maps to ((900-400)/1000)*100 = 50
        { categoryId: 'cat2', eloScore: 1400 }, // maps to 100
      ];
      const weights: Record<string, number> = {
        cat1: 0.6,
        cat2: 0.4,
      };
      // Weighted avg = (50 * 0.6 + 100 * 0.4) / (0.6 + 0.4) = (30 + 40) / 1 = 70
      expect(calculateReadiness(scores, weights)).toBeCloseTo(70, 5);
    });

    it('exam proximity reduces score when exam is less than 30 days away', () => {
      const scores: TopicScoreInput[] = [
        { categoryId: 'cat1', eloScore: 900 },
      ];
      const weights: Record<string, number> = { cat1: 1.0 };

      const noExam = calculateReadiness(scores, weights);
      const nearExam = calculateReadiness(
        scores,
        weights,
        new Date(Date.now() + 10 * 24 * 60 * 60 * 1000) // 10 days away
      );

      // 10 days away → factor 0.9
      expect(nearExam).toBeCloseTo(noExam * 0.9, 5);
      expect(nearExam).toBeLessThan(noExam);
    });

    it('exam proximity reduces score when exam is 30-90 days away', () => {
      const scores: TopicScoreInput[] = [
        { categoryId: 'cat1', eloScore: 900 },
      ];
      const weights: Record<string, number> = { cat1: 1.0 };

      const noExam = calculateReadiness(scores, weights);
      const midExam = calculateReadiness(
        scores,
        weights,
        new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) // 60 days away
      );

      // 60 days away → factor 0.95
      expect(midExam).toBeCloseTo(noExam * 0.95, 5);
      expect(midExam).toBeLessThan(noExam);
    });

    it('no exam date means no proximity adjustment', () => {
      const scores: TopicScoreInput[] = [
        { categoryId: 'cat1', eloScore: 900 },
      ];
      const weights: Record<string, number> = { cat1: 1.0 };

      const withoutExam = calculateReadiness(scores, weights);
      const farExam = calculateReadiness(
        scores,
        weights,
        new Date(Date.now() + 120 * 24 * 60 * 60 * 1000) // 120 days away → factor 1.0
      );

      // Both should be the same since >90 days factor is 1.0
      expect(withoutExam).toBeCloseTo(farExam, 5);
      // Raw score for Elo 900: ((900-400)/1000)*100 = 50
      expect(withoutExam).toBeCloseTo(50, 5);
    });

    it('score is always clamped to 0-100', () => {
      // Elo below 400 should still clamp to 0
      const lowScores: TopicScoreInput[] = [
        { categoryId: 'cat1', eloScore: 200 },
      ];
      expect(calculateReadiness(lowScores, { cat1: 1.0 })).toBe(0);

      // Elo above 1400 should still clamp to 100
      const highScores: TopicScoreInput[] = [
        { categoryId: 'cat1', eloScore: 2000 },
      ];
      expect(calculateReadiness(highScores, { cat1: 1.0 })).toBe(100);

      // Even with exam proximity, result stays in 0-100
      const maxScores: TopicScoreInput[] = [
        { categoryId: 'cat1', eloScore: 1400 },
      ];
      const result = calculateReadiness(
        maxScores,
        { cat1: 1.0 },
        new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) // 5 days away → factor 0.9
      );
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(100);
      expect(result).toBeCloseTo(90, 5); // 100 * 0.9
    });

    it('unweighted categories get equal weight from remaining budget', () => {
      const scores: TopicScoreInput[] = [
        { categoryId: 'cat1', eloScore: 900 },  // weighted: 50 readiness
        { categoryId: 'cat2', eloScore: 1400 }, // unweighted: 100 readiness
        { categoryId: 'cat3', eloScore: 1400 }, // unweighted: 100 readiness
      ];
      // Only cat1 has a weight of 0.5, remaining 0.5 split equally among cat2 and cat3
      const weights: Record<string, number> = { cat1: 0.5 };

      // cat1: 50 * 0.5 = 25
      // cat2: 100 * 0.25 = 25
      // cat3: 100 * 0.25 = 25
      // total weight = 0.5 + 0.25 + 0.25 = 1.0
      // readiness = 75 / 1.0 = 75
      expect(calculateReadiness(scores, weights)).toBeCloseTo(75, 5);
    });

    it('handles all categories being unweighted (empty weights)', () => {
      const scores: TopicScoreInput[] = [
        { categoryId: 'cat1', eloScore: 900 },  // 50
        { categoryId: 'cat2', eloScore: 1400 }, // 100
      ];
      // No weights provided → remaining weight = 1.0, split equally
      // cat1: 50 * 0.5 = 25, cat2: 100 * 0.5 = 50
      // total weight = 1.0, readiness = 75 / 1.0 = 75
      expect(calculateReadiness(scores, {})).toBeCloseTo(75, 5);
    });

    it('handles single topic score correctly', () => {
      const scores: TopicScoreInput[] = [
        { categoryId: 'cat1', eloScore: 1000 },
      ];
      // Elo 1000 → ((1000-400)/1000)*100 = 60
      expect(calculateReadiness(scores, { cat1: 1.0 })).toBeCloseTo(60, 5);
    });
  });
});
