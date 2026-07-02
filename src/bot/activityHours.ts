function hourInTimeZone(date: Date, timeZone: string): number {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(date);
  return Number(formatted);
}

/**
 * Whether `now` falls within a "sleep" window — hours (0-23) in the given
 * IANA time zone. Handles a window that wraps past midnight (e.g. start=23,
 * end=6). `startHour === endHour` disables sleep entirely (always awake),
 * which is how a room opts out of this feature.
 */
export function isSleepHour(
  now: Date,
  startHour: number,
  endHour: number,
  timeZone: string,
): boolean {
  if (startHour === endHour) return false;

  const hour = hourInTimeZone(now, timeZone);
  return startHour < endHour
    ? hour >= startHour && hour < endHour
    : hour >= startHour || hour < endHour;
}
