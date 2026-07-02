import { setRoomConfig } from '../firebase/configStore';

/**
 * One-shot CLI to set the room-specific photo-tag whitelist. A room only
 * ever receives photos whose tags overlap this list (see photoStore.ts) —
 * empty/unset means the room never gets photos at all, so a funny meme
 * uploaded with the "웃김" tag can't accidentally land in a serious room that
 * was never configured to allow it.
 * Usage: npm run set-photo-tags -- <chatId> 웃김,밈
 */
async function main(): Promise<void> {
  const [chatId, tagsRaw] = process.argv.slice(2);

  if (!chatId || !tagsRaw) {
    console.error('Usage: npm run set-photo-tags -- <chatId> 웃김,밈');
    console.error('Run "npm run list-rooms" to find a room\'s chatId.');
    process.exit(1);
  }

  const photoTags = tagsRaw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  await setRoomConfig(chatId, { photoTags });
  console.log(`Photo tags updated for room ${chatId}: ${photoTags.join(', ') || '(none — photos disabled)'}`);
}

main().catch((err) => {
  console.error('Failed to set photo tags:', err instanceof Error ? err.message : err);
  process.exit(1);
});
