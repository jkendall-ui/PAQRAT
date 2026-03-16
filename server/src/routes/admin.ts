import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authMiddleware } from '../middleware/auth';
import { requireAdmin } from '../middleware/roleCheck';
import { validate } from '../middleware/validate';
import { uuidParamsSchema, paginationQuerySchema } from '../schemas/common';
import { questionImportBodySchema, questionExportQuerySchema } from '../schemas/questions';
import { litflImportSchema, caseExportQuerySchema } from '../schemas/cases';
import { calculateReadiness } from '../services/readinessCalculator';

const router = Router();

// ─── Schemas ─────────────────────────────────────────────

const adminUsersQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional(),
});

const blockUserBodySchema = z.object({
  isBlocked: z.boolean(),
});

const questionOptionBodySchema = z.object({
  body: z.string().min(1),
  isCorrect: z.boolean(),
  explanation: z.string().optional(),
});

const createQuestionBodySchema = z.object({
  body: z.string().min(1),
  type: z.enum(['single_best_answer', 'case_based']),
  difficulty: z.number().int().min(1).max(5),
  categoryId: z.string().uuid(),
  explanation: z.string().min(1),
  ncpaTaskArea: z.string().min(1),
  options: z.array(questionOptionBodySchema).min(1),
});

const updateQuestionBodySchema = z.object({
  body: z.string().min(1).optional(),
  type: z.enum(['single_best_answer', 'case_based']).optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  categoryId: z.string().uuid().optional(),
  explanation: z.string().min(1).optional(),
  ncpaTaskArea: z.string().min(1).optional(),
  options: z.array(questionOptionBodySchema).min(1).optional(),
});

// ─── GET /admin/users ────────────────────────────────────

/**
 * Paginated user list with name, email, join date, plan, last active.
 * Requirements: 17.1
 */
router.get(
  '/users',
  authMiddleware,
  requireAdmin,
  validate({ query: adminUsersQuerySchema }),
  async (req: Request, res: Response): Promise<void> => {
    const { page, limit, search } = req.query as unknown as {
      page: number;
      limit: number;
      search?: string;
    };
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          plan: true,
          role: true,
          isBlocked: true,
          attempts: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { createdAt: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    const formattedUsers = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      createdAt: u.createdAt,
      plan: u.plan,
      role: u.role,
      isBlocked: u.isBlocked,
      lastActive: u.attempts[0]?.createdAt ?? null,
    }));

    res.json({ users: formattedUsers, total });
  }
);

// ─── PATCH /admin/users/:id/block ────────────────────────

/**
 * Block or unblock a user.
 * Requirements: 17.2, 17.3
 */
router.patch(
  '/users/:id/block',
  authMiddleware,
  requireAdmin,
  validate({ params: uuidParamsSchema, body: blockUserBodySchema }),
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    const { isBlocked } = req.body as { isBlocked: boolean };

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
      return;
    }

    const user = await prisma.user.update({
      where: { id },
      data: { isBlocked },
    });

    res.json({ user });
  }
);

// ─── GET /admin/users/:id/progress ───────────────────────

/**
 * View a student's topic scores, readiness score, and attempt history.
 * Requirements: 17.5
 */
router.get(
  '/users/:id/progress',
  authMiddleware,
  requireAdmin,
  validate({ params: uuidParamsSchema }),
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
      return;
    }

    const [topicScores, attempts] = await Promise.all([
      prisma.topicScore.findMany({
        where: { userId: id },
        include: { category: { select: { name: true } } },
      }),
      prisma.attempt.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          questionId: true,
          isCorrect: true,
          durationMs: true,
          createdAt: true,
          confidenceRating: true,
        },
      }),
    ]);

    // Build category weights (equal weight for simplicity in admin view)
    const categoryWeights: Record<string, number> = {};
    if (topicScores.length > 0) {
      const weight = 1 / topicScores.length;
      for (const ts of topicScores) {
        categoryWeights[ts.categoryId] = weight;
      }
    }

    const readinessScore = calculateReadiness(
      topicScores.map((ts) => ({ categoryId: ts.categoryId, eloScore: ts.eloScore })),
      categoryWeights,
      user.examDate ?? undefined
    );

    const formattedScores = topicScores.map((ts) => ({
      categoryId: ts.categoryId,
      categoryName: ts.category.name,
      eloScore: ts.eloScore,
      attemptCount: ts.attemptCount,
      correctCount: ts.correctCount,
    }));

    res.json({
      topicScores: formattedScores,
      readinessScore,
      attempts,
    });
  }
);

