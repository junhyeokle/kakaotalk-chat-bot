import { getRoomProfile } from '../firebase/roomProfileStore';
import { setRoomConfig, saveRoomSummary } from '../firebase/configStore';

/**
 * One-shot CLI: applies a previously analyzed room profile (see
 * "npm run analyze-export") to a real, live room by chatId — seeding its
 * persona override and initial long-term summary. This is a manual, explicit
 * link rather than automatic name-matching, so the bot never mistakes one
 * room for another just because their titles happen to match.
 * Usage: npm run link-profile -- <chatId> <profileId>
 */
async function main(): Promise<void> {
  const [chatId, profileId] = process.argv.slice(2);

  if (!chatId || !profileId) {
    console.error('Usage: npm run link-profile -- <chatId> <profileId>');
    console.error('Find chatId with "npm run list-channels", profileId with "npm run analyze-export".');
    process.exit(1);
  }

  const profile = await getRoomProfile(profileId);
  if (!profile) {
    console.error(`No room profile found with id "${profileId}". Run "npm run analyze-export" first.`);
    process.exit(1);
  }

  await setRoomConfig(chatId, { personaOverride: profile.personaSuggestion });

  const seedSummary = [
    '[사전 분석된 방 분위기]',
    `- 분위기: ${profile.vibe}`,
    `- 대화 수위: ${profile.contentRating}`,
    `- 주요 화제: ${profile.topics.join(', ') || '(없음)'}`,
  ].join('\n');
  await saveRoomSummary(chatId, seedSummary);

  console.log(`Room ${chatId} linked to profile "${profileId}".`);
  console.log(`Persona and initial summary seeded — takes effect on the room's next message.`);
}

main().catch((err) => {
  console.error('Failed to link profile:', err instanceof Error ? err.message : err);
  process.exit(1);
});
