import { config } from '../config';
import { LlmProvider } from './types';
import { GeminiProvider } from './gemini';
import { OpenAIProvider } from './openai';

let provider: LlmProvider | undefined;

export function getLlmProvider(): LlmProvider {
  if (!provider) {
    provider =
      config.llmProvider === 'gemini'
        ? new GeminiProvider(config.geminiApiKey)
        : new OpenAIProvider(config.openaiApiKey);
  }
  return provider;
}

export { LlmProvider, LlmContext, LlmMessage } from './types';
