/**
 * What hours and time off a finished search was priced with, said in the result (Jordan, 16 Oct 2026):
 * "Priced with your hours 9:00 AM to 1:00 AM, no time off", "Priced with your hours 9:00 AM to 11:00 PM on
 * Mon–Fri, time off Oct 20–22", "Priced with any hour, no time off". It names them rather than pointing at Your
 * setup, which may have changed since: callers pass the settings the RUN used (store `usedSettings()`, a
 * result's recorded `settings`), never the live ones.
 *
 * Hours in the player's own style, "9:00 AM" in en-US, "09:00" in en-GB (lib/timeStyleWords.ts), in the schedule's own zone (the planner's); time off is the dates as
 * typed (whole local days). A schedule that rules nothing out is "any hour", as the search reads it
 * (search/availabilitySchedule.ts `isConstrained`); a half-typed time-off row is left out, as the search
 * leaves it out (search/timeOff.ts `usableTimeOff`).
 */
import { isConstrained, validDays, type Availability } from '@/search/availabilitySchedule';
import { usableTimeOff, type TimeOffDates } from '@/search/timeOff';
import { formatClockTime } from './timeStyleWords';

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 0-23 in the player's style: "9:00 AM" (en-US), "09:00" (en-GB) (lib/timeStyleWords.ts; `locale` for specs). */
export function hour12(h: number, locale?: string): string {
  return formatClockTime(h, 0, { locale });
}

/** The days as runs: "Mon–Fri", "Sat, Sun", "Mon, Wed–Fri". */
function dayRuns(days: number[]): string {
  const d = [...new Set(days)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < d.length; ) {
    let j = i;
    while (j + 1 < d.length && d[j + 1] === d[j] + 1) j++;
    out.push(j - i >= 2 ? `${DAY[d[i]]}–${DAY[d[j]]}` : d.slice(i, j + 1).map(x => DAY[x]).join(', '));
    i = j + 1;
  }
  return out.join(', ');
}

/** The hours from the numbers, `sep` between the two times; null for "any hour". */
function hoursOf(a: Availability | null | undefined, sep: string, locale?: string): string | null {
  if (!isConstrained(a)) return null;
  const days = validDays(a);
  const on = days.length && days.length < 7 ? ` on ${dayRuns(days)}` : '';
  if (a.fromHour === a.toHour) return `all day${on}`;
  return `${hour12(a.fromHour, locale)}${sep}${hour12(a.toHour, locale)}${on}`;
}

/** "awake hours 9:00 AM to 1:00 AM on Mon–Fri", or "any hour". */
export function hoursWords(a: Availability | null | undefined, locale?: string): string {
  const h = hoursOf(a, ' to ', locale);
  return h ? `awake hours ${h}` : 'any hour';
}

/** The hours alone, short: "any hour", "9:00 AM–1:00 AM", "9:00 AM–11:00 PM on Mon–Fri", "all day on Sat, Sun"
 *  ("09:00–01:00" in a 24-hour locale). Built from the numbers, never read back from the words. */
export function hoursShort(a: Availability | null | undefined, locale?: string): string {
  return hoursOf(a, '–', locale) ?? 'any hour';
}

/** "Oct 20", "Oct 20–22", "Oct 30–Nov 2", "Dec 30, 2026–Jan 2, 2027". */
function stretch(d: TimeOffDates): string {
  const [fy, fm, fd] = d.from.split('-').map(Number);
  const [ty, tm, td] = d.to.split('-').map(Number);
  if (d.from === d.to) return `${MONTH[fm - 1]} ${fd}`;
  if (fy !== ty) return `${MONTH[fm - 1]} ${fd}, ${fy}–${MONTH[tm - 1]} ${td}, ${ty}`;
  if (fm === tm) return `${MONTH[fm - 1]} ${fd}–${td}`;
  return `${MONTH[fm - 1]} ${fd}–${MONTH[tm - 1]} ${td}`;
}

/** "time off Oct 20–22, Nov 3", or "no time off". */
export function timeOffWords(dates: TimeOffDates[] | null | undefined): string {
  const list = usableTimeOff(dates);
  return list.length ? `time off ${list.map(stretch).join(', ')}` : 'no time off';
}

/** "Priced with your hours 9:00 AM to 1:00 AM, no time off". */
export function pricedWithLine(s: {
  availability: Availability | null | undefined;
  timeOff: TimeOffDates[] | null | undefined;
}): string {
  return `Priced with ${hoursWords(s.availability)}, ${timeOffWords(s.timeOff)}`;
}
