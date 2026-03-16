import { describe, it, expect } from 'vitest';
import { calculateNewScore, difficultyToElo } from '../../../src/services/eloCalculator';

describe('eloCalculator', () => {
  describe('calculateNewScore', () => {
    it('correct answer increases Elo', () => {
      const newElo = calculateNewScore(1000, 1000, true);
      expect(newElo).toBeGreaterThan(1000);
    });

    it('incorrect answer decreases Elo', () => {
      const newElo = calculateNewScore(1000, 1000, false);
      expect(newElo).toBeLessThan(1000);
    });

    it('beating a harder question gives bigger Elo gain', () => {
      const gainFromHard = calculateNewScore(1000, 1400, true) - 1000;
      const gainFromEasy = calculateNewScore(1000, 600, true) - 1000;
      expect(gainFromHard).toBeGreaterThan(gainFromEasy);
    });

    it('losing to an easier question gives bigger Elo loss', () => {
      const lossFromEasy = 1000 - calculateNewScore(1000, 600, false);
      const lossFromHard = 1000 - calculateNewScore(1000, 1400, false);
      expect(lossFromEasy).toBeGreaterThan(lossFromHard);
    });

    it('same Elo as question difficulty splits gain/loss evenly', () => {
      const gain = calculateNewScore(1000, 1000, true) - 1000;
      const loss = 1000 - calculateNewScore(1000, 1000, false);
      // With equal Elo, expected score is 0.5, so gain and loss should both be K/2 = 16
      expect(gain).toBe(16);
      expect(loss).toBe(16);
    });

    it('returns a rounded integer', () => {
      const result = calculateNewScore(1050, 1100, true);
      expect(Number.isInteger(result)).toBe(true);
    });
  });

  describe('difficultyToElo', () => {
    it('maps difficulty 1 to 600', () => {
      expect(difficultyToElo(1)).toBe(600);
    });

    it('maps difficulty 2 to 800', () => {
      expect(difficultyToElo(2)).toBe(800);
    });

    it('maps difficulty 3 to 1000', () => {
      expect(difficultyToElo(3)).toBe(1000);
    });

    it('maps difficulty 4 to 1200', () => {
      expect(difficultyToElo(4)).toBe(1200);
    });

    it('maps difficulty 5 to 1400', () => {
      expect(difficultyToElo(5)).toBe(1400);
    });

    it('throws for invalid difficulty 0', () => {
      expect(() => difficultyToElo(0)).toThrow('Invalid difficulty level');
    });

    it('throws for invalid difficulty 6', () => {
      expect(() => difficultyToElo(6)).toThrow('Invalid difficulty level');
    });
  });
});