// ─── GET /admin/reports ──────────────────────────────────

/**
 * Usage reports: active user count, session count, attempt volume.
 * Requirements: 17.4
 */
router.get(
  '/reports',
  authMiddleware,
  requireAdmin,
  async (_req: Request, res: Response): Promise<void> => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [activeUsersResult, sessionCount, attemptVolume] = await Promise.all([
      prisma.attempt.groupBy({
        by: ['userId'],
        where: { createdAt: { gte: thirtyDaysAgo } },
      }),
      prisma.studySession.count(),
      prisma.attempt.count(),
    ]);

    res.json({
      activeUsers: activeUsersResult.length,
      sessionCount,
      attemptVolume,
    });
  }
);

// ─── POST /admin/questions/import ─────────────────────────

/**
 * Bulk import questions in flat JSON format.
 * Validates all entries before creating any records.
 * Requirements: 23.1, 23.2, 23.3
 */
router.post(
  '/questions/import',
  authMiddleware,
  requireAdmin,
  validate({ body: questionImportBodySchema }),
  async (req: Request, res: Response): Promise<void> => {
    const { questions } = req.body as {
      questions: Array<{
        body: string;
        type: 'single_best_answer' | 'case_based';
        difficulty: number;
        categoryId: string;
        explanation: string;
        ncpaTaskArea: string;
        options: Array<{ body: string; isCorrect: boolean; explanation?: string }>;
        media?: Array<{ type: string; url: string; altText: string; attribution: string; caption?: string }>;
      }>;
    };

    // Validate all category IDs exist
    const categoryIds = [...new Set(questions.map((q) => q.categoryId))];
    const existingCategories = await prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true },
    });
    const existingCategoryIds = new Set(existingCategories.map((c) => c.id));

    const errors: Array<{ index: number; message: string }> = [];
    for (let i = 0; i < questions.length; i++) {
      if (!existingCategoryIds.has(questions[i].categoryId)) {
        errors.push({ index: i, message: `Category ${questions[i].categoryId} not found` });
      }
    }

    if (errors.length > 0) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Import validation failed',
          errors,
        },
      });
      return;
    }

    // Create all records in a single transaction
    const result = await prisma.$transaction(async (tx) => {
      let importedCount = 0;

      for (const q of questions) {
        const created = await tx.question.create({
          data: {
            body: q.body,
            type: q.type,
            difficulty: q.difficulty,
            categoryId: q.categoryId,
            explanation: q.explanation,
            ncpaTaskArea: q.ncpaTaskArea,
          },
        });

        await tx.questionOption.createMany({
          data: q.options.map((opt) => ({
            questionId: created.id,
            body: opt.body,
            isCorrect: opt.isCorrect,
            explanation: opt.explanation,
          })),
        });

        if (q.media && q.media.length > 0) {
          await tx.questionMedia.createMany({
            data: q.media.map((m) => ({
              questionId: created.id,
              type: m.type as any,
              url: m.url,
              altText: m.altText,
              attribution: m.attribution,
              caption: m.caption,
            })),
          });
        }

        importedCount++;
      }

      return importedCount;
    });

    res.status(201).json({ imported: result });
  }
);

// ─── GET /admin/questions/export ──────────────────────────

/**
 * Export all active questions in JSON format.
 * Supports optional categoryId filter.
 * Requirements: 23.4, 23.5
 */
