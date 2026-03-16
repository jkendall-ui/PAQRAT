import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createAttemptSchema, getAttemptsQuerySchema, ecgInterpretationAttemptSchema } from '../schemas/attempts';
import { calculateNewScore, difficultyToElo } from '../services/eloCalculator';
import { evaluateAnswer, EvalResult } from '../services/aiAnswerEvaluator';
import { evaluateEcgInterpretation, ECG_INTERPRETATION_STEPS } from '../services/ecgInterpretationEvaluator';

const router = Router();

/**
 * POST /attempts
 * Submit an answer attempt. Checks correctness, creates attempt record,
 * and updates topic score Elo.
 * Requirements: 9.4, 24.4, 24.5, 24.6, 24.7, 24.9
 */
router.post(
  '/',
  authMiddleware,
  validate({ body: createAttemptSchema }),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const {
      sessionId,
      questionId,
      selectedOptionId,
      durationMs,
      confidenceRating,
      answerFormat,
      rawResponseText,
    } = req.body;

    // Look up the question with its options, category, and case data
    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: {
        options: true,
        ecgFindings: { orderBy: { sortOrder: 'asc' } },
        answerLinks: true,
      },
    });

    if (!question) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Question not found' },
      });
      return;
    }

    // Determine correctness based on answer format
    const format = answerFormat || 'multiple_choice';
    let isCorrect = false;
    let aiFeedback: EvalResult | null = null;

    if (format === 'multiple_choice' && selectedOptionId) {
      // Check if selectedOptionId matches a correct option
      const correctOption = question.options.find((o) => o.isCorrect);
      isCorrect = correctOption?.id === selectedOptionId;
    } else {
      // free_text / audio: evaluate using Claude AI
      const evalResult = await evaluateAnswer({
        questionStem: question.body,
        referenceAnswer: question.explanation,
        studentAnswer: rawResponseText ?? '',
      });
      isCorrect = evalResult.judgment === 'correct';
      // Store evaluation result for feedback (partially_correct treated as incorrect for Elo)
      aiFeedback = evalResult;
    }

    // Create the attempt record
    const attempt = await prisma.attempt.create({
      data: {
        userId,
        questionId,
        sessionId,
        selectedOptionId: selectedOptionId ?? null,
        isCorrect,
        durationMs,
        confidenceRating: confidenceRating ?? null,
        answerFormat: format,
        rawResponseText: rawResponseText ?? null,
      },
    });

    // Update TopicScore for the question's category
    const categoryId = question.categoryId;

    let topicScore = await prisma.topicScore.findUnique({
      where: { userId_categoryId: { userId, categoryId } },
    });

    if (!topicScore) {
      topicScore = await prisma.topicScore.create({
        data: {
          userId,
          categoryId,
          eloScore: 1000,
          attemptCount: 0,
          correctCount: 0,
        },
      });
    }

    const questionDifficultyElo = difficultyToElo(question.difficulty);
    const newElo = calculateNewScore(topicScore.eloScore, questionDifficultyElo, isCorrect);

    await prisma.topicScore.update({
      where: { id: topicScore.id },
      data: {
        eloScore: newElo,
        attemptCount: { increment: 1 },
        correctCount: isCorrect ? { increment: 1 } : undefined,
        lastReviewedAt: new Date(),
      },
    });

    // Build the correct option id (if any)
    const correctOption = question.options.find((o) => o.isCorrect);

    res.status(201).json({
      id: attempt.id,
      isCorrect,
      correctOptionId: correctOption?.id ?? null,
      explanation: question.explanation,
      answerSummary: question.answerSummary ?? null,
      interpretationText: question.interpretationText ?? null,
      ecgFindings: question.ecgFindings.map((f) => ({
        category: f.category,
        findings: f.findings,
      })),
      relatedLinks: question.answerLinks.map((l) => ({
        title: l.text,
        url: l.url,
      })),
      aiFeedback: aiFeedback ?? null,
      studentResponse: rawResponseText ?? null,
      expectedAnswer: question.answerSummary ?? null,
    });
  }
);

/**
 * POST /attempts/ecg-interpretation
 * Submit a stepped ECG interpretation attempt.
 * Accepts 10 step answers, evaluates with AI using clinical tolerances.
 */
router.post(
  '/ecg-interpretation',
  authMiddleware,
  validate({ body: ecgInterpretationAttemptSchema }),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const { sessionId, questionId, answers } = req.body;

    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: {
        ecgFindings: { orderBy: { sortOrder: 'asc' } },
        answerLinks: true,
      },
    });

    if (!question) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Question not found' } });
      return;
    }

    const referenceAnswer = question.explanation ?? '';
    const ecgFindings = question.ecgFindings.map((f) => `${f.category}: ${f.findings.join(', ')}`);

    const result = await evaluateEcgInterpretation(referenceAnswer, answers, ecgFindings);

    // Determine correctness: score >= 60 is passing
    const isCorrect = result.overallScore >= 60;

    const attempt = await prisma.attempt.create({
      data: {
        userId,
        questionId,
        sessionId,
        isCorrect,
        durationMs: 0,
        answerFormat: 'free_text',
        rawResponseText: JSON.stringify(answers),
      },
    });

    // Update TopicScore
    const categoryId = question.categoryId;
    let topicScore = await prisma.topicScore.findUnique({
      where: { userId_categoryId: { userId, categoryId } },
    });
    if (!topicScore) {
      topicScore = await prisma.topicScore.create({
        data: { userId, categoryId, eloScore: 1000, attemptCount: 0, correctCount: 0 },
      });
    }
    const questionDifficultyElo = difficultyToElo(question.difficulty);
    const newElo = calculateNewScore(topicScore.eloScore, questionDifficultyElo, isCorrect);
    await prisma.topicScore.update({
      where: { id: topicScore.id },
      data: {
        eloScore: newElo,
        attemptCount: { increment: 1 },
        correctCount: isCorrect ? { increment: 1 } : undefined,
        lastReviewedAt: new Date(),
      },
    });

    res.status(201).json({
      id: attempt.id,
      isCorrect,
      overallScore: result.overallScore,
      overallFeedback: result.overallFeedback,
      stepEvaluations: result.stepEvaluations,
      ecgFindings: question.ecgFindings.map((f) => ({
        category: f.category,
        findings: f.findings,
      })),
      relatedLinks: question.answerLinks.map((l) => ({
        title: l.text,
        url: l.url,
      })),
    });
  }
);

/**
 * GET /attempts
 * Paginated attempt history with optional filters.
 * Requirements: 9.4
 */
router.get(
  '/',
  authMiddleware,
  validate({ query: getAttemptsQuerySchema }),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const { sessionId, questionId, page, limit } = req.query as unknown as {
      sessionId?: string;
      questionId?: string;
      page: number;
      limit: number;
    };
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { userId };
    if (sessionId) where.sessionId = sessionId;
    if (questionId) where.questionId = questionId;

    const [attempts, total] = await Promise.all([
      prisma.attempt.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.attempt.count({ where }),
    ]);

    res.json({ attempts, total });
  }
);

export default router;
