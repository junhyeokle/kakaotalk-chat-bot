import { LlmContext, LlmMessage } from '../llm/types';
import { StoredMessage } from '../firebase/memoryStore';
import { Participant } from '../firebase/participantStore';
import { defaultPersona } from './defaultPersona';

function renderParticipants(participants: Participant[]): string {
  return participants.map((p) => `- ${p.nickname}: ${p.profile}`).join('\n');
}

/**
 * Builds the LLM context from persona + long-term room memory + guardrails +
 * recent room history.
 *
 * History is rendered as user/assistant turns. Because a group chat has many
 * human speakers (not a 1:1 dialogue), each non-bot message is prefixed with
 * the sender's name so the model can follow who said what.
 */
export function buildPromptContext(
  history: StoredMessage[],
  personaOverride?: string,
  roomSummary?: string,
  participants: Participant[] = [],
  guardrails?: string,
): LlmContext {
  const persona = personaOverride?.trim() ? personaOverride : defaultPersona();

  const memoryBlocks: string[] = [];
  if (roomSummary?.trim()) {
    memoryBlocks.push(`[이 방에 대해 기억하고 있는 것]\n${roomSummary.trim()}`);
  }
  if (participants.length > 0) {
    memoryBlocks.push(`[방 참가자들에 대해 기억하고 있는 것]\n${renderParticipants(participants)}`);
  }

  const blocks = [persona, ...memoryBlocks];

  // Guardrails go last: instructions near the end of a prompt tend to carry
  // the most weight, and these are hard rules that must survive regardless of
  // how the persona text above is written or rewritten.
  if (guardrails?.trim()) {
    blocks.push(`[이 방에서 반드시 지켜야 할 규칙]\n${guardrails.trim()}`);
  }

  const messages: LlmMessage[] = history.map((m) =>
    m.isBot
      ? { role: 'assistant', content: m.text }
      : { role: 'user', content: `${m.sender}: ${m.text}` },
  );

  return { systemPrompt: blocks.join('\n\n'), messages };
}
