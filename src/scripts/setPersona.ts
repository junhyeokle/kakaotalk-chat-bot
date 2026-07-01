import { setRoomConfig } from '../firebase/configStore';

/**
 * One-shot CLI to set a room-specific persona override.
 * Usage: npm run set-persona -- <chatId> "페르소나 텍스트"
 */
async function main(): Promise<void> {
  const [chatId, ...rest] = process.argv.slice(2);
  const personaText = rest.join(' ').trim();

  if (!chatId || !personaText) {
    console.error('Usage: npm run set-persona -- <chatId> "페르소나 텍스트"');
    console.error('Run "npm run list-rooms" to find a room\'s chatId.');
    process.exit(1);
  }

  await setRoomConfig(chatId, { personaOverride: personaText });
  console.log(`Persona updated for room ${chatId}:\n\n${personaText}`);
}

main().catch((err) => {
  console.error('Failed to set persona:', err instanceof Error ? err.message : err);
  process.exit(1);
});
