/**
 * What hours and time off a finished search was priced with, said in the result (Jordan, 16 Oct 2026):
 * "Priced with your hours 9 am to 1 am, no time off", "Priced with your hours 9 am to 11 pm on Mon–Fri,
 * time off Oct 20–22", "Priced with any hour, no time off". It names them rather than pointing at Your
 * setup, which may have changed since: callers pass the settings the RUN used (store `usedSettings()`, a
 * result's recorded `settings`), never the live ones.
 *
 * Hours are 12-hour with am/pm, in the schedule's own zone (the planner's); time off is the dates as
 * typed (whole local days). A schedule that rules nothing out is "any hour", as the search reads it
 * (search/availabilitySchedule.ts `isConstrained`); a half-typed time-off row is left out, as the search
 * leaves it out (search/timeOff.ts `usableTimeOff`).
 */
import { isConstrained, validDays, type Availability } from '@/search/availabilitySchedule';
import { usableTimeOff, type TimeOffDates } from '@/search/timeOff';

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 0-23 as "12 am", "9 am", "12 pm", "11 pm". */
export function hour12(h: number): string {
  const x = ((Math.floor(h) % 24) + 24) % 24;
  return `${x % 12 === 0 ? 12 : x % 12} ${x < 12 ? 'am' : 'pm'}`;
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

/** "awake hours 9 am to 1 am on Mon–Fri", or "any hour". */
export function hoursWords(a: Availability | null | undefined): string {
  if (!isConstrained(a)) return 'any hour';
  const days = validDays(a);
  const on = days.length && days.length < 7 ? ` on ${dayRuns(days)}` : '';
  if (a.fromHour === a.toHour) return `awake hours all day${on}`;
  return `awake hours ${hour12(a.fromHour)} to ${hour12(a.toHour)}${on}`;
}

/** The hours alone, short: "any hour", "9 am–1 am", "9 am–11 pm on Mon–Fri", "all day on Sat, Sun". */
export function hoursShort(a: Availability | null | undefined): string {
  return hoursWords(a)
    .replace(/^awake hours /, '')
    .replace(/^(\d+ [ap]m) to (\d+ [ap]m)/, '$1–$2');
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

/** "Priced with your hours 9 am to 1 am, no time off". */
export function pricedWithLine(s: {
  availability: Availability | null | undefined;
  timeOff: TimeOffDates[] | null | undefined;
}): string {
  return `Priced with ${hoursWords(s.availability)}, ${timeOffWords(s.timeOff)}`;
}
