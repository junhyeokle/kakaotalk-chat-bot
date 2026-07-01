import { LlmContext, LlmProvider } from '../llm/types';
import { tryParseJson } from '../llm/jsonUtil';

const JUDGE_INSTRUCTIONS = [
  '',
  '---',
  '방금 새 메시지가 도착했다. 너는 멘션당하지 않았고, 대화에 낄지 말지는 네 자유다.',
  '판단 기준:',
  '- 다른 사람들끼리 이미 활발히 대화 중이고 낄 타이밍이 아니면 끼지 마라.',
  '- 네가 자연스럽게 반응하거나 보탤 말이 있는 상황이면 껴도 좋다.',
  '- 너무 자주 끼어들면 부담스러운 애로 보인다는 걸 감안해서, 애매하면 끼지 마라.',
  '',
  '아래 JSON 형식으로만 답해라 (다른 텍스트, 코드블록 없이 순수 JSON만):',
  '{"respond": true 또는 false, "reply": "respond가 true일 때 실제로 보낼 메시지, false면 빈 문자열"}',
].join('\n');

interface RawJudgeResult {
  respond?: unknown;
  reply?: unknown;
}

export interface JudgeResult {
  respond: boolean;
  reply: string;
}

/**
 * Asks the LLM to decide, given the persona/memory/history context, whether
 * jumping into the conversation right now is natural — and if so, to give
 * the reply in the same call. Combining the decision and the reply into one
 * call keeps the cost the same as a normal reply (not double).
 */
export async function judgeAndMaybeReply(
  llm: LlmProvider,
  baseContext: LlmContext,
): Promise<JudgeResult> {
  const context: LlmContext = {
    ...baseContext,
    systemPrompt: `${baseContext.systemPrompt}\n${JUDGE_INSTRUCTIONS}`,
  };

  const raw = await llm.generateReply(context);
  const parsed = tryParseJson<RawJudgeResult>(raw);
  if (!parsed) return { respond: false, reply: '' };

  const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : '';
  return { respond: parsed.respond === true && reply.length > 0, reply };
}
