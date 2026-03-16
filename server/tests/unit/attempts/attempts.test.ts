import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock prisma
vi.mock('../../../src/lib/prisma', () => ({
  default: {
    question: {
      findUnique: vi.fn(),
    },
    attempt: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    topicScore: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock eloCalculator
vi.mock('../../../src/services/eloCalculator', () => ({
  calculateNewScore: vi.fn(),
  difficultyToElo: vi.fn(),
}));

// Mock aiAnswerEvaluator
vi.mock('../../../src/services/aiAnswerEvaluator', () => ({
  evaluateAnswer: vi.fn(),
}));

// Mock auth middleware to inject user
vi.mock('../../../src/middleware/auth', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-1', role: 'student' };
    next();
  },
}));

import prisma from '../../../src/lib/prisma';
import { calculateNewScore, difficultyToElo } from '../../../src/services/eloCalculator';
import { evaluateAnswer } from '../../../src/services/aiAnswerEvaluator';
import attemptsRouter from '../../../src/routes/attempts';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const QUESTION_ID = '660e8400-e29b-41d4-a716-446655440001';
const SESSION_ID = '770e8400-e29b-41d4-a716-446655440002';
const OPTION_CORRECT_ID = '880e8400-e29b-41d4-a716-446655440003';
const OPTION_WRONG_ID = '990e8400-e29b-41d4-a716-446655440004';
const CATEGORY_ID = 'aa0e8400-e29b-41d4-a716-446655440005';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/attempts', attemptsRouter);
  return app;
}

const mockQuestion = {
  id: QUESTION_ID,
  body: 'What is the diagnosis?',
  type: 'single_best_answer',
  difficulty: 3,
  categoryId: CATEGORY_ID,
  explanation: 'The correct answer is A because...',
  ncpaTaskArea: 'Cardiology',
  isActive: true,
  createdAt: new Date(),
  answerSummary: null,
  interpretationText: null,
  options: [
    { id: OPTION_CORRECT_ID, questionId: QUESTION_ID, body: 'Option A', isCorrect: true, explanation: null },
    { id: OPTION_WRONG_ID, questionId: QUESTION_ID, body: 'Option B', isCorrect: false, explanation: null },
  ],
  ecgFindings: [],
  answerLinks: [],
};

const mockTopicScore = {
  id: 'ts-1',
  userId: 'user-1',
  categoryId: CATEGORY_ID,
  eloScore: 1000,
  attemptCount: 5,
  correctCount: 3,
  decayFactor: 1.0,
  lastReviewedAt: null,
};

