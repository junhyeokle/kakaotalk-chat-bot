import { getRoomConfig } from '../firebase/configStore';
import { savePersonaPreset } from '../firebase/personaPresetStore';

/**
 * One-shot CLI: snapshots a room's current personaOverride + guardrails +
 * fillerPhrases into a named, reusable preset. Configure a room the way you
 * want it first (npm run set-persona / set-guardrails / set-filler), then
 * snapshot it here instead of re-typing the same values into every room that
 * should share that persona.
 * Usage: npm run save-preset -- <presetId> <sourceChatId>
 */
async function main(): Promise<void> {
  const [presetId, sourceChatId] = process.argv.slice(2);

  if (!presetId || !sourceChatId) {
    console.error('Usage: npm run save-preset -- <presetId> <sourceChatId>');
    console.error('Run "npm run list-rooms" to find a room\'s chatId.');
    process.exit(1);
  }

  const roomConfig = await getRoomConfig(sourceChatId);
  if (!roomConfig.personaOverride) {
    console.error(
      `Room ${sourceChatId} has no personaOverride set — nothing distinctive to snapshot. ` +
        'Run "npm run set-persona" on it first.',
    );
    process.exit(1);
  }

  await savePersonaPreset(presetId, {
    personaOverride: roomConfig.personaOverride,
    guardrails: roomConfig.guardrails,
    fillerPhrases: roomConfig.fillerPhrases,
    savedAt: Date.now(),
  });

  console.log(`Preset "${presetId}" saved from room ${sourceChatId}.`);
  console.log(`Apply it to another room with: npm run apply-preset -- ${presetId} <targetChatId>`);
}

main().catch((err) => {
  console.error('Failed to save preset:', err instanceof Error ? err.message : err);
  process.exit(1);
});
