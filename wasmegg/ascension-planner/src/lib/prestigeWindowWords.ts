/**
 * The prestige-window hint's words (src/lib/prestigeWindow.ts). DRAFT: Words own these strings (21 Nov 2026), placeholders
 * until they land. Times come from the shared formatter (lib/clock.ts), in the player's own zone with Pacific named.
 */
import { formatClock, formatWeekday } from '@/lib/clock';
import { pacificHourOfWeek } from '@/search/precomputedLeg';

export const PRESTIGE_HINT_LABEL = 'Show the prestige-window hint on short ascensions'; // DRAFT
export const PRESTIGE_HINT_HELP =
  'On a short ascension at TE 200 and up, the steps list says to start before the sale ends (Saturday 12:00 AM or 8:00 AM Pacific, by the build). Starting just after it can take up to about a quarter longer. Off by default.'; // DRAFT

const PACIFIC = 'America/Los_Angeles';
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']; // DRAFT

/** "Start before Friday 2:00 PM Pacific (Fri 5:00 PM for you)": the player's own time only when it differs. */
export function prestigeWindowLine(deadlineSeconds: number, zone: string, locale?: string): string {
  const ms = deadlineSeconds * 1000;
  const day = DAYS[Math.floor(pacificHourOfWeek(deadlineSeconds) / 24)];
  const pacific = `${day} ${formatClock(ms, PACIFIC, locale)} Pacific`; // DRAFT
  const mine = `${formatWeekday(ms, zone, locale)} ${formatClock(ms, zone, locale)}`;
  const same = formatClock(ms, zone, locale) === formatClock(ms, PACIFIC, locale) && formatWeekday(ms, zone, locale) === formatWeekday(ms, PACIFIC, locale);
  return `Start before ${pacific}${same ? '' : ` (${mine} for you)`}`; // DRAFT
}
