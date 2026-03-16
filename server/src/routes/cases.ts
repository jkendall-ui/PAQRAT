import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { getCasesQuerySchema } from '../schemas/cases';
import { z } from 'zod';

const router = Router();

const caseIdParamsSchema = z.object({
  caseId: z.string().min(1),
});

const subCaseParamsSchema = z.object({
  caseId: z.string().min(1),
  subCaseId: z.string().min(1),
});

/**
 * GET /cases
 * Paginated case listing with filters (source_type, primary_topic, difficulty, board_relevance, clinical_urgency, search).
 * Filtering on primary_topic, difficulty, board_relevance, clinical_urgency works through the CaseTag relation.
 * Requirements: 25.4, 25.6, 31.1, 31.2, 31.3, 31.4
 */
router.get(
  '/',
  authMiddleware,
  validate({ query: getCasesQuerySchema }),
  async (req: Request, res: Response): Promise<void> => {
    const {
      source_type,
      primary_topic,
      difficulty,
      board_relevance,
      clinical_urgency,
      search,
      page,
      limit,
    } = req.query as unknown as {
      source_type?: string;
      primary_topic?: string;
      difficulty?: string;
      board_relevance?: string;
      clinical_urgency?: string;
      search?: string;
      page: number;
      limit: number;
    };
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (source_type) {
      where.sourceType = source_type;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { clinicalContext: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Tag-based filters go through the caseTags relation
    const tagFilter: Record<string, unknown> = {};
    if (primary_topic) tagFilter.primaryTopic = primary_topic;
    if (difficulty) tagFilter.difficulty = difficulty;
    if (board_relevance) tagFilter.boardRelevance = board_relevance;
    if (clinical_urgency) tagFilter.clinicalUrgency = clinical_urgency;

    if (Object.keys(tagFilter).length > 0) {
      where.caseTags = tagFilter;
    }

    const [cases, total] = await Promise.all([
      prisma.case.findMany({
        where,
        include: {
          caseTags: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.case.count({ where }),
    ]);

    res.json({ cases, total });
  }
);


/**
 * GET /cases/:caseId
 * Full case detail by case_id (e.g. LITFL-ECG-0001) with sub-cases, tags, clinical pearls, references.
 * Requirements: 26.3, 26.4, 26.5, 27.5
 */
router.get(
  '/:caseId',
  authMiddleware,
  validate({ params: caseIdParamsSchema }),
  async (req: Request, res: Response): Promise<void> => {
    const { caseId } = req.params as { caseId: string };

    const caseRecord = await prisma.case.findUnique({
      where: { caseId },
      include: {
        subCases: true,
        caseTags: true,
        clinicalPearls: { orderBy: { sortOrder: 'asc' } },
        caseReferences: true,
      },
    });

    if (!caseRecord) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Case not found' },
      });
      return;
    }

    res.json({
      case: caseRecord,
      subCases: caseRecord.subCases,
      tags: caseRecord.caseTags,
      clinicalPearls: caseRecord.clinicalPearls,
      references: caseRecord.caseReferences,
    });
  }
);

/**
 * GET /cases/:caseId/sub-cases/:subCaseId
 * Sub-case with media and progressive questions.
 * Requirements: 28.3, 28.4
 */
router.get(
  '/:caseId/sub-cases/:subCaseId',
  authMiddleware,
  validate({ params: subCaseParamsSchema }),
  async (req: Request, res: Response): Promise<void> => {
    const { caseId, subCaseId } = req.params as { caseId: string; subCaseId: string };

    // Verify the case exists
    const caseRecord = await prisma.case.findUnique({ where: { caseId } });
    if (!caseRecord) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Case not found' },
      });
      return;
    }

    const subCase = await prisma.subCase.findUnique({
      where: { subCaseId },
      include: {
        media: true,
        questions: {
          orderBy: { sequence: 'asc' },
          include: {
            ecgFindings: { orderBy: { sortOrder: 'asc' } },
            answerLinks: true,
          },
        },
      },
    });

    if (!subCase || subCase.caseDbId !== caseRecord.id) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Sub-case not found' },
      });
      return;
    }

    res.json({
      subCase,
      media: subCase.media,
      questions: subCase.questions,
    });
  }
);

/**
 * GET /cases/:caseId/sub-cases/:subCaseId/questions
 * Questions in sequence order with structured answers (summary, ecg_findings, interpretation_text, related_links).
 * Requirements: 25.4, 25.6
 */
router.get(
  '/:caseId/sub-cases/:subCaseId/questions',
  authMiddleware,
  validate({ params: subCaseParamsSchema }),
  async (req: Request, res: Response): Promise<void> => {
    const { caseId, subCaseId } = req.params as { caseId: string; subCaseId: string };

    // Verify the case exists
    const caseRecord = await prisma.case.findUnique({ where: { caseId } });
    if (!caseRecord) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Case not found' },
      });
      return;
    }

    const subCase = await prisma.subCase.findUnique({
      where: { subCaseId },
    });

    if (!subCase || subCase.caseDbId !== caseRecord.id) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Sub-case not found' },
      });
      return;
    }

    const questions = await prisma.question.findMany({
      where: { subCaseId: subCase.id },
      orderBy: { sequence: 'asc' },
      include: {
        ecgFindings: { orderBy: { sortOrder: 'asc' } },
        answerLinks: true,
        media: true,
      },
    });

    res.json({ questions });
  }
);

export default router;
