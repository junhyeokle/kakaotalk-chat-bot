import { LlmContext, LlmMessage } from '../llm/types';
import { StoredMessage } from '../firebase/memoryStore';
import { defaultPersona } from './defaultPersona';

/**
 * Builds the LLM context from persona + recent room history.
 *
 * History is rendered as user/assistant turns. Because a group chat has many
 * human speakers (not a 1:1 dialogue), each non-bot message is prefixed with
 * the sender's name so the model can follow who said what.
 */
export function buildPromptContext(
  history: StoredMessage[],
  personaOverride?: string,
  roomSummary?: string,
): LlmContext {
  const persona = personaOverride?.trim() ? personaOverride : defaultPersona();
  const systemPrompt = roomSummary?.trim()
    ? `${persona}\n\n[이 방에 대해 기억하고 있는 것]\n${roomSummary.trim()}`
    : persona;

  const messages: LlmMessage[] = history.map((m) =>
    m.isBot
      ? { role: 'assistant', content: m.text }
      : { role: 'user', content: `${m.sender}: ${m.text}` },
  );

  return { systemPrompt, messages };
}
