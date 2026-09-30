/**
 * Egg Day: 14 July, 9:00 AM Pacific. One definition for the deadline search's preset and the
 * leaderboard's Egg Day tab, so an answer sent for "Egg Day" always lands on that tab.
 */
import { getLocalTimestampInTimezone } from './events';

export const EGG_DAY_ZONE = 'America/Los_Angeles';
export const EGG_DAY_TIME = '09:00';

/** Egg Day of `year`, unix seconds. */
export function eggDaySeconds(year: number): number {
  return getLocalTimestampInTimezone(`${year}-07-14`, EGG_DAY_TIME, EGG_DAY_ZONE);
}

/** The year of the next Egg Day that has not started yet. */
export function nextEggDayYear(nowMs = Date.now()): number {
  const y = new Date(nowMs).getUTCFullYear();
  return nowMs / 1000 < eggDaySeconds(y) ? y : y + 1;
}

/** The year whose Egg Day `seconds` is exactly, or null for any other moment. */
export function eggDayYearOf(seconds: number): number | null {
  const y = new Date(seconds * 1000).getUTCFullYear();
  return eggDaySeconds(y) === seconds ? y : null;
}