router.get(
  '/questions/export',
  authMiddleware,
  requireAdmin,
  validate({ query: questionExportQuerySchema }),
  async (req: Request, res: Response): Promise<void> => {
    const { categoryId } = req.query as { categoryId?: string };

    const where: Record<string, unknown> = { isActive: true };
    if (categoryId) {
      where.categoryId = categoryId;
    }

    const questions = await prisma.question.findMany({
      where,
      include: {
        options: {
          select: {
            body: true,
            isCorrect: true,
            explanation: true,
          },
        },
        media: {
          select: {
            type: true,
            url: true,
            altText: true,
            attribution: true,
            caption: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const exported = questions.map((q) => ({
      body: q.body,
      type: q.type,
      difficulty: q.difficulty,
      categoryId: q.categoryId,
      explanation: q.explanation,
      ncpaTaskArea: q.ncpaTaskArea,
      options: q.options.map((o) => ({
        body: o.body,
        isCorrect: o.isCorrect,
        ...(o.explanation ? { explanation: o.explanation } : {}),
      })),
      ...(q.media.length > 0
        ? {
            media: q.media.map((m) => ({
              type: m.type,
              url: m.url,
              altText: m.altText,
              attribution: m.attribution,
              ...(m.caption ? { caption: m.caption } : {}),
            })),
          }
        : {}),
    }));

    res.json({ questions: exported });
  }
);

// ─── POST /admin/questions ────────────────────────────────

/**
 * Create a new question with options in a transaction.
 * Requirements: 18.1
 */
router.post(
  '/questions',
  authMiddleware,
  requireAdmin,
  validate({ body: createQuestionBodySchema }),
  async (req: Request, res: Response): Promise<void> => {
    const { body, type, difficulty, categoryId, explanation, ncpaTaskArea, options } = req.body;

    const question = await prisma.$transaction(async (tx) => {
      const created = await tx.question.create({
        data: {
          body,
          type,
          difficulty,
          categoryId,
          explanation,
          ncpaTaskArea,
        },
      });

      await tx.questionOption.createMany({
        data: options.map((opt: { body: string; isCorrect: boolean; explanation?: string }) => ({
          questionId: created.id,
          body: opt.body,
          isCorrect: opt.isCorrect,
          explanation: opt.explanation,
        })),
      });

      return tx.question.findUnique({
        where: { id: created.id },
        include: { options: true },
      });
    });

    res.status(201).json({ question });
  }
);

// ─── PATCH /admin/questions/:id ──────────────────────────

/**
 * Edit a question and optionally replace its options.
 * Requirements: 18.2
 */
router.patch(
  '/questions/:id',
  authMiddleware,
  requireAdmin,
  validate({ params: uuidParamsSchema, body: updateQuestionBodySchema }),
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    const { options, ...questionFields } = req.body;

    const existing = await prisma.question.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Question not found' },
      });
      return;
    }

    const question = await prisma.$transaction(async (tx) => {
      if (Object.keys(questionFields).length > 0) {
        await tx.question.update({
          where: { id },
          data: questionFields,
        });
      }

      if (options) {
        await tx.questionOption.deleteMany({ where: { questionId: id } });
        await tx.questionOption.createMany({
          data: options.map((opt: { body: string; isCorrect: boolean; explanation?: string }) => ({
            questionId: id,
            body: opt.body,
            isCorrect: opt.isCorrect,
            explanation: opt.explanation,
          })),
        });
      }

      return tx.question.findUnique({
        where: { id },
        include: { options: true },
      });
    });

    res.json({ question });
  }
);

// ─── PATCH /admin/questions/:id/deactivate ───────────────

/**
 * Deactivate a question (set is_active = false).
 * Requirements: 18.3, 18.5
 */
router.patch(
  '/questions/:id/deactivate',
  authMiddleware,
  requireAdmin,
  validate({ params: uuidParamsSchema }),
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };

    const existing = await prisma.question.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Question not found' },
      });
      return;
    }

    const question = await prisma.question.update({
      where: { id },
      data: { isActive: false },
      include: { options: true },
    });

    res.json({ question });
  }
);

// ─── POST /admin/cases/import ────────────────────────────

/**
 * Bulk import LITFL case-based content.
 * Validates entire payload with Zod, then creates all records in a single transaction.
 * Requirements: 23.8, 23.9
 */
