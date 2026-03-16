import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock claudeService
vi.mock('../../../src/services/claudeService', () => ({
  callClaudeWithRetry: vi.fn(),
}));

import { callClaudeWithRetry } from '../../../src/services/claudeService';
import { analyzeEcg } from '../../../src/services/aiEcgAnalyzer';

const baseParams = {
  mediaUrl: 'https://example.com/ecg-image.png',
  mediaType: 'image/png' as const,
  clinicalContext: '55-year-old male presenting with chest pain',
};

const validResponse: Record<string, unknown> = {
  rate: '75 bpm, regular',
  rhythm: 'Normal sinus rhythm',
  axis: 'Normal axis',
  intervals: { pr: '160ms', qrs: '80ms', qtc: '420ms' },
  stChanges: 'ST elevation in leads II, III, aVF',
  interpretation: 'Inferior STEMI',
  clinicalSignificance: 'Acute myocardial infarction requiring emergent intervention',
  confidence: 0.92,
};

describe('aiEcgAnalyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns valid ECG analysis from Claude response', async () => {
    vi.mocked(callClaudeWithRetry).mockResolvedValue(JSON.stringify(validResponse));

    const result = await analyzeEcg(baseParams);

    expect(result.rate).toBe('75 bpm, regular');
    expect(result.rhythm).toBe('Normal sinus rhythm');
    expect(result.axis).toBe('Normal axis');
    expect(result.intervals).toEqual({ pr: '160ms', qrs: '80ms', qtc: '420ms' });
    expect(result.stChanges).toBe('ST elevation in leads II, III, aVF');
    expect(result.interpretation).toBe('Inferior STEMI');
    expect(result.clinicalSignificance).toBe(
      'Acute myocardial infarction requiring emergent intervention'
    );
    expect(result.confidence).toBe(0.92);
  });

  it('sends multimodal message with image URL', async () => {
    vi.mocked(callClaudeWithRetry).mockResolvedValue(JSON.stringify(validResponse));

    await analyzeEcg(baseParams);

    const callArgs = vi.mocked(callClaudeWithRetry).mock.calls[0];
    const messages = callArgs[1];
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');

    const content = messages[0].content as any[];
    expect(content[0].type).toBe('image');
    expect(content[0].source.type).toBe('url');
    expect(content[0].source.url).toBe('https://example.com/ecg-image.png');
    expect(content[0].source.media_type).toBe('image/png');
  });

  it('includes clinical context in the message', async () => {
    vi.mocked(callClaudeWithRetry).mockResolvedValue(JSON.stringify(validResponse));

    await analyzeEcg(baseParams);

    const callArgs = vi.mocked(callClaudeWithRetry).mock.calls[0];
    const messages = callArgs[1];
    const content = messages[0].content as any[];
    const textBlock = content.find((b: any) => b.type === 'text');
    expect(textBlock.text).toContain('55-year-old male presenting with chest pain');
  });

  it('falls back to default result on invalid JSON', async () => {
    vi.mocked(callClaudeWithRetry).mockResolvedValue('This is not valid JSON');

    const result = await analyzeEcg(baseParams);

    expect(result.rate).toBe('');
    expect(result.rhythm).toBe('');
    expect(result.confidence).toBe(0.1);
    expect(result.intervals).toEqual({ pr: '', qrs: '', qtc: '' });
  });

  it('falls back on Claude API error', async () => {
    vi.mocked(callClaudeWithRetry).mockRejectedValue(new Error('API unavailable'));

    const result = await analyzeEcg(baseParams);

    expect(result.rate).toBe('');
    expect(result.confidence).toBe(0.1);
    expect(result.interpretation).toBe('');
  });

  it('clamps confidence to 0-1 range', async () => {
    vi.mocked(callClaudeWithRetry).mockResolvedValue(
      JSON.stringify({ ...validResponse, confidence: 1.5 })
    );

    const result = await analyzeEcg(baseParams);
    expect(result.confidence).toBe(1.0);
  });

  it('clamps negative confidence to 0', async () => {
    vi.mocked(callClaudeWithRetry).mockResolvedValue(
      JSON.stringify({ ...validResponse, confidence: -0.5 })
    );

    const result = await analyzeEcg(baseParams);
    expect(result.confidence).toBe(0);
  });

  it('handles missing fields in Claude response gracefully', async () => {
    vi.mocked(callClaudeWithRetry).mockResolvedValue(
      JSON.stringify({ rate: '80 bpm', confidence: 0.7 })
    );

    const result = await analyzeEcg(baseParams);

    expect(result.rate).toBe('80 bpm');
    expect(result.rhythm).toBe('');
    expect(result.axis).toBe('');
    expect(result.intervals).toEqual({ pr: '', qrs: '', qtc: '' });
    expect(result.stChanges).toBe('');
    expect(result.interpretation).toBe('');
    expect(result.clinicalSignificance).toBe('');
    expect(result.confidence).toBe(0.7);
  });

  it('uses maxTokens 1024 when calling Claude', async () => {
    vi.mocked(callClaudeWithRetry).mockResolvedValue(JSON.stringify(validResponse));

    await analyzeEcg(baseParams);

    const callArgs = vi.mocked(callClaudeWithRetry).mock.calls[0];
    expect(callArgs[2]).toEqual({ maxTokens: 1024 });
  });

  it('supports image/jpeg media type', async () => {
    vi.mocked(callClaudeWithRetry).mockResolvedValue(JSON.stringify(validResponse));

    await analyzeEcg({ ...baseParams, mediaType: 'image/jpeg' });

    const callArgs = vi.mocked(callClaudeWithRetry).mock.calls[0];
    const content = callArgs[1][0].content as any[];
    expect(content[0].source.media_type).toBe('image/jpeg');
  });
});
