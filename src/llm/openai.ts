import OpenAI from 'openai';
import { LlmContext, LlmProvider } from './types';

const MODEL = 'gpt-4o-mini';

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

    const completion = await this.client.chat.completions.create({
      model: MODEL,
      messages,
    });

    return (completion.choices[0]?.message?.content ?? '').trim();
  }
}
