/**
 * Detects a direct mention of the bot: its configured name, an "@name" tag,
 * or a Korean vocative form ("길동아", "길동아 뭐하냐") — the latter is just a
 * substring match on the base name/alias, since the vocative particle (아/야)
 * is appended directly with no space.
 *
 * Also checks any room-specific aliases/nicknames the bot is known by in
 * that particular group chat.
 */
export function detectMention(text: string, botName: string, aliases: string[]): boolean {
  const lowerText = text.toLowerCase();
  const names = [botName, ...aliases].map((n) => n.trim().toLowerCase()).filter(Boolean);
  return names.some((name) => lowerText.includes(name));
}
