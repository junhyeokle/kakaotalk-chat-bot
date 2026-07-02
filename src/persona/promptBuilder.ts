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

  // Non-text messages (stickers, photos) are logged as bracketed placeholders
  // like "[이모티콘: 빵터짐]" or "[사진을 보냄]" rather than real text — spell
  // that convention out so the model doesn't mistake it for literal chat text.
  const formatNote =
    '대화 중 "[이모티콘: ...]"나 "[사진을 보냄]" 같은 대괄호 표기는 실제로 그 텍스트가 ' +
    '전송된 게 아니라, 스티커나 사진이 대신 전송됐다는 뜻이다. 사진의 실제 내용은 너에게 ' +
    '보이지 않으니 마치 본 것처럼 구체적으로 묘사하지 마라.';

  const blocks = [persona, formatNote, ...memoryBlocks];

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
