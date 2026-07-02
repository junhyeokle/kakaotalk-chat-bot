import { setRoomConfig } from '../firebase/configStore';

/**
 * One-shot CLI to override a room's sleep window (falls back to the global
 * SLEEP_START_HOUR/SLEEP_END_HOUR env vars if never set). Hours are 0-23 in
 * the configured TIMEZONE. Setting start === end disables sleep for the room.
 * Usage: npm run set-sleep-hours -- <chatId> <startHour> <endHour>
 */
async function main(): Promise<void> {
  const [chatId, startRaw, endRaw] = process.argv.slice(2);

  if (!chatId || startRaw === undefined || endRaw === undefined) {
    console.error('Usage: npm run set-sleep-hours -- <chatId> <startHour> <endHour>');
    console.error('예: npm run set-sleep-hours -- <chatId> 1 8   (새벽 1시~8시엔 잠)');
    console.error('시작/끝을 같은 값으로 주면 그 방은 항상 깨어있음 (수면 비활성화).');
    process.exit(1);
  }

  const sleepStartHour = Number(startRaw);
  const sleepEndHour = Number(endRaw);
  const isValidHour = (h: number) => Number.isInteger(h) && h >= 0 && h <= 23;

  if (!isValidHour(sleepStartHour) || !isValidHour(sleepEndHour)) {
    console.error('시작/끝 시간은 0~23 사이의 정수여야 합니다.');
    process.exit(1);
  }

  await setRoomConfig(chatId, { sleepStartHour, sleepEndHour });
  console.log(
    sleepStartHour === sleepEndHour
      ? `Sleep window disabled for room ${chatId} (always awake).`
      : `Sleep window set for room ${chatId}: ${sleepStartHour}:00–${sleepEndHour}:00`,
  );
}

main().catch((err) => {
  console.error('Failed to set sleep hours:', err instanceof Error ? err.message : err);
  process.exit(1);
});
