import { setRoomConfig } from '../firebase/configStore';

/**
 * One-shot CLI to set room-specific guardrails (hard rules injected into
 * every prompt for that room — topics to avoid, how far dark humor/profanity
 * can go, etc.). Kept separate from personaOverride so rewriting the
 * persona's tone doesn't accidentally drop the room's rules.
 * Usage: npm run set-guardrails -- <chatId> "규칙 텍스트"
 */
async function main(): Promise<void> {
  const [chatId, ...rest] = process.argv.slice(2);
  const guardrails = rest.join(' ').trim();

  if (!chatId || !guardrails) {
    console.error('Usage: npm run set-guardrails -- <chatId> "규칙 텍스트"');
    console.error('Run "npm run list-rooms" to find a room\'s chatId.');
    process.exit(1);
  }

  await setRoomConfig(chatId, { guardrails });
  console.log(`Guardrails updated for room ${chatId}:\n\n${guardrails}`);
}

main().catch((err) => {
  console.error('Failed to set guardrails:', err instanceof Error ? err.message : err);
  process.exit(1);
});
