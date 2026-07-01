import { LlmProvider } from '../llm/types';
import { tryParseJson } from '../llm/jsonUtil';
import { ParsedExportMessage } from '../scripts/lib/parseKakaoExport';

const ANALYZER_SYSTEM_PROMPT = [
  '너는 카카오톡 단체 채팅방의 과거 대화 기록을 분석해서, 봇이 이 방에 처음 들어가도',
  '바로 그 방 사람들처럼 자연스럽게 어울리도록 준비시키는 도우미야.',
  '',
  '아래에 이 방에서 오간 대화 샘플이 주어진다. 이걸 바탕으로 분석해라:',
  '- vibe: 이 방의 전체적인 분위기 (친한 정도, 텐션, 유머 코드, 자주 쓰는 밈/말투 등)',
  '- contentRating: 대화 수위 (반말/존댓말 비율, 욕설·비속어 빈도, 19금/과격한 드립 여부 등)',
  '- topics: 자주 나오는 화제/관심사 목록',
  '- personaSuggestion: 위 분석을 반영해서, 봇이 이 방에서 바로 쓸 수 있는 완성된',
  '  페르소나 시스템 프롬프트. 아래 형식을 따르되 이 방 분위기에 맞게 내용을 채워라:',
  '    * 이름, 성격, 말투(반말/존댓말, 이모티콘 사용 빈도)를 이 방 수위에 맞게 설정',
  '    * 관심사/화제를 이 방에서 실제로 나온 것들로 채움',
  '    * "절대 AI/봇/챗봇이라고 밝히지 마라, 너는 사람 친구다" 규칙은 반드시 포함',
  '    * "답장은 짧고 자연스럽게" 같은 일반 대화 규칙도 포함',
  '',
  '반드시 아래 JSON 형식으로만 응답해라 (다른 텍스트, 코드블록 없이 순수 JSON만):',
  '{',
  '  "vibe": "...",',
  '  "contentRating": "...",',
  '  "topics": ["...", "..."],',
  '  "personaSuggestion": "..."',
  '}',
].join('\n');

export interface RoomProfileAnalysis {
  vibe: string;
  contentRating: string;
  topics: string[];
  personaSuggestion: string;
}

interface RawAnalysis {
  vibe?: unknown;
  contentRating?: unknown;
  topics?: unknown;
  personaSuggestion?: unknown;
}

function renderTranscript(messages: ParsedExportMessage[]): string {
  return messages.map((m) => `${m.sender}: ${m.text}`).join('\n');
}

export async function analyzeRoomExport(
  llm: LlmProvider,
  roomLabel: string,
  messages: ParsedExportMessage[],
): Promise<RoomProfileAnalysis> {
  const raw = await llm.generateReply({
    systemPrompt: ANALYZER_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `[방 이름] ${roomLabel}\n\n[대화 샘플]\n${renderTranscript(messages)}`,
      },
    ],
  });

  const parsed = tryParseJson<RawAnalysis>(raw);
  if (!parsed) {
    throw new Error(
      '분석 결과를 JSON으로 파싱하지 못했습니다. LLM 응답:\n' + raw,
    );
  }

  return {
    vibe: typeof parsed.vibe === 'string' ? parsed.vibe.trim() : '',
    contentRating: typeof parsed.contentRating === 'string' ? parsed.contentRating.trim() : '',
    topics: Array.isArray(parsed.topics)
      ? parsed.topics.filter((t): t is string => typeof t === 'string').map((t) => t.trim())
      : [],
    personaSuggestion:
      typeof parsed.personaSuggestion === 'string' ? parsed.personaSuggestion.trim() : '',
  };
}
