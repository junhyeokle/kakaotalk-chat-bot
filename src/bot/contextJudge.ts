import { LlmContext, LlmProvider } from '../llm/types';
import { tryParseJson } from '../llm/jsonUtil';
import { FillerFrequency, FillerPhrase } from '../persona/fillerPhrases';

const FREQUENCY_LABEL: Record<FillerFrequency, string> = {
  high: '자주 씀',
  medium: '가끔 씀',
  low: '거의 안 씀 — 정말 어울릴 때만',
};

export type JudgeMode = 'none' | 'filler' | 'meaningful';

export interface JudgeOptions {
  /** Whether a real, substantive reply is allowed right now (cooldown elapsed). */
  meaningfulAllowed: boolean;
  /** Whether a cheap filler reaction (ㅋㅋㅋ, 인정, ...) is allowed right now. */
  fillerAllowed: boolean;
  /** The whitelist of filler phrases this room may use, each with a usage hint. */
  fillerPhrases: FillerPhrase[];
}

interface RawJudgeResult {
  mode?: unknown;
  reply?: unknown;
}

export interface JudgeResult {
  mode: JudgeMode;
  reply: string;
}

function buildInstructions(options: JudgeOptions): string {
  const allowedModes: string[] = ['"none" (아무 반응도 하지 않음)'];
  if (options.fillerAllowed) {
    allowedModes.push('"filler" (아래 필러 목록 중 지금 상황에 맞는 것 하나를 그대로 골라서 보냄)');
  }
  if (options.meaningfulAllowed) {
    allowedModes.push('"meaningful" (실제 생각을 담은 답장을 새로 작성해서 보냄)');
  }

  const lines = [
    '',
    '---',
    '방금 새 메시지가 도착했다. 너는 멘션당하지 않았고, 반응할지 말지는 네 자유다.',
    '실제 사람은 대화의 대부분을 "ㅋㅋㅋ", "인정", "ㄹㅇ" 같은 짧은 필러 반응으로 채우고,',
    '진짜 할 말이 있을 때만 제대로 된 답장을 한다는 걸 기억해라 — 매번 "none"을 고르지 마라.',
    '',
    `지금 고를 수 있는 선택지: ${allowedModes.join(', ')}`,
    '',
    '판단 기준:',
    '- 필러를 고를 땐 아래 목록에서 "지금 상황"에 실제로 맞는 표현만 골라라.',
    '  예: 웃긴 얘기가 아닌데 "ㅋㅋㅋ"를 쓰거나, 동의할 상황이 아닌데 "인정"을 쓰지 마라.',
    '- 네 생각/정보를 보탤 상황이거나 직접적인 화제면 meaningful을 골라라 (허용된 경우에만).',
    '- 다른 사람들끼리 이미 활발히 대화 중이고 낄 타이밍이 아니면 none을 골라라.',
  ];

  if (options.fillerAllowed) {
    lines.push('', '[사용 가능한 필러 목록 — "표현 (사용 빈도): 언제 쓰는지"]');
    for (const f of options.fillerPhrases) {
      lines.push(`- ${f.phrase} (${FREQUENCY_LABEL[f.frequency]}): ${f.context}`);
    }
    lines.push(
      '사용 빈도를 반드시 지켜라 — "거의 안 씀"인 표현은 정말 상황에 딱 맞을 때만 드물게 골라라.',
      'filler를 고를 때는 표현을 정확히 그대로 써라. 새로 만들거나 변형하지 마라.',
    );
  }

  lines.push(
    '',
    '아래 JSON 형식으로만 답해라 (다른 텍스트, 코드블록 없이 순수 JSON만):',
    '{"mode": "none" 또는 "filler" 또는 "meaningful", "reply": "mode가 none이 아닐 때 보낼 텍스트, none이면 빈 문자열"}',
  );

  return lines.join('\n');
}

/**
 * Asks the LLM to decide, given the persona/memory/history context, how (if
 * at all) to react to the latest message right now — nothing, a quick filler
 * reaction, or a real reply — and to produce that reaction in the same call.
 * Combining the decision and the content into one call keeps the cost the
 * same as a normal reply (not doubled).
 */
export async function judgeAndMaybeReply(
  llm: LlmProvider,
  baseContext: LlmContext,
  options: JudgeOptions,
): Promise<JudgeResult> {
  if (!options.meaningfulAllowed && !options.fillerAllowed) {
    return { mode: 'none', reply: '' };
  }

  const context: LlmContext = {
    ...baseContext,
    systemPrompt: `${baseContext.systemPrompt}\n${buildInstructions(options)}`,
  };

  const raw = await llm.generateReply(context);
  const parsed = tryParseJson<RawJudgeResult>(raw);
  if (!parsed) return { mode: 'none', reply: '' };

  const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : '';
  const mode = parsed.mode === 'filler' ? 'filler' : parsed.mode === 'meaningful' ? 'meaningful' : 'none';

  if (mode === 'meaningful' && options.meaningfulAllowed && reply) {
    return { mode: 'meaningful', reply };
  }

  // Filler is a whitelist, not free generation — if the model didn't pick an
  // exact allowed phrase, treat it as not responding rather than letting an
  // uncontrolled phrase slip into a room it wasn't approved for.
  if (
    mode === 'filler' &&
    options.fillerAllowed &&
    options.fillerPhrases.some((f) => f.phrase === reply)
  ) {
    return { mode: 'filler', reply };
  }

  return { mode: 'none', reply: '' };
}
