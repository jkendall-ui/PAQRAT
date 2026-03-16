/**
 * ECG Interpretation Evaluator
 *
 * Evaluates student answers for each ECG interpretation step using
 * Claude AI with clinically-informed tolerance guidelines.
 *
 * Tolerance values are derived from:
 * - AHA/ACCF/HRS ECG Standardization Recommendations
 * - Medscape Normal ECG Intervals (emedicine.medscape.com/article/2172196)
 * - Inter-observer variability data (PubMed PMID: 33142185)
 *   showing PR ±6ms, QRS ±8ms, QT ±10ms at 75th percentile
 *
 * Content was rephrased for compliance with licensing restrictions.
 */

import { callClaudeWithRetry } from './claudeService';

export const ECG_INTERPRETATION_STEPS = [
  {
    key: 'rate',
    label: 'Rate',
    prompt: 'What is the heart rate?',
    placeholder: 'e.g. 84 bpm, ~80 bpm',
    toleranceNote: '±10 bpm for manual calculation',
  },
  {
    key: 'rhythm',
    label: 'Rhythm',
    prompt: 'What is the rhythm?',
    placeholder: 'e.g. Normal sinus rhythm, Atrial fibrillation',
    toleranceNote: 'Must identify the correct rhythm type',
  },
  {
    key: 'axis',
    label: 'Axis',
    prompt: 'What is the QRS axis?',
    placeholder: 'e.g. Normal axis, Left axis deviation, ~60°',
    toleranceNote: '±15° for numeric values; correct category (normal/LAD/RAD) required',
  },
  {
    key: 'p_waves',
    label: 'P Waves',
    prompt: 'Describe the P waves',
    placeholder: 'e.g. Upright in II, absent, flutter waves',
    toleranceNote: 'Key morphology features must be identified',
  },
  {
    key: 'pr_interval',
    label: 'PR Interval',
    prompt: 'What is the PR interval?',
    placeholder: 'e.g. 200ms, 0.20s, prolonged',
    toleranceNote: '±20ms numeric; normal range 120-200ms; must flag if prolonged (>200ms)',
  },
  {
    key: 'qrs_complex',
    label: 'QRS Complex',
    prompt: 'Describe the QRS complex',
    placeholder: 'e.g. Narrow, wide at 140ms, RBBB pattern',
    toleranceNote: '±20ms numeric; normal <120ms; must identify bundle branch block patterns',
  },
  {
    key: 'qt_interval',
    label: 'QT Interval',
    prompt: 'What is the QT/QTc interval?',
    placeholder: 'e.g. 420ms, QTc 460ms, prolonged',
    toleranceNote: '±20ms numeric; normal QTc <450ms (men) / <460ms (women)',
  },
  {
    key: 'st_segment',
    label: 'ST Segment',
    prompt: 'Describe the ST segment',
    placeholder: 'e.g. ST elevation in II, III, aVF; ST depression in V1-V3',
    toleranceNote: 'Must identify elevation/depression and affected leads',
  },
  {
    key: 't_waves',
    label: 'T Waves',
    prompt: 'Describe the T waves',
    placeholder: 'e.g. Inverted in V1-V4, peaked in V2-V5, normal',
    toleranceNote: 'Must identify inversions, peaking, or biphasic morphology and leads',
  },
  {
    key: 'overall_impression',
    label: 'Overall Impression',
    prompt: 'What is your overall impression / diagnosis?',
    placeholder: 'e.g. Inferior STEMI with right ventricular involvement',
    toleranceNote: 'Must identify the primary diagnosis; partial credit for related findings',
  },
] as const;

export type EcgStepKey = typeof ECG_INTERPRETATION_STEPS[number]['key'];

export interface StepEvaluation {
  stepKey: string;
  judgment: 'correct' | 'acceptable' | 'partially_correct' | 'incorrect';
  feedback: string;
  referenceValue: string;
}

export interface EcgInterpretationResult {
  stepEvaluations: StepEvaluation[];
  overallScore: number; // 0-100
  overallFeedback: string;
}

