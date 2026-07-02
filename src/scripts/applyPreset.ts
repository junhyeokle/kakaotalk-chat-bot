import { getPersonaPreset } from '../firebase/personaPresetStore';
import { setRoomConfig } from '../firebase/configStore';

/**
 * One-shot CLI: applies a saved persona preset (see "npm run save-preset")
 * to a room by chatId — copying its personaOverride, guardrails, and
 * fillerPhrases in one shot instead of re-entering them by hand.
 * Usage: npm run apply-preset -- <presetId> <chatId>
 */
async function main(): Promise<void> {
  const [presetId, chatId] = process.argv.slice(2);

  if (!presetId || !chatId) {
    console.error('Usage: npm run apply-preset -- <presetId> <chatId>');
    console.error('Run "npm run list-presets" to see saved presets, "npm run list-channels" for chatId.');
    process.exit(1);
  }

  const preset = await getPersonaPreset(presetId);
  if (!preset) {
    console.error(`No persona preset found with id "${presetId}". Run "npm run save-preset" first.`);
    process.exit(1);
  }

  await setRoomConfig(chatId, {
    personaOverride: preset.personaOverride,
    guardrails: preset.guardrails,
    fillerPhrases: preset.fillerPhrases,
  });

  console.log(`Preset "${presetId}" applied to room ${chatId}.`);
  console.log('Takes effect on the room\'s next message.');
}

main().catch((err) => {
  console.error('Failed to apply preset:', err instanceof Error ? err.message : err);
  process.exit(1);
});
