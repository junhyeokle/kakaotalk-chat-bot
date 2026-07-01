// Delay tuning: a real person doesn't reply instantly and takes longer for
// longer messages (reading + typing). We model that as a base "reading" delay
// plus a per-character "typing" cost, capped so very long replies don't stall.
const BASE_DELAY_MS = 800;
const MS_PER_CHAR = 45;
const MAX_DELAY_MS = 6000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function typingDelayFor(text: string): number {
  return Math.min(BASE_DELAY_MS + text.length * MS_PER_CHAR, MAX_DELAY_MS);
}

/**
 * Splits a reply into sentence-sized chunks so long replies are sent as a few
 * sequential messages, the way people actually text, rather than one wall of
 * text. Short replies stay as a single message.
 */
export function splitIntoMessages(reply: string): string[] {
  const trimmed = reply.trim();
  if (trimmed.length <= 80) return [trimmed];

  const parts = trimmed
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return parts.length > 0 ? parts : [trimmed];
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
