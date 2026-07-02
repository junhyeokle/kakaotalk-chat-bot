import { db } from '../firebase/admin';
import { getAllParticipants } from '../firebase/participantStore';

/**
 * One-shot CLI to inspect what the bot currently remembers per room.
 * Usage: npm run list-rooms
 */
async function main(): Promise<void> {
  const snapshot = await db.collection('rooms').get();

  if (snapshot.empty) {
    console.log('No rooms recorded yet — the bot needs to see at least one message first.');
    return;
  }

  for (const doc of snapshot.docs) {
    const chatId = doc.id;
    const data = doc.data();
    const participants = await getAllParticipants(chatId);

    console.log(`\n--- room ${chatId} ---`);
    console.log(`enabled: ${data.enabled ?? true}`);
    console.log(`aliases: ${Array.isArray(data.aliases) && data.aliases.length ? data.aliases.join(', ') : '(none)'}`);
    console.log(`personaOverride: ${data.personaOverride ? data.personaOverride : '(default persona)'}`);
    console.log(`guardrails: ${data.guardrails ? data.guardrails : '(none)'}`);
    if (Array.isArray(data.fillerPhrases) && data.fillerPhrases.length) {
      console.log('fillerPhrases:');
      for (const f of data.fillerPhrases) {
        console.log(`  ${f.phrase} (${f.frequency}) — ${f.context}`);
      }
    } else {
      console.log('fillerPhrases: (default)');
    }
    console.log(`messagesSinceSummary: ${data.messagesSinceSummary ?? 0}`);
    console.log(`messagesSinceSpontaneousReply: ${data.messagesSinceSpontaneousReply ?? 0}`);
    console.log(`messagesSinceFillerReply: ${data.messagesSinceFillerReply ?? 0}`);
    console.log(
      `sleepHours: ${
        typeof data.sleepStartHour === 'number' && typeof data.sleepEndHour === 'number'
          ? `${data.sleepStartHour}:00–${data.sleepEndHour}:00`
          : '(global default)'
      }`,
    );
    console.log(`summary: ${data.summary ? data.summary : '(none yet)'}`);
    console.log(`participants (${participants.length}):`);
    for (const p of participants) {
      console.log(`  - ${p.nickname}: ${p.profile}`);
    }
  }
}

main().catch((err) => {
  console.error('Failed to list rooms:', err instanceof Error ? err.message : err);
  process.exit(1);
});
