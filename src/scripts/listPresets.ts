import { listPersonaPresets } from '../firebase/personaPresetStore';

/**
 * One-shot CLI to inspect saved persona presets.
 * Usage: npm run list-presets
 */
async function main(): Promise<void> {
  const presets = await listPersonaPresets();

  if (presets.length === 0) {
    console.log('No persona presets saved yet. Run "npm run save-preset" first.');
    return;
  }

  for (const { id, preset } of presets) {
    console.log(`\n--- preset "${id}" ---`);
    console.log(`personaOverride:\n${preset.personaOverride}`);
    console.log(`guardrails: ${preset.guardrails ? preset.guardrails : '(none)'}`);
    if (preset.fillerPhrases?.length) {
      console.log('fillerPhrases:');
      for (const f of preset.fillerPhrases) {
        console.log(`  ${f.phrase} (${f.frequency}) — ${f.context}`);
      }
    } else {
      console.log('fillerPhrases: (default)');
    }
  }
}

main().catch((err) => {
  console.error('Failed to list presets:', err instanceof Error ? err.message : err);
  process.exit(1);
});
