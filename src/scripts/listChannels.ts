import { KakaoClient } from '../kakao/client';
import { loadSession } from '../kakao/session';

/**
 * One-shot CLI: logs in with the saved session and lists every room the
 * account is currently joined to, so you can find a room's chatId to use
 * with "npm run link-profile".
 * Usage: npm run list-channels
 */
async function main(): Promise<void> {
  const session = loadSession();
  if (!session) {
    console.error('No saved session found. Run "npm run login" first.');
    process.exit(1);
  }

  const kakao = new KakaoClient();
  await kakao.login(session);

  const channels = kakao.listJoinedChannels();
  if (channels.length === 0) {
    console.log('No joined channels found.');
  } else {
    console.log(`Joined channels (${channels.length}):\n`);
    for (const c of channels) {
      console.log(`  ${c.channelId}  ${c.name}`);
    }
  }

  kakao.close();
}

main().catch((err) => {
  console.error('Failed to list channels:', err instanceof Error ? err.message : err);
  process.exit(1);
});