describe('Attempts Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /attempts', () => {
    it('creates attempt and returns correctness for correct answer', async () => {
      vi.mocked(prisma.question.findUnique).mockResolvedValue(mockQuestion as any);
      vi.mocked(prisma.topicScore.findUnique).mockResolvedValue(mockTopicScore as any);
      vi.mocked(difficultyToElo).mockReturnValue(1000);
      vi.mocked(calculateNewScore).mockReturnValue(1016);
      vi.mocked(prisma.attempt.create).mockResolvedValue({
        id: 'attempt-1',
        userId: 'user-1',
        questionId: QUESTION_ID,
        sessionId: SESSION_ID,
        selectedOptionId: OPTION_CORRECT_ID,
        isCorrect: true,
        durationMs: 5000,
        confidenceRating: 2,
        answerFormat: 'multiple_choice',
        rawResponseText: null,
        createdAt: new Date(),
      } as any);
      vi.mocked(prisma.topicScore.update).mockResolvedValue({} as any);

      const app = createApp();
      const res = await request(app)
        .post('/attempts')
        .send({
          sessionId: SESSION_ID,
          questionId: QUESTION_ID,
          selectedOptionId: OPTION_CORRECT_ID,
          durationMs: 5000,
          confidenceRating: 2,
        });

      expect(res.status).toBe(201);
      expect(res.body.isCorrect).toBe(true);
      expect(res.body.explanation).toBe('The correct answer is A because...');
      expect(res.body.id).toBe('attempt-1');
    });

    it('updates topic score Elo after attempt', async () => {
      vi.mocked(prisma.question.findUnique).mockResolvedValue(mockQuestion as any);
      vi.mocked(prisma.topicScore.findUnique).mockResolvedValue(mockTopicScore as any);
      vi.mocked(difficultyToElo).mockReturnValue(1000);
      vi.mocked(calculateNewScore).mockReturnValue(1016);
      vi.mocked(prisma.attempt.create).mockResolvedValue({
        id: 'attempt-1',
        userId: 'user-1',
        questionId: QUESTION_ID,
        sessionId: SESSION_ID,
        selectedOptionId: OPTION_CORRECT_ID,
        isCorrect: true,
        durationMs: 5000,
        confidenceRating: null,
        answerFormat: 'multiple_choice',
        rawResponseText: null,
        createdAt: new Date(),
      } as any);
      vi.mocked(prisma.topicScore.update).mockResolvedValue({} as any);

      const app = createApp();
      await request(app)
        .post('/attempts')
        .send({
          sessionId: SESSION_ID,
          questionId: QUESTION_ID,
          selectedOptionId: OPTION_CORRECT_ID,
          durationMs: 5000,
        });

      expect(difficultyToElo).toHaveBeenCalledWith(3);
      expect(calculateNewScore).toHaveBeenCalledWith(1000, 1000, true);
      expect(prisma.topicScore.update).toHaveBeenCalledWith({
        where: { id: 'ts-1' },
        data: expect.objectContaining({
          eloScore: 1016,
          attemptCount: { increment: 1 },
          correctCount: { increment: 1 },
        }),
      });
    });

    it('returns 404 for non-existent question', async () => {
      vi.mocked(prisma.question.findUnique).mockResolvedValue(null);

      const app = createApp();
      const res = await request(app)
        .post('/attempts')
        .send({
          sessionId: SESSION_ID,
          questionId: QUESTION_ID,
          selectedOptionId: OPTION_CORRECT_ID,
          durationMs: 5000,
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('handles free_text answer format with AI evaluation', async () => {
      vi.mocked(prisma.question.findUnique).mockResolvedValue(mockQuestion as any);
      vi.mocked(prisma.topicScore.findUnique).mockResolvedValue(mockTopicScore as any);
      vi.mocked(difficultyToElo).mockReturnValue(1000);
      vi.mocked(calculateNewScore).mockReturnValue(1016);
      vi.mocked(evaluateAnswer).mockResolvedValue({
        judgment: 'correct',
        confidence: 0.9,
        feedback: 'Good identification.',
        missingConcepts: [],
      });
      vi.mocked(prisma.attempt.create).mockResolvedValue({
        id: 'attempt-2',
        userId: 'user-1',
        questionId: QUESTION_ID,
        sessionId: SESSION_ID,
        selectedOptionId: OPTION_CORRECT_ID,
        isCorrect: true,
        durationMs: 8000,
        confidenceRating: null,
        answerFormat: 'free_text',
        rawResponseText: 'I think the diagnosis is acute MI',
        createdAt: new Date(),
      } as any);
      vi.mocked(prisma.topicScore.update).mockResolvedValue({} as any);

      const app = createApp();
      const res = await request(app)
        .post('/attempts')
        .send({
          sessionId: SESSION_ID,
          questionId: QUESTION_ID,
          selectedOptionId: OPTION_CORRECT_ID,
          durationMs: 8000,
          answerFormat: 'free_text',
          rawResponseText: 'I think the diagnosis is acute MI',
        });

      expect(res.status).toBe(201);
      expect(res.body.isCorrect).toBe(true);
      expect(res.body.aiFeedback).toBeDefined();
      expect(res.body.aiFeedback.judgment).toBe('correct');
      expect(evaluateAnswer).toHaveBeenCalledWith({
        questionStem: mockQuestion.body,
        referenceAnswer: mockQuestion.explanation,
        studentAnswer: 'I think the diagnosis is acute MI',
      });
    });

    it('treats partially_correct AI judgment as incorrect for Elo', async () => {
      vi.mocked(prisma.question.findUnique).mockResolvedValue(mockQuestion as any);
      vi.mocked(prisma.topicScore.findUnique).mockResolvedValue(mockTopicScore as any);
      vi.mocked(difficultyToElo).mockReturnValue(1000);
      vi.mocked(calculateNewScore).mockReturnValue(984);
      vi.mocked(evaluateAnswer).mockResolvedValue({
        judgment: 'partially_correct',
        confidence: 0.7,
        feedback: 'Partially identified findings.',
        missingConcepts: ['lead specificity'],
      });
      vi.mocked(prisma.attempt.create).mockResolvedValue({
        id: 'attempt-pc',
        userId: 'user-1',
        questionId: QUESTION_ID,
        sessionId: SESSION_ID,
        selectedOptionId: OPTION_CORRECT_ID,
        isCorrect: false,
        durationMs: 8000,
        confidenceRating: null,
        answerFormat: 'free_text',
        rawResponseText: 'Some partial answer',
        createdAt: new Date(),
      } as any);
      vi.mocked(prisma.topicScore.update).mockResolvedValue({} as any);

      const app = createApp();
      const res = await request(app)
        .post('/attempts')
        .send({
          sessionId: SESSION_ID,
          questionId: QUESTION_ID,
          selectedOptionId: OPTION_CORRECT_ID,
          durationMs: 8000,
          answerFormat: 'free_text',
          rawResponseText: 'Some partial answer',
        });

      expect(res.status).toBe(201);
      // partially_correct is treated as incorrect for Elo
      expect(res.body.isCorrect).toBe(false);
      expect(res.body.aiFeedback.judgment).toBe('partially_correct');
      expect(prisma.attempt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ isCorrect: false }),
      });
    });

    it('creates TopicScore if none exists for user+category', async () => {
      vi.mocked(prisma.question.findUnique).mockResolvedValue(mockQuestion as any);
      vi.mocked(prisma.topicScore.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.topicScore.create).mockResolvedValue({
        ...mockTopicScore,
        attemptCount: 0,
        correctCount: 0,
      } as any);
      vi.mocked(difficultyToElo).mockReturnValue(1000);
      vi.mocked(calculateNewScore).mockReturnValue(1016);
      vi.mocked(prisma.attempt.create).mockResolvedValue({
        id: 'attempt-3',
        userId: 'user-1',
        questionId: QUESTION_ID,
        sessionId: SESSION_ID,
        selectedOptionId: OPTION_CORRECT_ID,
        isCorrect: true,
        durationMs: 5000,
        confidenceRating: null,
        answerFormat: 'multiple_choice',
        rawResponseText: null,
        createdAt: new Date(),
      } as any);
      vi.mocked(prisma.topicScore.update).mockResolvedValue({} as any);

      const app = createApp();
      const res = await request(app)
        .post('/attempts')
        .send({
          sessionId: SESSION_ID,
          questionId: QUESTION_ID,
          selectedOptionId: OPTION_CORRECT_ID,
          durationMs: 5000,
        });

      expect(res.status).toBe(201);
      expect(prisma.topicScore.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          categoryId: CATEGORY_ID,
          eloScore: 1000,
        }),
      });
    });
  });

  describe('GET /attempts', () => {
    it('returns paginated results', async () => {
      const attempts = [
        { id: 'a-1', userId: 'user-1', questionId: QUESTION_ID, isCorrect: true, createdAt: new Date() },
        { id: 'a-2', userId: 'user-1', questionId: QUESTION_ID, isCorrect: false, createdAt: new Date() },
      ];
      vi.mocked(prisma.attempt.findMany).mockResolvedValue(attempts as any);
      vi.mocked(prisma.attempt.count).mockResolvedValue(2);

      const app = createApp();
      const res = await request(app)
        .get('/attempts?page=1&limit=20');

      expect(res.status).toBe(200);
      expect(res.body.attempts).toHaveLength(2);
      expect(res.body.total).toBe(2);
    });

    it('filters by sessionId', async () => {
      vi.mocked(prisma.attempt.findMany).mockResolvedValue([]);
      vi.mocked(prisma.attempt.count).mockResolvedValue(0);

      const app = createApp();
      const res = await request(app)
        .get(`/attempts?sessionId=${SESSION_ID}&page=1&limit=20`);

      expect(res.status).toBe(200);
      expect(prisma.attempt.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            sessionId: SESSION_ID,
          }),
        })
      );
    });

    it('applies pagination correctly', async () => {
      vi.mocked(prisma.attempt.findMany).mockResolvedValue([]);
      vi.mocked(prisma.attempt.count).mockResolvedValue(50);

      const app = createApp();
      const res = await request(app)
        .get('/attempts?page=3&limit=10');

      expect(res.status).toBe(200);
      expect(prisma.attempt.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 })
      );
    });
  });
});
