/**
 * Seed script: imports ECG-Quiz_Database_v1.json into the Prisma database.
 *
 * Maps JSON cases → Case, SubCase, CaseTag, ClinicalPearl, Question,
 * QuestionMedia, QuestionMediaRef, EcgFinding, AnswerLink
 *
 * Usage:  npx tsx prisma/seedEcgData.ts
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// ── Difficulty → numeric (1-5) for Question.difficulty ──
const difficultyMap: Record<string, number> = {
  beginner: 1,
  intermediate: 3,
  advanced: 5,
};

// ── Map primary_topic → a category name we can look up ──
// All ECG content maps to Cardiovascular System
const CARDIO_CATEGORY_NAME = 'Cardiovascular System';

interface JsonMedia {
  media_id: string;
  type: string;
  url: string;
  local_filename?: string;
  alt_text?: string;
  attribution?: string;
  timing?: string;
}

interface JsonAnswerLink {
  text: string;
  url: string;
}

interface JsonEcgFinding {
  category: string;
  findings: string[];
}

interface JsonAnswer {
  summary?: string;
  ecg_findings?: JsonEcgFinding[];
  interpretation_text?: string;
  related_links?: JsonAnswerLink[];
}

interface JsonQuestion {
  question_id: string;
  sequence: number;
  question_stem: string;
  question_format: string;
  related_media_ids?: string[];
  answer: JsonAnswer;
}

interface JsonSubCase {
  sub_case_id: string;
  sub_case_label?: string;
  sub_case_context?: string;
  media: JsonMedia[];
  questions: JsonQuestion[];
}

interface JsonTags {
  primary_topic: string;
  secondary_topics?: string[];
  litfl_category?: string;
  difficulty: string;
  board_relevance: string;
  clinical_urgency?: string;
}

interface JsonCase {
  case_id: string;
  source_url: string;
  source_type: string;
  title: string;
  authors?: string[];
  keywords?: string[];
  clinical_context: string;
  sub_cases: JsonSubCase[];
  tags: JsonTags;
  clinical_pearls?: string[];
}

interface JsonRoot {
  metadata: Record<string, unknown>;
  cases: JsonCase[];
}

async function createQuestionExtras(
  questionId: string,
  jQ: JsonQuestion,
  mediaIdMap: Record<string, string>,
) {
  // QuestionMediaRef
  if (jQ.related_media_ids?.length) {
    for (const refId of jQ.related_media_ids) {
      const dbMediaId = mediaIdMap[refId];
      if (dbMediaId) {
        await prisma.questionMediaRef.create({
          data: { questionId, mediaId: dbMediaId },
        });
      }
    }
  }

  // EcgFindings
  if (jQ.answer.ecg_findings?.length) {
    for (let i = 0; i < jQ.answer.ecg_findings.length; i++) {
      const f = jQ.answer.ecg_findings[i];
      await prisma.ecgFinding.create({
        data: {
          questionId,
          category: f.category,
          findings: f.findings,
          sortOrder: i,
        },
      });
    }
  }

  // AnswerLinks (deduplicated)
  if (jQ.answer.related_links?.length) {
    const seen = new Set<string>();
    for (const link of jQ.answer.related_links) {
      const key = `${link.text}|${link.url}`;
      if (!seen.has(key)) {
        seen.add(key);
        await prisma.answerLink.create({
          data: { questionId, text: link.text, url: link.url },
        });
      }
    }
  }
}

async function main() {
  // Load JSON
  const jsonPath = path.resolve(__dirname, '../../ECG-Quiz_Database_v1.json');
  const raw = fs.readFileSync(jsonPath, 'utf-8');
  const data: JsonRoot = JSON.parse(raw);

  console.log(`Loaded ${data.cases.length} cases from JSON`);

  // Find the Cardiovascular category
  const cardioCategory = await prisma.category.findFirst({
    where: { name: CARDIO_CATEGORY_NAME },
  });
  if (!cardioCategory) {
    throw new Error(`Category "${CARDIO_CATEGORY_NAME}" not found. Run the base seed first.`);
  }
  console.log(`Using category: ${cardioCategory.name} (${cardioCategory.id})`);

  let casesCreated = 0;
  let questionsCreated = 0;
  let mediaCreated = 0;

  for (const jCase of data.cases) {
    // Skip if case already exists
    const existing = await prisma.case.findUnique({ where: { caseId: jCase.case_id } });
    if (existing) {
      console.log(`  Skipping existing case: ${jCase.case_id}`);
      continue;
    }

    // Create Case
    const dbCase = await prisma.case.create({
      data: {
        caseId: jCase.case_id,
        sourceUrl: jCase.source_url,
        sourceType: jCase.source_type as any,
        title: jCase.title,
        authors: jCase.authors ?? [],
        keywords: jCase.keywords ?? [],
        clinicalContext: jCase.clinical_context,
      },
    });

    // Create CaseTag
    await prisma.caseTag.create({
      data: {
        caseDbId: dbCase.id,
        primaryTopic: jCase.tags.primary_topic as any,
        secondaryTopics: jCase.tags.secondary_topics ?? [],
        litflCategory: (jCase.tags.litfl_category ?? 'ECG') as any,
        difficulty: jCase.tags.difficulty as any,
        boardRelevance: jCase.tags.board_relevance as any,
        clinicalUrgency: jCase.tags.clinical_urgency as any ?? null,
      },
    });

    // Create ClinicalPearls
    if (jCase.clinical_pearls?.length) {
      for (let i = 0; i < jCase.clinical_pearls.length; i++) {
        await prisma.clinicalPearl.create({
          data: {
            caseDbId: dbCase.id,
            text: jCase.clinical_pearls[i],
            sortOrder: i,
          },
        });
      }
    }

    // Process sub-cases
    for (const jSub of jCase.sub_cases) {
      const dbSubCase = await prisma.subCase.create({
        data: {
          subCaseId: jSub.sub_case_id,
          caseDbId: dbCase.id,
          subCaseLabel: jSub.sub_case_label ?? null,
          subCaseContext: jSub.sub_case_context ?? null,
        },
      });

      // Create the first question so we have a questionId for media
      // (QuestionMedia requires a questionId FK)
      const firstJQ = jSub.questions[0];
      if (!firstJQ) continue;

      const firstDbQuestion = await prisma.question.create({
        data: {
          body: firstJQ.question_stem,
          type: 'case_based',
          difficulty: difficultyMap[jCase.tags.difficulty] ?? 3,
          categoryId: cardioCategory.id,
          explanation: firstJQ.answer.interpretation_text ?? firstJQ.answer.summary ?? '',
          ncpaTaskArea: 'Using Diagnostic and Laboratory Studies',
          subCaseId: dbSubCase.id,
          sequence: firstJQ.sequence,
          questionFormat: firstJQ.question_format as any,
          answerSummary: firstJQ.answer.summary ?? null,
          interpretationText: firstJQ.answer.interpretation_text ?? null,
        },
      });
      questionsCreated++;

      // Create media records linked to the first question
      const mediaIdMap: Record<string, string> = {};
      for (const jMedia of jSub.media) {
        const dbMedia = await prisma.questionMedia.create({
          data: {
            questionId: firstDbQuestion.id,
            type: jMedia.type as any,
            url: jMedia.url,
            altText: jMedia.alt_text ?? '',
            attribution: jMedia.attribution ?? 'LITFL ECG Library, CC BY-NC-SA 4.0',
            localFilename: jMedia.local_filename ?? null,
            timing: jMedia.timing as any ?? null,
            mediaRefId: jMedia.media_id,
            subCaseId: dbSubCase.id,
          },
        });
        mediaIdMap[jMedia.media_id] = dbMedia.id;
        mediaCreated++;
      }

      // Create refs + findings + links for the first question
      await createQuestionExtras(firstDbQuestion.id, firstJQ, mediaIdMap);

      // Create remaining questions (if any)
      for (let qi = 1; qi < jSub.questions.length; qi++) {
        const jQ = jSub.questions[qi];
        const dbQuestion = await prisma.question.create({
          data: {
            body: jQ.question_stem,
            type: 'case_based',
            difficulty: difficultyMap[jCase.tags.difficulty] ?? 3,
            categoryId: cardioCategory.id,
            explanation: jQ.answer.interpretation_text ?? jQ.answer.summary ?? '',
            ncpaTaskArea: 'Using Diagnostic and Laboratory Studies',
            subCaseId: dbSubCase.id,
            sequence: jQ.sequence,
            questionFormat: jQ.question_format as any,
            answerSummary: jQ.answer.summary ?? null,
            interpretationText: jQ.answer.interpretation_text ?? null,
          },
        });
        await createQuestionExtras(dbQuestion.id, jQ, mediaIdMap);
        questionsCreated++;
      }
    }

    casesCreated++;
    if (casesCreated % 20 === 0) {
      console.log(`  ... ${casesCreated} cases processed`);
    }
  }

  console.log(`\nDone! Created ${casesCreated} cases, ${questionsCreated} questions, ${mediaCreated} media items.`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
