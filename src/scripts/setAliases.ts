import { setRoomConfig } from '../firebase/configStore';

/**
 * One-shot CLI to set the room-specific mention aliases (nicknames the bot
 * should also respond to as a direct mention in that room). Overwrites the
 * full list each time.
 * Usage: npm run set-aliases -- <chatId> 별칭1,별칭2,별칭3
 */
async function main(): Promise<void> {
  const [chatId, aliasesRaw] = process.argv.slice(2);

  if (!chatId || !aliasesRaw) {
    console.error('Usage: npm run set-aliases -- <chatId> 별칭1,별칭2,별칭3');
    console.error('Run "npm run list-rooms" to find a room\'s chatId.');
    process.exit(1);
  }

  const aliases = aliasesRaw
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);

  await setRoomConfig(chatId, { aliases });
  console.log(`Aliases updated for room ${chatId}: ${aliases.join(', ') || '(none)'}`);
}

main().catch((err) => {
  console.error('Failed to set aliases:', err instanceof Error ? err.message : err);
  process.exit(1);
});
