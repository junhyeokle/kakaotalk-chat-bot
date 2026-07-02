export type FillerFrequency = 'high' | 'medium' | 'low';

export interface FillerPhrase {
  phrase: string;
  /** When this phrase actually fits, so the LLM doesn't fire it out of context. */
  context: string;
  /** How often this persona reaches for this phrase versus other options. */
  frequency: FillerFrequency;
}

function repeatChar(char: string, count: number): string {
  return char.repeat(count);
}

// 3~8 length variants of "ㅋㅋㅋ" so a bigger laugh can go longer ("ㅋㅋㅋㅋㅋㅋㅋㅋ")
// instead of being capped at one fixed length. Enumerated explicitly rather
// than pattern-matched, so the filler system stays a closed whitelist.
const LAUGH_VARIANTS: FillerPhrase[] = Array.from({ length: 6 }, (_, i) => ({
  phrase: repeatChar('ㅋ', i + 3),
  context: '웃기거나 재밌는 말/사진/상황일 때 (더 웃길수록 더 길게)',
  frequency: 'high',
}));

/**
 * Default pool of low-effort "filler" reactions — the ㅋㅋㅋ/인정 style
 * one-word chat real people send far more often than an actual reply. Each
 * phrase carries a usage hint and a frequency so the judge picks
 * contextually and at a natural rate instead of grabbing any phrase off the
 * list equally often. Rooms can override this list entirely (see
 * RoomConfig.fillerPhrases) — e.g. a blunter persona might drop "ㅎㅎ" to
 * "low" and add coarser phrases that would be inappropriate to ship here as
 * a global default.
 */
export const DEFAULT_FILLER_PHRASES: FillerPhrase[] = [
  ...LAUGH_VARIANTS,
  { phrase: 'ㅎㅎ', context: '가볍게 웃으며 반응할 때', frequency: 'medium' },
  {
    phrase: '인정',
    context: '상대의 의견/주장에 동의할 때 (웃긴 상황엔 쓰지 않음)',
    frequency: 'medium',
  },
  { phrase: 'ㅇㅈ', context: '"인정"과 같은 뜻, 더 캐주얼한 표현', frequency: 'medium' },
  { phrase: 'ㄹㅇ', context: '상대 말에 공감하며 맞장구칠 때', frequency: 'medium' },
  {
    phrase: 'ㄹㅇㅋㅋ',
    context: '깊이 생각 안 하고 영혼 없이 편승하듯 맞장구칠 때',
    frequency: 'medium',
  },
  { phrase: 'ㅇㅋ', context: '가벼운 승낙/확인 답변일 때', frequency: 'medium' },
  { phrase: '헐', context: '놀랍거나 예상 밖의 얘기를 들었을 때', frequency: 'medium' },
  { phrase: '오', context: '흥미롭거나 감탄할 만한 얘기를 들었을 때', frequency: 'medium' },
  { phrase: '대박', context: '놀랍거나 대단한 얘기를 들었을 때', frequency: 'medium' },
  { phrase: '와', context: '감탄할 때', frequency: 'medium' },
  { phrase: 'ㅁㅊ', context: '"헐/대박/와"와 비슷하게 놀라운 얘기를 들었을 때', frequency: 'medium' },
];
