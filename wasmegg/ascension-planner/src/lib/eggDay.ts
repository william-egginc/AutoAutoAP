/**
 * Egg Day: 14 July, 9:00 AM Pacific. One definition for the deadline search's preset and the
 * leaderboard's Egg Day tab, so an answer sent for "Egg Day" always lands on that tab.
 */
import { calendarOf, formatClock, formatMoment } from './clock';
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

/**
 * Egg Day in words, the planner's clock beside Pacific's, one format for both (lib/clock.ts): in en-US
 * "Jul 14, 2027, 9:00 AM Pacific (10:00 AM your time)", "… (Jul 15, 1:00 AM your time)" when it is already the
 * next day there, and Pacific's alone when `zone` reads the same. `locale` for specs only.
 */
export function eggDayWords(year: number, zone: string, locale?: string): string {
  const at = eggDaySeconds(year) * 1000;
  const pacific = `${formatMoment(at, { zone: EGG_DAY_ZONE, locale })} Pacific`;
  const p = calendarOf(at, EGG_DAY_ZONE);
  const y = calendarOf(at, zone);
  if (!p || !y) return pacific;
  const sameDay = p.ymd === y.ymd;
  const yours = formatClock(at, zone, locale);
  if (sameDay && formatClock(at, EGG_DAY_ZONE, locale) === yours) return pacific;
  return `${pacific} (${sameDay ? yours : formatMoment(at, { zone, year: 'never', locale })} your time)`;
}
