import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock claudeService
vi.mock('../../../src/services/claudeService', () => ({
  callClaudeWithRetry: vi.fn(),
}));

import { callClaudeWithRetry } from '../../../src/services/claudeService';
import { evaluateAnswer } from '../../../src/services/aiAnswerEvaluator';

const baseParams = {
  questionStem: 'A 55-year-old male presents with chest pain. What is the diagnosis?',
  referenceAnswer: 'ST-elevation in leads II, III, aVF indicates inferior STEMI.',
  studentAnswer: 'The ECG shows ST elevation in inferior leads.',
};

describe('aiAnswerEvaluator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns correct judgment from valid Claude response', async () => {
    vi.mocked(callClaudeWithRetry).mockResolvedValue(JSON.stringify({
      judgment: 'correct',
      confidence: 0.95,
      feedback: 'Excellent identification of inferior STEMI.',
      missingConcepts: [],
    }));

    const result = await evaluateAnswer(baseParams);

    expect(result.judgment).toBe('correct');
    expect(result.confidence).toBe(0.95);
    expect(result.feedback).toBe('Excellent identification of inferior STEMI.');
    expect(result.missingConcepts).toEqual([]);
    expect(callClaudeWithRetry).toHaveBeenCalledTimes(1);
  });

  it('returns partially_correct judgment', async () => {
    vi.mocked(callClaudeWithRetry).mockResolvedValue(JSON.stringify({
      judgment: 'partially_correct',
      confidence: 0.7,
      feedback: 'Identified ST elevation but missed specific leads.',
      missingConcepts: ['lead specificity', 'RV involvement'],
    }));

    const result = await evaluateAnswer(baseParams);

    expect(result.judgment).toBe('partially_correct');
    expect(result.confidence).toBe(0.7);
    expect(result.missingConcepts).toEqual(['lead specificity', 'RV involvement']);
  });

  it('returns incorrect judgment', async () => {
    vi.mocked(callClaudeWithRetry).mockResolvedValue(JSON.stringify({
      judgment: 'incorrect',
      confidence: 0.9,
      feedback: 'The answer does not address the ECG findings.',
      missingConcepts: ['ST elevation', 'inferior leads', 'STEMI diagnosis'],
    }));

    const result = await evaluateAnswer(baseParams);

    expect(result.judgment).toBe('incorrect');
    expect(result.confidence).toBe(0.9);
    expect(result.missingConcepts).toHaveLength(3);
  });

  it('falls back to incorrect with low confidence on invalid JSON', async () => {
    vi.mocked(callClaudeWithRetry).mockResolvedValue('This is not valid JSON at all');

    const result = await evaluateAnswer(baseParams);

    expect(result.judgment).toBe('incorrect');
    expect(result.confidence).toBe(0.1);
    expect(result.feedback).toContain('Unable to evaluate');
  });

  it('falls back on Claude API error', async () => {
    vi.mocked(callClaudeWithRetry).mockRejectedValue(new Error('API unavailable'));

    const result = await evaluateAnswer(baseParams);

    expect(result.judgment).toBe('incorrect');
    expect(result.confidence).toBe(0.1);
    expect(result.feedback).toContain('Unable to evaluate');
  });

  it('returns incorrect with full confidence for empty student answer', async () => {
    const result = await evaluateAnswer({
      ...baseParams,
      studentAnswer: '   ',
    });

    expect(result.judgment).toBe('incorrect');
    expect(result.confidence).toBe(1.0);
    expect(result.feedback).toContain('No answer provided');
    expect(callClaudeWithRetry).not.toHaveBeenCalled();
  });

  it('includes ecgFindings in payload when provided', async () => {
    vi.mocked(callClaudeWithRetry).mockResolvedValue(JSON.stringify({
      judgment: 'correct',
      confidence: 0.9,
      feedback: 'Good.',
      missingConcepts: [],
    }));

    await evaluateAnswer({
      ...baseParams,
      ecgFindings: ['ST elevation in II, III, aVF'],
    });

    const callArgs = vi.mocked(callClaudeWithRetry).mock.calls[0];
    const payload = JSON.parse((callArgs[1][0] as any).content);
    expect(payload.ecgFindings).toEqual(['ST elevation in II, III, aVF']);
  });

  it('clamps confidence to 0-1 range', async () => {
    vi.mocked(callClaudeWithRetry).mockResolvedValue(JSON.stringify({
      judgment: 'correct',
      confidence: 1.5,
      feedback: 'Good.',
      missingConcepts: [],
    }));

    const result = await evaluateAnswer(baseParams);
    expect(result.confidence).toBe(1.0);
  });
});
