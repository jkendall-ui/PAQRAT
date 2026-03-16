import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Anthropic SDK
const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

import { callClaude, callClaudeWithRetry } from '../../../src/services/claudeService';

describe('claudeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('callClaude', () => {
    it('sends correct parameters to the Anthropic API', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'response' }],
      });

      await callClaude('system prompt', [{ role: 'user', content: 'hello' }], {
        model: 'claude-sonnet-4-20250514',
        maxTokens: 512,
        temperature: 0.5,
      });

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 512,
        temperature: 0.5,
        system: 'system prompt',
        messages: [{ role: 'user', content: 'hello' }],
      });
    });

    it('extracts text from response content blocks', async () => {
      mockCreate.mockResolvedValue({
        content: [
          { type: 'text', text: 'the answer' },
        ],
      });

      const result = await callClaude('sys', [{ role: 'user', content: 'q' }]);
      expect(result).toBe('the answer');
    });

    it('returns empty string when no text block in response', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'tool_use', id: 'x', name: 'tool', input: {} }],
      });

      const result = await callClaude('sys', [{ role: 'user', content: 'q' }]);
      expect(result).toBe('');
    });
  });

  describe('callClaudeWithRetry', () => {
    it('retries on 429 status and succeeds', async () => {
      const error429 = new Error('rate limited');
      (error429 as any).status = 429;

      mockCreate
        .mockRejectedValueOnce(error429)
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'success after retry' }],
        });

      const result = await callClaudeWithRetry(
        'sys',
        [{ role: 'user', content: 'q' }],
        { retries: 3 }
      );

      expect(result).toBe('success after retry');
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('throws after max retries exhausted on 429', async () => {
      const error429 = new Error('rate limited');
      (error429 as any).status = 429;

      mockCreate.mockRejectedValue(error429);

      await expect(
        callClaudeWithRetry('sys', [{ role: 'user', content: 'q' }], { retries: 2 })
      ).rejects.toThrow('rate limited');

      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('throws immediately on non-429 errors', async () => {
      const error500 = new Error('server error');
      (error500 as any).status = 500;

      mockCreate.mockRejectedValue(error500);

      await expect(
        callClaudeWithRetry('sys', [{ role: 'user', content: 'q' }], { retries: 3 })
      ).rejects.toThrow('server error');

      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });
});