router.post(
  '/cases/import',
  authMiddleware,
  requireAdmin,
  validate({ body: litflImportSchema }),
  async (req: Request, res: Response): Promise<void> => {
    const { metadata: _metadata, cases, defaultCategoryId } = req.body;

    // Resolve a category ID for questions
    let categoryId = defaultCategoryId;
    if (!categoryId) {
      const cat = await prisma.category.findFirst({
        where: { name: { contains: 'Cardiology', mode: 'insensitive' } },
      });
      if (!cat) {
        const anyCat = await prisma.category.findFirst();
        if (!anyCat) {
          res.status(400).json({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'No categories exist. Please provide a defaultCategoryId or seed categories first.',
            },
          });
          return;
        }
        categoryId = anyCat.id;
      } else {
        categoryId = cat.id;
      }
    } else {
      const cat = await prisma.category.findUnique({ where: { id: categoryId } });
      if (!cat) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: `Category ${categoryId} not found`,
          },
        });
        return;
      }
    }

    // Map difficulty string to numeric value
    const difficultyMap: Record<string, number> = {
      beginner: 1,
      intermediate: 3,
      advanced: 5,
    };

    const result = await prisma.$transaction(async (tx) => {
      let importedCount = 0;

      for (const c of cases) {
        // Create Case
        const caseRecord = await tx.case.create({
          data: {
            caseId: c.case_id,
            sourceUrl: c.source_url,
            sourceType: c.source_type,
            title: c.title,
            authors: c.authors,
            lastUpdated: c.last_updated ? new Date(c.last_updated) : null,
            keywords: c.keywords,
            clinicalContext: c.clinical_context,
          },
        });

        // Create CaseTag
        await tx.caseTag.create({
          data: {
            caseDbId: caseRecord.id,
            primaryTopic: c.tags.primary_topic,
            secondaryTopics: c.tags.secondary_topics || [],
            litflCategory: c.tags.litfl_category,
            difficulty: c.tags.difficulty,
            boardRelevance: c.tags.board_relevance,
            clinicalUrgency: c.tags.clinical_urgency || undefined,
          },
        });

        // Create ClinicalPearls
        if (c.clinical_pearls && c.clinical_pearls.length > 0) {
          await tx.clinicalPearl.createMany({
            data: c.clinical_pearls.map((text: string, idx: number) => ({
              caseDbId: caseRecord.id,
              text,
              sortOrder: idx,
            })),
          });
        }

        // Create CaseReferences
        if (c.references && c.references.length > 0) {
          await tx.caseReference.createMany({
            data: c.references.map((ref: { citation: string; url?: string }) => ({
              caseDbId: caseRecord.id,
              citation: ref.citation,
              url: ref.url || null,
            })),
          });
        }

        // Create SubCases
        for (const sc of c.sub_cases) {
          const subCaseRecord = await tx.subCase.create({
            data: {
              subCaseId: sc.sub_case_id,
              caseDbId: caseRecord.id,
              subCaseLabel: sc.sub_case_label || null,
              subCaseContext: sc.sub_case_context || null,
            },
          });

          // Create QuestionMedia for this sub-case
          // We need to track media_id → db id for QuestionMediaRef later
          const mediaIdMap: Record<string, string> = {};
          for (const m of sc.media) {
            const mediaRecord = await tx.questionMedia.create({
              data: {
                questionId: caseRecord.id, // placeholder, will be linked via subCaseId
                type: m.type,
                url: m.url,
                altText: m.alt_text,
                attribution: m.attribution,
                caption: m.caption || null,
                mediaRefId: m.media_id,
                localFilename: m.local_filename,
                timing: m.timing || null,
                subCaseId: subCaseRecord.id,
              },
            });
            mediaIdMap[m.media_id] = mediaRecord.id;
          }

          // Create Questions for this sub-case
          for (const q of sc.questions) {
            const questionRecord = await tx.question.create({
              data: {
                body: q.question_stem,
                type: 'case_based',
                difficulty: difficultyMap[c.tags.difficulty] || 3,
                categoryId: categoryId!,
                explanation: '',
                ncpaTaskArea: c.tags.litfl_category,
                subCaseId: subCaseRecord.id,
                sequence: q.sequence,
                questionFormat: q.question_format,
                answerSummary: q.answer.summary,
                interpretationText: q.answer.interpretation_text || null,
              },
            });

            // Create EcgFindings
            if (q.answer.ecg_findings && q.answer.ecg_findings.length > 0) {
              await tx.ecgFinding.createMany({
                data: q.answer.ecg_findings.map(
                  (f: { category: string; findings: string[] }, idx: number) => ({
                    questionId: questionRecord.id,
                    category: f.category,
                    findings: f.findings,
                    sortOrder: idx,
                  })
                ),
              });
            }

            // Create AnswerLinks
            if (q.answer.related_links && q.answer.related_links.length > 0) {
              await tx.answerLink.createMany({
                data: q.answer.related_links.map(
                  (link: { text: string; url: string }) => ({
                    questionId: questionRecord.id,
                    text: link.text,
                    url: link.url,
                  })
                ),
              });
            }

            // Create QuestionMediaRefs
            if (q.related_media_ids && q.related_media_ids.length > 0) {
              for (const mediaRefId of q.related_media_ids) {
                const dbMediaId = mediaIdMap[mediaRefId];
                if (dbMediaId) {
                  await tx.questionMediaRef.create({
                    data: {
                      questionId: questionRecord.id,
                      mediaId: dbMediaId,
                    },
                  });
                }
              }
            }
          }
        }

        importedCount++;
      }

      return importedCount;
    });

    res.status(201).json({ imported: result });
  }
);

// ─── GET /admin/cases/export ─────────────────────────────

/**
 * Export all cases in LITFL JSON format.
 * Supports optional source_type, primary_topic, difficulty filters.
 * Requirements: 23.10, 23.11
 */
