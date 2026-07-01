import { config } from './config';
import { KakaoClient } from './kakao/client';
import { loadSession } from './kakao/session';
import { handleMessage } from './bot/messageHandler';

async function main(): Promise<void> {
  const session = loadSession();
  if (!session) {
    console.error('No saved session found. Run "npm run login" first.');
    process.exit(1);
  }

  const kakao = new KakaoClient();
  await kakao.login(session);
  console.log(`Logged in. Bot "${config.kakaoBotName}" is now listening (provider: ${config.llmProvider}).`);

  kakao.onChat((data, channel) => {
    // Fire and forget: one bad message must not crash the whole listener.
    handleMessage(kakao, data, channel).catch((err) => {
      console.error('Error handling message:', err instanceof Error ? err.message : err);
    });
  });

  const shutdown = () => {
    console.log('\nShutting down...');
    kakao.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
