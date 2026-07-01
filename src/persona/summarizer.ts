import { LlmProvider } from '../llm/types';
import { StoredMessage } from '../firebase/memoryStore';
import { Participant, ParticipantUpdate } from '../firebase/participantStore';

const SUMMARIZER_SYSTEM_PROMPT = [
  '너는 단체 카카오톡 채팅방의 대화를 장기 기억용으로 요약하는 도우미야.',
  '아래에는 이전까지의 기억과, 그 이후 새로 오간 대화가 주어진다.',
  '이 둘을 합쳐서 갱신된 기억을 작성해라.',
  '',
  '반드시 아래 JSON 형식으로만 응답해라 (다른 텍스트, 코드블록 없이 순수 JSON만):',
  '{',
  '  "summary": "방 전체의 분위기, 최근 있었던 일, 반복되는 화제 등을 5~10개 불릿(- 로 시작)으로",',
  '  "participants": [',
  '    { "name": "대화에 등장한 사람 이름(원문 그대로)", "profile": "그 사람의 성격, 관심사, 특징, 다른 사람과의 관계 등을 1~3문장으로" }',
  '  ]',
  '}',
  '',
  '규칙:',
  '- 새 대화에 등장한 사람 전원에 대해 participants 항목을 만들어라.',
  '- 이전 기억에 있던 사람 정보는 새 대화 내용으로 갱신하되, 여전히 사실이면 유지해라.',
  '- 잡담이나 사소한 농담은 생략하고, 나중에 자연스러운 대화에 재사용할 가치가 있는 정보만 남겨라.',
  '- name은 새 대화에 실제로 나온 발신자 표시 이름과 정확히 동일한 문자열로 써라.',
].join('\n');

interface RawSummaryResult {
  summary?: unknown;
  participants?: unknown;
}

export interface SummaryResult {
  summary: string;
  participants: { name: string; profile: string }[];
}

function renderTranscript(history: StoredMessage[]): string {
  return history
    .map((m) => `${m.isBot ? '(나)' : m.sender}: ${m.text}`)
    .join('\n');
}

function renderPreviousParticipants(participants: Participant[]): string {
  if (participants.length === 0) return '(아직 없음)';
  return participants.map((p) => `- ${p.nickname}: ${p.profile}`).join('\n');
}

function stripCodeFence(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : raw).trim();
}

function parseResult(raw: string): SummaryResult {
  const cleaned = stripCodeFence(raw);
  let parsed: RawSummaryResult;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Model didn't return valid JSON — fall back to treating the whole
    // response as the room summary with no participant updates, rather than
    // losing the memory update entirely.
    return { summary: cleaned, participants: [] };
  }

  const summary = typeof parsed.summary === 'string' ? parsed.summary : '';
  const participants = Array.isArray(parsed.participants)
    ? parsed.participants
        .filter(
          (p): p is { name: string; profile: string } =>
            typeof p === 'object' &&
            p !== null &&
            typeof (p as any).name === 'string' &&
            typeof (p as any).profile === 'string',
        )
        .map((p) => ({ name: p.name.trim(), profile: p.profile.trim() }))
    : [];

  return { summary: summary.trim(), participants };
}

/**
 * Produces a refreshed room summary plus per-participant profile updates
 * from the previous memory state and the messages accumulated since.
 */
export async function summarizeRoom(
  llm: LlmProvider,
  previousSummary: string,
  previousParticipants: Participant[],
  recentHistory: StoredMessage[],
): Promise<SummaryResult> {
  const previousBlock = [
    `[이전 방 요약]\n${previousSummary.trim() || '(아직 없음)'}`,
    `[이전 참가자 기억]\n${renderPreviousParticipants(previousParticipants)}`,
  ].join('\n\n');
  const transcriptBlock = `[새 대화]\n${renderTranscript(recentHistory)}`;

  const raw = await llm.generateReply({
    systemPrompt: SUMMARIZER_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `${previousBlock}\n\n${transcriptBlock}` }],
  });

  return parseResult(raw);
}

/**
 * Resolves the LLM's name-keyed participant updates against the userIds seen
 * in this batch of history, so profiles are stored against a stable id
 * rather than a nickname that can change.
 */
export function resolveParticipantUpdates(
  result: SummaryResult,
  recentHistory: StoredMessage[],
): ParticipantUpdate[] {
  const nicknameToUserId = new Map<string, string>();
  for (const message of recentHistory) {
    if (!message.isBot && message.senderId) {
      nicknameToUserId.set(message.sender, message.senderId);
    }
  }

  const updates: ParticipantUpdate[] = [];
  for (const p of result.participants) {
    const userId = nicknameToUserId.get(p.name);
    if (!userId) continue; // can't resolve to a stable id — skip rather than guess
    updates.push({ userId, nickname: p.name, profile: p.profile });
  }
  return updates;
}
