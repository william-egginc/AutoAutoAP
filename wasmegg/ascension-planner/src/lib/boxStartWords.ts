/**
 * A plan start as the date and time boxes hold it ("2026-10-24 14:30", in the plan's zone), as the player reads
 * every other moment: "Oct 24, 2026, 2:30 pm" (lib/displayTime.ts, lib/clock.ts). The raw box text showed in
 * Single run's "Time away from virtue left out" note (Words review W3-27, 24 Oct 2026). Anything it can't read
 * comes back as given.
 */
import { showDateTime } from './displayTime';
import { getLocalTimestampInTimezone } from './events';

export function boxStartWords(box: string, timezone: string, style?: 'local' | 'iso'): string {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{1,2}:\d{2})$/.exec(box.trim());
  if (!m) return box;
  let at: number;
  try {
    at = getLocalTimestampInTimezone(m[1], m[2], timezone);
  } catch {
    return box;
  }
  return (Number.isFinite(at) && showDateTime(at, timezone, style)) || box;
}
