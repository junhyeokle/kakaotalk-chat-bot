/**
 * Parses a KakaoTalk "export chat" .txt file (PC or mobile format).
 *
 * Message lines look like:
 *   2024년 1월 1일 오후 3:45, 홍길동 : 안녕
 * Multi-line messages have no date prefix on their continuation lines, so any
 * line that doesn't match the message pattern is appended to the previous
 * message instead of being dropped. Join/leave/system notices and the
 * "저장한 날짜" header and "----" date separators don't match the message
 * pattern either and are naturally skipped (they aren't attached to any
 * message since they typically appear between messages, not mid-message —
 * this is a best-effort heuristic, not a guarantee).
 */
const MESSAGE_PATTERN =
  /^\d{4}년 \d{1,2}월 \d{1,2}일 (?:오전|오후) \d{1,2}:\d{2}, (.+?) : ([\s\S]*)$/;
const SEPARATOR_PATTERN = /^-{5,}/;
const HEADER_PATTERN = /^저장한 날짜/;

export interface ParsedExportMessage {
  sender: string;
  text: string;
}

export function parseKakaoExport(raw: string): ParsedExportMessage[] {
  const lines = raw.split(/\r?\n/);
  const messages: ParsedExportMessage[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    if (SEPARATOR_PATTERN.test(line) || HEADER_PATTERN.test(line)) continue;

    const match = line.match(MESSAGE_PATTERN);
    if (match) {
      messages.push({ sender: match[1].trim(), text: match[2].trim() });
    } else if (messages.length > 0) {
      messages[messages.length - 1].text += `\n${line}`;
    }
  }

  return messages;
}