const SYSTEM_PROMPT = `You are an expert ECG interpretation grader for PA exam students.

You will receive:
1. The reference ECG interpretation (from the answer key)
2. The student's step-by-step answers
3. Clinical tolerance guidelines for each measurement

GRADING RULES:
- "correct": Answer matches the reference within clinical tolerance
- "acceptable": Answer is clinically reasonable but slightly outside ideal range (e.g. rate off by 5-10 bpm)
- "partially_correct": Some correct elements but missing key findings
- "incorrect": Wrong answer or critical misidentification

TOLERANCE GUIDELINES:
- Rate: ±10 bpm for manual calculation methods
- Rhythm: Must correctly identify the rhythm type (sinus, AF, flutter, etc.)
- Axis: ±15° for numeric; must get correct category (normal/LAD/RAD/extreme)
- P waves: Must identify presence/absence and key morphology
- PR interval: ±20ms for numeric values; must flag if >200ms (1st degree block)
- QRS complex: ±20ms for numeric; must identify if wide (>120ms) and pattern (RBBB/LBBB)
- QT interval: ±20ms for numeric; must flag prolongation
- ST segment: Must identify elevation/depression and correct lead groups
- T waves: Must identify inversions, peaking, or biphasic changes and leads
- Overall impression: Must identify the primary diagnosis; partial credit for related findings

Accept equivalent notations: "0.20s" = "200ms" = "200 ms", "~80" = "approximately 80", etc.

Return ONLY valid JSON:
{
  "stepEvaluations": [
    {
      "stepKey": "rate",
      "judgment": "correct|acceptable|partially_correct|incorrect",
      "feedback": "Brief explanation",
      "referenceValue": "What the correct answer is"
    }
  ],
  "overallScore": 0-100,
  "overallFeedback": "Summary of performance"
}`;

export async function evaluateEcgInterpretation(
  referenceAnswer: string,
  studentAnswers: Record<string, string>,
  ecgFindings: string[],
): Promise<EcgInterpretationResult> {
  const stepsWithAnswers = ECG_INTERPRETATION_STEPS.map((step) => ({
    stepKey: step.key,
    label: step.label,
    tolerance: step.toleranceNote,
    studentAnswer: studentAnswers[step.key] ?? '(no answer)',
  }));

  const payload = {
    referenceAnswer,
    ecgFindings,
    studentAnswers: stepsWithAnswers,
  };

  try {
    const raw = await callClaudeWithRetry(
      SYSTEM_PROMPT,
      [{ role: 'user', content: JSON.stringify(payload) }],
      { maxTokens: 2048 },
    );

    // Strip markdown code fences if Claude wraps the JSON in ```json ... ```
    const cleaned = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned);

    // Validate and normalize
    const stepEvaluations: StepEvaluation[] = (parsed.stepEvaluations ?? []).map((e: any) => ({
      stepKey: String(e.stepKey ?? ''),
      judgment: ['correct', 'acceptable', 'partially_correct', 'incorrect'].includes(e.judgment)
        ? e.judgment
        : 'incorrect',
      feedback: String(e.feedback ?? ''),
      referenceValue: String(e.referenceValue ?? ''),
    }));

    return {
      stepEvaluations,
      overallScore: typeof parsed.overallScore === 'number'
        ? Math.max(0, Math.min(100, Math.round(parsed.overallScore)))
        : 0,
      overallFeedback: String(parsed.overallFeedback ?? ''),
    };
  } catch (err) {
    // Log the actual error so we can diagnose failures
    console.error('[ECG Evaluator] Claude API call failed:', err);
    // Fallback if AI fails
    return {
      stepEvaluations: ECG_INTERPRETATION_STEPS.map((step) => ({
        stepKey: step.key,
        judgment: 'incorrect' as const,
        feedback: 'Unable to evaluate automatically. Please review manually.',
        referenceValue: '',
      })),
      overallScore: 0,
      overallFeedback: 'Automatic evaluation failed. Please review your answers against the reference.',
    };
  }
}