router.get(
  '/cases/export',
  authMiddleware,
  requireAdmin,
  validate({ query: caseExportQuerySchema }),
  async (req: Request, res: Response): Promise<void> => {
    const { source_type, primary_topic, difficulty } = req.query as {
      source_type?: string;
      primary_topic?: string;
      difficulty?: string;
    };

    const where: Record<string, unknown> = {};
    if (source_type) {
      where.sourceType = source_type;
    }

    // Tag-based filters
    const tagFilter: Record<string, unknown> = {};
    if (primary_topic) tagFilter.primaryTopic = primary_topic;
    if (difficulty) tagFilter.difficulty = difficulty;

    if (Object.keys(tagFilter).length > 0) {
      where.caseTags = tagFilter;
    }

    const cases = await prisma.case.findMany({
      where,
      include: {
        subCases: {
          include: {
            media: true,
            questions: {
              orderBy: { sequence: 'asc' },
              include: {
                ecgFindings: { orderBy: { sortOrder: 'asc' } },
                answerLinks: true,
                questionMediaRefs: { include: { media: true } },
              },
            },
          },
        },
        clinicalPearls: { orderBy: { sortOrder: 'asc' } },
        caseReferences: true,
        caseTags: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    let totalQuestions = 0;

    const exportedCases = cases.map((c) => {
      const subCases = c.subCases.map((sc) => {
        const media = sc.media.map((m) => ({
          media_id: m.mediaRefId || m.id,
          type: m.type,
          url: m.url,
          local_filename: m.localFilename || '',
          alt_text: m.altText,
          attribution: m.attribution,
          ...(m.caption ? { caption: m.caption } : {}),
          ...(m.timing ? { timing: m.timing } : {}),
        }));

        const questions = sc.questions.map((q) => {
          totalQuestions++;

          const answer: Record<string, unknown> = {
            summary: q.answerSummary || '',
            ecg_findings: q.ecgFindings.map((f) => ({
              category: f.category,
              findings: f.findings,
            })),
          };

          if (q.interpretationText) {
            answer.interpretation_text = q.interpretationText;
          }

          if (q.answerLinks.length > 0) {
            answer.related_links = q.answerLinks.map((l) => ({
              text: l.text,
              url: l.url,
            }));
          }

          const questionObj: Record<string, unknown> = {
            question_id: q.id,
            sequence: q.sequence,
            question_stem: q.body,
            question_format: q.questionFormat,
            answer,
          };

          if (q.questionMediaRefs.length > 0) {
            questionObj.related_media_ids = q.questionMediaRefs.map(
              (ref) => ref.media.mediaRefId || ref.media.id
            );
          }

          return questionObj;
        });

        const subCaseObj: Record<string, unknown> = {
          sub_case_id: sc.subCaseId,
          media,
          questions,
        };

        if (sc.subCaseLabel) subCaseObj.sub_case_label = sc.subCaseLabel;
        if (sc.subCaseContext) subCaseObj.sub_case_context = sc.subCaseContext;

        return subCaseObj;
      });

      const tags: Record<string, unknown> = c.caseTags
        ? {
            primary_topic: c.caseTags.primaryTopic,
            secondary_topics: c.caseTags.secondaryTopics || [],
            litfl_category: c.caseTags.litflCategory,
            difficulty: c.caseTags.difficulty,
            board_relevance: c.caseTags.boardRelevance,
            ...(c.caseTags.clinicalUrgency
              ? { clinical_urgency: c.caseTags.clinicalUrgency }
              : {}),
          }
        : {};

      return {
        case_id: c.caseId,
        source_url: c.sourceUrl,
        source_type: c.sourceType,
        title: c.title,
        authors: c.authors,
        ...(c.lastUpdated
          ? { last_updated: c.lastUpdated.toISOString().split('T')[0] }
          : {}),
        keywords: c.keywords,
        clinical_context: c.clinicalContext,
        sub_cases: subCases,
        clinical_pearls: c.clinicalPearls.map((p) => p.text),
        references: c.caseReferences.map((r) => ({
          citation: r.citation,
          ...(r.url ? { url: r.url } : {}),
        })),
        tags,
      };
    });

    res.json({
      metadata: {
        version: '2.0.0',
        generated_at: new Date().toISOString(),
        total_cases: exportedCases.length,
        total_questions: totalQuestions,
        source: 'PA Exam Prep — LITFL ECG Library',
        license: 'CC BY-NC-SA 4.0',
      },
      cases: exportedCases,
    });
  }
);

export default router;
