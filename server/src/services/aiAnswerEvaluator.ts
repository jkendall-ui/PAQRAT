import { callClaudeWithRetry } from './claudeService';

export interface EvalResult {
  judgment: 'correct' | 'partially_correct' | 'incorrect';
  confidence: number;
  feedback: string;
  missingConcepts: string[];
}

export interface EvaluateAnswerParams {
  questionStem: string;
  referenceAnswer: string;
  studentAnswer: string;
  ecgFindings?: string[];
}

const SYSTEM_PROMPT = `You are a PA exam grader. Evaluate the student's free-text answer against the reference answer.

Return ONLY valid JSON:
{
  "judgment": "correct" | "partially_correct" | "incorrect",
  "confidence": 0.0–1.0,
  "feedback": "Brief explanation of what was right/wrong.",
  "missingConcepts": ["concept1", "concept2"]
}`;

const DEFAULT_RESULT: EvalResult = {
  judgment: 'incorrect',
  confidence: 0.1,
  feedback: 'Unable to evaluate answer automatically. Please review manually.',
  missingConcepts: [],
};

function parseEvalResponse(raw: string): EvalResult {
  const parsed = JSON.parse(raw);

  const validJudgments = ['correct', 'partially_correct', 'incorrect'];
  if (!validJudgments.includes(parsed.judgment)) {
    throw new Error(`Invalid judgment: ${parsed.judgment}`);
  }

  const confidence = typeof parsed.confidence === 'number'
    ? Math.max(0, Math.min(1, parsed.confidence))
    : 0.5;

  return {
    judgment: parsed.judgment,
    confidence,
    feedback: typeof parsed.feedback === 'string' ? parsed.feedback : '',
    missingConcepts: Array.isArray(parsed.missingConcepts)
      ? parsed.missingConcepts.filter((c: unknown) => typeof c === 'string')
      : [],
  };
}

export async function evaluateAnswer(params: EvaluateAnswerParams): Promise<EvalResult> {
  const { questionStem, referenceAnswer, studentAnswer, ecgFindings } = params;

  if (!studentAnswer.trim()) {
    return {
      judgment: 'incorrect',
      confidence: 1.0,
      feedback: 'No answer provided.',
      missingConcepts: [],
    };
  }

  const payload: Record<string, unknown> = {
    questionStem,
    referenceAnswer,
    studentAnswer,
  };
  if (ecgFindings && ecgFindings.length > 0) {
    payload.ecgFindings = ecgFindings;
  }

  try {
    const raw = await callClaudeWithRetry(
      SYSTEM_PROMPT,
      [{ role: 'user', content: JSON.stringify(payload) }],
      { maxTokens: 512 }
    );

    return parseEvalResponse(raw);
  } catch {
    return { ...DEFAULT_RESULT };
  }
}
