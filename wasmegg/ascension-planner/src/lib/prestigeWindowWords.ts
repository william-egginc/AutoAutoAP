/**
 * The prestige-window hint's words (src/lib/prestigeWindow.ts). Times come from the shared formatter (lib/clock.ts), in the
 * player's own zone with Pacific named. The help text says what prestigeWindow.ts does: from TE 240 up, ascensions of 25 TE
 * or less, ending Saturday 12:00 AM Pacific (8:00 AM for a build of two or more sales).
 */
import { formatClock, formatWeekday } from '@/lib/clock';
import { pacificHourOfWeek } from '@/search/precomputedLeg';

export const PRESTIGE_HINT_LABEL = 'Show when to start short ascensions';
export const PRESTIGE_HINT_HELP =
  'On a short ascension (25 TE or less, starting at TE 240 or more), the steps say when to start by: before the sale ends, which is Saturday 12:00 AM Pacific, or 8:00 AM when the route’s build uses two or more sales. Starting after that can make it take noticeably longer. Off by default, and kept in this browser only.';

const PACIFIC = 'America/Los_Angeles';
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** "Start before Friday 2:00 PM Pacific (Fri 5:00 PM for you)": the player's own time only when it differs. */
export function prestigeWindowLine(deadlineSeconds: number, zone: string, locale?: string): string {
  const ms = deadlineSeconds * 1000;
  const day = DAYS[Math.floor(pacificHourOfWeek(deadlineSeconds) / 24)];
  const pacific = `${day} ${formatClock(ms, PACIFIC, locale)} Pacific`;
  const mine = `${formatWeekday(ms, zone, locale)} ${formatClock(ms, zone, locale)}`;
  const same = formatClock(ms, zone, locale) === formatClock(ms, PACIFIC, locale) && formatWeekday(ms, zone, locale) === formatWeekday(ms, PACIFIC, locale);
  return `Start before ${pacific}${same ? '' : ` (${mine} for you)`}`;
}
