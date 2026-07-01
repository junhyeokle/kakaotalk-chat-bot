import { GoogleGenerativeAI } from '@google/generative-ai';
import { LlmContext, LlmProvider } from './types';

const MODEL = 'gemini-1.5-flash';

export class GeminiProvider implements LlmProvider {
  private readonly client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async generateReply(context: LlmContext): Promise<string> {
    const model = this.client.getGenerativeModel({
      model: MODEL,
      systemInstruction: context.systemPrompt,
    });

    // Gemini's chat history must start with a user turn and alternate roles.
    // We map assistant->model and drop any leading assistant turns.
    const history = context.messages.map((m) => ({
      role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts: [{ text: m.content }],
    }));

    while (history.length > 0 && history[0].role === 'model') {
      history.shift();
    }

    const last = history.pop();
    if (!last) {
      return '';
    }

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(last.parts[0].text);
    return result.response.text().trim();
  }
}
