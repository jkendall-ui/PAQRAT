import { callClaudeWithRetry, ClaudeMessage } from './claudeService';

export interface ECGAnalysis {
  rate: string;
  rhythm: string;
  axis: string;
  intervals: { pr: string; qrs: string; qtc: string };
  stChanges: string;
  interpretation: string;
  clinicalSignificance: string;
  confidence: number;
}

export interface AnalyzeEcgParams {
  mediaUrl: string;
  mediaType: 'image/png' | 'image/jpeg';
  clinicalContext: string;
}

const SYSTEM_PROMPT = `You are a board-certified cardiologist reviewing a 12-lead ECG.

Provide a structured interpretation:
1. Rate and rhythm
2. Axis
3. Intervals (PR, QRS, QT/QTc)
4. ST-segment / T-wave changes
5. Overall interpretation
6. Clinical significance

Return ONLY valid JSON:
{
  "rate": "string",
  "rhythm": "string",
  "axis": "string",
  "intervals": { "pr": "string", "qrs": "string", "qtc": "string" },
  "stChanges": "string",
  "interpretation": "string",
  "clinicalSignificance": "string",
  "confidence": 0.0-1.0
}`;

const DEFAULT_RESULT: ECGAnalysis = {
  rate: '',
  rhythm: '',
  axis: '',
  intervals: { pr: '', qrs: '', qtc: '' },
  stChanges: '',
  interpretation: '',
  clinicalSignificance: '',
  confidence: 0.1,
};

function parseEcgResponse(raw: string): ECGAnalysis {
  const parsed = JSON.parse(raw);

  const rate = typeof parsed.rate === 'string' ? parsed.rate : '';
  const rhythm = typeof parsed.rhythm === 'string' ? parsed.rhythm : '';
  const axis = typeof parsed.axis === 'string' ? parsed.axis : '';

  const intervals = {
    pr: typeof parsed.intervals?.pr === 'string' ? parsed.intervals.pr : '',
    qrs: typeof parsed.intervals?.qrs === 'string' ? parsed.intervals.qrs : '',
    qtc: typeof parsed.intervals?.qtc === 'string' ? parsed.intervals.qtc : '',
  };

  const stChanges = typeof parsed.stChanges === 'string' ? parsed.stChanges : '';
  const interpretation = typeof parsed.interpretation === 'string' ? parsed.interpretation : '';
  const clinicalSignificance =
    typeof parsed.clinicalSignificance === 'string' ? parsed.clinicalSignificance : '';

  const rawConfidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;
  const confidence = Math.max(0, Math.min(1, rawConfidence));

  return { rate, rhythm, axis, intervals, stChanges, interpretation, clinicalSignificance, confidence };
}

export async function analyzeEcg(params: AnalyzeEcgParams): Promise<ECGAnalysis> {
  const { mediaUrl, mediaType, clinicalContext } = params;

  const messages: ClaudeMessage[] = [
    {
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'url',
            url: mediaUrl,
            media_type: mediaType,
          },
        },
        {
          type: 'text',
          text: `Clinical context: ${clinicalContext}\n\nPlease interpret this ECG.`,
        },
      ] as any,
    },
  ];

  try {
    const raw = await callClaudeWithRetry(SYSTEM_PROMPT, messages, { maxTokens: 1024 });
    return parseEcgResponse(raw);
  } catch {
    return { ...DEFAULT_RESULT };
  }
}
