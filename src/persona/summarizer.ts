import { LlmProvider } from '../llm/types';
import { StoredMessage } from '../firebase/memoryStore';

const SUMMARIZER_SYSTEM_PROMPT = [
  '너는 단체 카카오톡 채팅방의 대화를 장기 기억용으로 요약하는 도우미야.',
  '아래에는 이전까지의 요약과, 그 이후 새로 오간 대화가 주어진다.',
  '이 둘을 합쳐서 갱신된 요약을 작성해라.',
  '',
  '규칙:',
  '- 누가 어떤 사람인지, 성격, 관심사, 최근 있었던 일, 방 안의 인간관계/분위기 등',
  '  나중에 자연스럽게 대화하는 데 도움이 될 사실 위주로 적어라.',
  '- 잡담이나 사소한 농담은 생략하고, 재사용 가치가 있는 정보만 남겨라.',
  '- 5~10개의 짧은 불릿 포인트로 작성해라 (문장 앞에 "- " 사용).',
  '- 설명이나 인사말 없이 요약 내용만 출력해라.',
].join('\n');

function renderTranscript(history: StoredMessage[]): string {
  return history
    .map((m) => `${m.isBot ? '(나)' : m.sender}: ${m.text}`)
    .join('\n');
}

/**
 * Produces a refreshed room summary from the previous summary plus the
 * messages accumulated since. Reuses the same LlmProvider used for replies
 * so no extra provider wiring is needed, but with a dedicated system prompt.
 */
export async function summarizeRoom(
  llm: LlmProvider,
  previousSummary: string,
  recentHistory: StoredMessage[],
): Promise<string> {
  const previousBlock = previousSummary.trim()
    ? `[이전 요약]\n${previousSummary.trim()}`
    : '[이전 요약]\n(아직 없음)';
  const transcriptBlock = `[새 대화]\n${renderTranscript(recentHistory)}`;

  const summary = await llm.generateReply({
    systemPrompt: SUMMARIZER_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `${previousBlock}\n\n${transcriptBlock}` }],
  });

  return summary.trim();
}
