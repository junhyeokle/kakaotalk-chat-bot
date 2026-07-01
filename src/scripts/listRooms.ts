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
    console.log(`engagementProbability: ${data.engagementProbability ?? '(default)'}`);
    console.log(`personaOverride: ${data.personaOverride ? data.personaOverride : '(default persona)'}`);
    console.log(`messagesSinceSummary: ${data.messagesSinceSummary ?? 0}`);
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
