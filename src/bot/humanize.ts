// Delay tuning: a real person doesn't reply instantly and takes longer for
// longer messages (reading + typing). We model that as a base "reading" delay
// plus a per-character "typing" cost, capped so very long replies don't stall.
// A little random jitter keeps the timing from feeling perfectly mechanical.
const BASE_DELAY_MS = 800;
const MS_PER_CHAR = 45;
const MAX_DELAY_MS = 6000;
const JITTER_RATIO = 0.2;

// However chatty a reply gets, cap how many bubbles it becomes — beyond this
// it reads as spam rather than a real person texting in bursts.
const MAX_CHUNKS = 5;
// A single unbroken line longer than this gets split on sentence punctuation
// too, in case the model writes one long line instead of using \n.
const LONG_LINE_THRESHOLD = 60;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function typingDelayFor(text: string): number {
  const base = Math.min(BASE_DELAY_MS + text.length * MS_PER_CHAR, MAX_DELAY_MS);
  const jitter = base * JITTER_RATIO * (Math.random() * 2 - 1);
  return Math.max(200, Math.round(base + jitter));
}

/**
 * Splits a reply into bubble-sized chunks the way a real person actually
 * texts: prefers the model's own line breaks (it's prompted to use \n
 * between separate thoughts) and only falls back to splitting a long,
 * unbroken line on sentence punctuation. Capped so a runaway reply can't
 * turn into a wall of tiny messages.
 */
export function splitIntoMessages(reply: string): string[] {
  const lines = reply
    .trim()
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return [];

  const chunks = lines.flatMap((line) =>
    line.length > LONG_LINE_THRESHOLD
      ? line
          .split(/(?<=[.!?。！？])\s+/)
          .map((p) => p.trim())
          .filter((p) => p.length > 0)
      : [line],
  );

  if (chunks.length <= MAX_CHUNKS) return chunks;

  // Too many pieces — merge the tail back into the last kept chunk rather
  // than silently dropping content.
  const head = chunks.slice(0, MAX_CHUNKS - 1);
  const tail = chunks.slice(MAX_CHUNKS - 1).join(' ');
  return [...head, tail];
}

/**
 * Sends each message chunk with a humanized delay proportional to its length.
 */
export async function sendHumanized(
  reply: string,
  send: (text: string) => Promise<void>,
): Promise<void> {
  for (const chunk of splitIntoMessages(reply)) {
    await sleep(typingDelayFor(chunk));
    await send(chunk);
  }
}
