import OpenAI from 'openai';
import { LlmContext, LlmProvider } from './types';
import { withRetry, isRetryableStatus } from './retry';
import { config } from '../config';

const MODEL = 'gpt-4o-mini';

function isRetryableOpenAIError(err: unknown): boolean {
  return err instanceof OpenAI.APIError && isRetryableStatus(err.status);
}

export class OpenAIProvider implements LlmProvider {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generateReply(context: LlmContext): Promise<string> {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: context.systemPrompt },
      ...context.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const completion = await withRetry(
      () => this.client.chat.completions.create({ model: MODEL, messages }),
      isRetryableOpenAIError,
      { maxAttempts: config.llmRetryMaxAttempts, baseDelayMs: config.llmRetryBaseDelayMs },
    );

    return (completion.choices[0]?.message?.content ?? '').trim();
  }
}
