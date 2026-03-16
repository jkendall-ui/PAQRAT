import { describe, it, expect } from 'vitest';
import { applyDecay } from '../../../src/services/decayCalculator';

describe('decayCalculator', () => {
  describe('applyDecay', () => {
    it('returns the same score when daysSinceReview is 0', () => {
      expect(applyDecay(1000, 0)).toBe(1000);
      expect(applyDecay(500, 0)).toBe(500);
      expect(applyDecay(1400, 0)).toBe(1400);
    });

    it('decreases score with positive daysSinceReview', () => {
      expect(applyDecay(1000, 1)).toBeLessThan(1000);
      expect(applyDecay(1000, 10)).toBeLessThan(1000);
      expect(applyDecay(800, 5)).toBeLessThan(800);
    });

    it('never goes below the 400 floor', () => {
      expect(applyDecay(1000, 10000)).toBe(400);
      expect(applyDecay(500, 5000)).toBe(400);
      expect(applyDecay(401, 1000)).toBe(400);
    });

    it('decay is monotonically increasing with time since review', () => {
      const score = 1000;
      const decay1 = applyDecay(score, 1);
      const decay10 = applyDecay(score, 10);
      const decay30 = applyDecay(score, 30);
      const decay100 = applyDecay(score, 100);

      // More days → lower score (more decay)
      expect(decay1).toBeGreaterThan(decay10);
      expect(decay10).toBeGreaterThan(decay30);
      expect(decay30).toBeGreaterThan(decay100);
    });

    it('large daysSinceReview still respects the 400 floor', () => {
      expect(applyDecay(1000, 100000)).toBe(400);
      expect(applyDecay(1400, 50000)).toBe(400);
    });

    it('specific calculation: 1000 * 0.995^30 ≈ 860.47', () => {
      const result = applyDecay(1000, 30);
      const expected = 1000 * Math.pow(0.995, 30);
      expect(result).toBeCloseTo(expected, 5);
      expect(result).toBeCloseTo(860.47, 0);
    });

    it('returns 400 when currentScore is at the floor', () => {
      expect(applyDecay(400, 0)).toBe(400);
      expect(applyDecay(400, 10)).toBe(400);
    });
  });
});
