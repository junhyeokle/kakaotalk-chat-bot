import { setRoomConfig } from '../firebase/configStore';
import { FillerFrequency, FillerPhrase } from '../persona/fillerPhrases';

const FREQUENCY_ALIASES: Record<string, FillerFrequency> = {
  자주: 'high',
  high: 'high',
  가끔: 'medium',
  medium: 'medium',
  거의안씀: 'low',
  거의: 'low',
  low: 'low',
};

/**
 * One-shot CLI to set the room-specific filler-reaction whitelist. Each entry
 * is "표현:빈도:언제 쓰는지" (빈도 = 자주 | 가끔 | 거의안씀) so the judge knows
 * both when a phrase fits and how often this persona reaches for it — e.g. a
 * blunt persona might set "ㅎㅎ:거의안씀:..." while a soft persona sets it to
 * "자주". Overwrites the full list each time. Rooms with looser norms can
 * include coarser phrases here without those ever appearing in a room that
 * wasn't explicitly configured to allow them.
 * Usage: npm run set-filler -- <chatId> "ㅋㅋㅋ:자주:웃긴 상황일 때,인정:가끔:동의할 때"
 */
async function main(): Promise<void> {
  const [chatId, entriesRaw] = process.argv.slice(2);

  if (!chatId || !entriesRaw) {
    console.error(
      'Usage: npm run set-filler -- <chatId> "표현:빈도:언제쓰는지,..." (빈도=자주|가끔|거의안씀)',
    );
    console.error('예: npm run set-filler -- <chatId> "ㅋㅋㅋ:자주:웃긴 상황일 때,인정:가끔:동의할 때"');
    console.error('Run "npm run list-rooms" to find a room\'s chatId.');
    process.exit(1);
  }

  const fillerPhrases: FillerPhrase[] = [];
  for (const entry of entriesRaw.split(',')) {
    const [phraseRaw, frequencyRaw, ...contextParts] = entry.split(':');
    const phrase = phraseRaw?.trim();
    const frequency = frequencyRaw ? FREQUENCY_ALIASES[frequencyRaw.trim()] : undefined;
    const context = contextParts.join(':').trim();

    if (!phrase || !frequency || !context) {
      console.error(
        `잘못된 항목: "${entry}" — "표현:빈도:언제쓰는지" 형식이어야 합니다 (빈도=자주|가끔|거의안씀).`,
      );
      process.exit(1);
    }

    fillerPhrases.push({ phrase, frequency, context });
  }

  await setRoomConfig(chatId, { fillerPhrases });
  console.log(`Filler phrases updated for room ${chatId}:`);
  for (const f of fillerPhrases) {
    console.log(`  ${f.phrase} (${f.frequency}) — ${f.context}`);
  }
}

main().catch((err) => {
  console.error('Failed to set filler phrases:', err instanceof Error ? err.message : err);
  process.exit(1);
});
