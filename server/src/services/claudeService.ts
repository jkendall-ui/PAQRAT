import Anthropic from '@anthropic-ai/sdk';

// Lazy-init so dotenv.config() in env.ts runs before we read ANTHROPIC_API_KEY
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic();
  }
  return _client;
}

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | Anthropic.ContentBlock[];
}

export async function callClaude(
  systemPrompt: string,
  messages: ClaudeMessage[],
  options?: { model?: string; maxTokens?: number; temperature?: number }
): Promise<string> {
  const res = await getClient().messages.create({
    model: options?.model ?? process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-20250514',
    max_tokens: options?.maxTokens ?? parseInt(process.env.CLAUDE_MAX_TOKENS ?? '1024'),
    temperature: options?.temperature ?? 0.3,
    system: systemPrompt,
    messages: messages as Anthropic.MessageParam[],
  });
  const textBlock = res.content.find((b) => b.type === 'text');
  return (textBlock as Anthropic.TextBlock)?.text ?? '';
}

export async function callClaudeWithRetry(
  systemPrompt: string,
  messages: ClaudeMessage[],
  options?: { model?: string; maxTokens?: number; temperature?: number; retries?: number }
): Promise<string> {
  const maxRetries = options?.retries ?? 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await callClaude(systemPrompt, messages, options);
    } catch (err: any) {
      if (err?.status === 429 && attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Claude API call failed after retries');
}
