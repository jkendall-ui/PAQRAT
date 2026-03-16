import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma
vi.mock('../../../src/lib/prisma', () => {
  return {
    default: {
      studySession: {
        findFirst: vi.fn(),
      },
      category: {
        findMany: vi.fn(),
      },
      question: {
        findMany: vi.fn(),
      },
      topicScore: {
        upsert: vi.fn(),
      },
    },
  };
});

import prisma from '../../../src/lib/prisma';
import {
  hasDiagnosticCompleted,
  generateDiagnosticQuestions,
  initializeTopicScores,
  canStartAdvancedSession,
} from '../../../src/services/diagnosticService';

const mockCategories = [
  { id: 'cat-1', name: 'Cardiovascular System', ncpaTaskArea: 'tasks', parentId: null },
  { id: 'cat-2', name: 'Pulmonary System', ncpaTaskArea: 'tasks', parentId: null },
  { id: 'cat-3', name: 'Gastrointestinal System / Nutritional', ncpaTaskArea: 'tasks', parentId: null },
  { id: 'cat-4', name: 'Musculoskeletal System', ncpaTaskArea: 'tasks', parentId: null },
  { id: 'cat-5', name: 'Eyes, Ears, Nose, and Throat', ncpaTaskArea: 'tasks', parentId: null },
  { id: 'cat-6', name: 'Reproductive System', ncpaTaskArea: 'tasks', parentId: null },
  { id: 'cat-7', name: 'Neurologic System', ncpaTaskArea: 'tasks', parentId: null },
  { id: 'cat-8', name: 'Psychiatry / Behavioral Science', ncpaTaskArea: 'tasks', parentId: null },
  { id: 'cat-9', name: 'Dermatologic System', ncpaTaskArea: 'tasks', parentId: null },
  { id: 'cat-10', name: 'Endocrine System', ncpaTaskArea: 'tasks', parentId: null },
  { id: 'cat-11', name: 'Genitourinary System', ncpaTaskArea: 'tasks', parentId: null },
  { id: 'cat-12', name: 'Hematologic System', ncpaTaskArea: 'tasks', parentId: null },
  { id: 'cat-13', name: 'Infectious Disease', ncpaTaskArea: 'tasks', parentId: null },
  { id: 'cat-14', name: 'Renal System', ncpaTaskArea: 'tasks', parentId: null },
];

describe('diagnosticService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hasDiagnosticCompleted', () => {
    it('returns false for a new user with no diagnostic session', async () => {
      vi.mocked(prisma.studySession.findFirst).mockResolvedValue(null);

      const result = await hasDiagnosticCompleted('user-new');

      expect(result).toBe(false);
      expect(prisma.studySession.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user-new',
          endedAt: { not: null },
          aiPlan: {
            path: ['diagnostic'],
            equals: true,
          },
        },
      });
    });

    it('returns true after a completed diagnostic session', async () => {
      vi.mocked(prisma.studySession.findFirst).mockResolvedValue({
        id: 'session-diag',
        userId: 'user-1',
        mode: 'adaptive',
        startedAt: new Date(),
        endedAt: new Date(),
        aiPlan: { diagnostic: true },
      });

      const result = await hasDiagnosticCompleted('user-1');

      expect(result).toBe(true);
    });
  });

  describe('generateDiagnosticQuestions', () => {
    it('returns 20 questions when enough questions exist', async () => {
      vi.mocked(prisma.category.findMany).mockResolvedValue(mockCategories as any);

      // Each category has 2 questions available
      let callIndex = 0;
      vi.mocked(prisma.question.findMany).mockImplementation(async (args: any) => {
        if (args?.where?.categoryId) {
          // Per-category query: return 2 questions
          const catIndex = mockCategories.findIndex(c => c.id === args.where.categoryId);
          return [
            { id: `q-${catIndex}-a` },
            { id: `q-${catIndex}-b` },
          ] as any;
        }
        // Filler query: return extra questions not already selected
        const notIn = args?.where?.id?.notIn || [];
        const fillers = [];
        for (let i = 0; i < 20; i++) {
          const id = `q-filler-${i}`;
          if (!notIn.includes(id)) {
            fillers.push({ id });
          }
        }
        return fillers as any;
      });

      const result = await generateDiagnosticQuestions('user-1');

      expect(result).toHaveLength(20);
      // Should have unique question IDs
      expect(new Set(result).size).toBe(20);
    });

    it('returns fewer than 20 if not enough questions exist', async () => {
      // Only 2 categories with 1 question each, no fillers
      vi.mocked(prisma.category.findMany).mockResolvedValue([
        mockCategories[0],
        mockCategories[1],
      ] as any);

      vi.mocked(prisma.question.findMany).mockImplementation(async (args: any) => {
        if (args?.where?.categoryId) {
          return [{ id: `q-${args.where.categoryId}` }] as any;
        }
        // No filler questions available
        return [] as any;
      });

      const result = await generateDiagnosticQuestions('user-1');

      expect(result.length).toBe(2);
    });

    it('includes at least one question per category when available', async () => {
      vi.mocked(prisma.category.findMany).mockResolvedValue(mockCategories as any);

      vi.mocked(prisma.question.findMany).mockImplementation(async (args: any) => {
        if (args?.where?.categoryId) {
          return [{ id: `q-cat-${args.where.categoryId}` }] as any;
        }
        // Filler questions
        const notIn = args?.where?.id?.notIn || [];
        const fillers = [];
        for (let i = 0; i < 10; i++) {
          const id = `q-fill-${i}`;
          if (!notIn.includes(id)) {
            fillers.push({ id });
          }
        }
        return fillers as any;
      });

      const result = await generateDiagnosticQuestions('user-1');

      // All 14 categories should have a question
      for (const cat of mockCategories) {
        expect(result).toContain(`q-cat-${cat.id}`);
      }
      expect(result).toHaveLength(20);
    });
  });

  describe('initializeTopicScores', () => {
    it('creates TopicScore records for all categories with Elo 1000', async () => {
      vi.mocked(prisma.category.findMany).mockResolvedValue(mockCategories as any);
      vi.mocked(prisma.topicScore.upsert).mockResolvedValue({} as any);

      await initializeTopicScores('user-1');

      expect(prisma.topicScore.upsert).toHaveBeenCalledTimes(mockCategories.length);

      for (const cat of mockCategories) {
        expect(prisma.topicScore.upsert).toHaveBeenCalledWith({
          where: {
            userId_categoryId: {
              userId: 'user-1',
              categoryId: cat.id,
            },
          },
          update: {},
          create: {
            userId: 'user-1',
            categoryId: cat.id,
            eloScore: 1000,
            attemptCount: 0,
            correctCount: 0,
            decayFactor: 1.0,
          },
        });
      }
    });
  });

  describe('canStartAdvancedSession', () => {
    it('returns false when diagnostic is not completed', async () => {
      vi.mocked(prisma.studySession.findFirst).mockResolvedValue(null);

      const result = await canStartAdvancedSession('user-new');

      expect(result).toBe(false);
    });

    it('returns true when diagnostic is completed', async () => {
      vi.mocked(prisma.studySession.findFirst).mockResolvedValue({
        id: 'session-diag',
        userId: 'user-1',
        mode: 'adaptive',
        startedAt: new Date(),
        endedAt: new Date(),
        aiPlan: { diagnostic: true },
      });

      const result = await canStartAdvancedSession('user-1');

      expect(result).toBe(true);
    });
  });
});
