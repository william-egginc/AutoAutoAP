/**
 * The words of My runs' Right now card (spec myruns-now v3, section 2): an event's title, how far away it is,
 * the next-step sentence and the "calculated …" line. Pure; `now` and the zone are parameters.
 */
import { dateAt, eventWhen, relativeWords } from './eventWhen';
import { shiftTitle, type PlanEvent } from './nowPlan';
import { clockWords } from './planPace';
import { virtueEggName } from './virtueEggs';
import { hoursShort } from './pricedWith';
import { formatHourOfDay, formatMoment } from './clock';
import { usableTimeOff } from '@/search/timeOff';
import type { Availability } from '@/search/availabilitySchedule';
import type { TimeOffDates } from '@/search/timeOff';
import { compactDuration } from './duration';

export function eventTitle(e: Pick<PlanEvent, 'kind' | 'egg' | 'eggs' | 'te' | 'timeOff'>, goal: 'fastest' | 'date', goalName = 'Egg Day'): string {
  if (e.kind === 'shift') return shiftTitle(e, virtueEggName);
  if (e.kind === 'prestige' && e.timeOff === 'leave') return `Time off starts: to your home farm at ${e.te} TE`;
  if (e.kind === 'prestige' && e.timeOff === 'back') return `Back from time off: prestige, build toward ${e.te} TE again`;
  if (e.kind === 'prestige') return `Prestige at ${e.te} TE`;
  return goal === 'date' ? `${goalName} goal: ${e.te} TE` : `${e.te} TE reached`;
}

/**
 * ROUNDED TIMES (wireframe R1, 23 Oct 2026): the instant answer's times are estimates worked out ahead of time, so
 * Right now shows them to the hour, "at around 3:00 pm", "in about 28 h", and offers no calendar button. A By a
 * date goal's own row is the date itself and stays exact. `rounded` false (a search's plan, on the account): exact.
 */
export function roundedAt(
  e: Pick<PlanEvent, 'at' | 'kind'>,
  goal: 'fastest' | 'date',
  rounded: boolean,
  zone: string
): number {
  return rounded && !(e.kind === 'goal' && goal === 'date') ? roundToHourIn(e.at, zone) : e.at;
}

/**
 * `at` (unix seconds) to the nearest hour on the clock in `zone` (the planner's), not UTC's: in a half-hour zone
 * (India +5:30, Newfoundland -3:30) UTC's hour is :30 on the player's clock. The minutes and seconds past the local
 * hour are read in that zone, so a DST change between the two hours is no matter. UTC's hour when the zone is unknown.
 */
export function roundToHourIn(at: number, zone: string): number {
  let into: number;
  try {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { timeZone: zone, minute: 'numeric', second: 'numeric' })
        .formatToParts(new Date(at * 1000))
        .map(x => [x.type, x.value])
    ) as Record<string, string>;
    into = Number(p.minute) * 60 + Number(p.second);
    if (!Number.isFinite(into)) throw new Error('no minutes');
  } catch {
    into = ((at % 3600) + 3600) % 3600;
  }
  const whole = Math.floor(at);
  return into >= 1800 ? whole - into + 3600 : whole - into;
}

/** The events table's When: "Thu, Oct 15 at 4:00 pm", rounded "Fri, Oct 23 at around 3:00 pm". */
export function whenWords(
  e: Pick<PlanEvent, 'at' | 'kind'>,
  goal: 'fastest' | 'date',
  nowSeconds: number,
  zone: string,
  rounded = false
): string {
  const at = roundedAt(e, goal, rounded, zone);
  const d = dateAt(at, nowSeconds, zone, true);
  return rounded && !(e.kind === 'goal' && goal === 'date') ? d.replace(' at ', ' at around ') : d;
}

/** "today, in 1 h 20 m" · "tomorrow, in 19 h" · "in 2 days" · "in 271 days · 16.8 h spare" · "passed" ·
 *  "not done yet, due 3 h ago". `rounded` (the instant answer's): "tomorrow, in about 28 h", "… spare (instant)". */
export function howFar(
  e: Pick<PlanEvent, 'at' | 'past' | 'kind' | 'spareHours' | 'notDone'>,
  nowSeconds: number,
  zone: string,
  rounded = false,
  goal: 'fastest' | 'date' = 'date'
): string {
  if (e.past) return 'passed';
  const at = roundedAt(e, goal, rounded, zone);
  if (e.notDone) {
    const w = eventWhen(at, nowSeconds, zone);
    return w ? `not done yet, due ${w.relative}` : 'not done yet';
  }
  const w = eventWhen(at, nowSeconds, zone);
  if (!w) return '';
  const rel = rounded && /^in \d+[hm]\b/.test(w.relative) ? w.relative.replace(/^in /, 'in about ') : w.relative;
  const base = w.day === 'today' || w.day === 'tomorrow' ? `${w.day}, ${rel}` : rel;
  const spare =
    e.kind === 'goal' && typeof e.spareHours === 'number' ? ` · ${spareWords(e.spareHours)} spare${rounded ? ' (instant)' : ''}` : '';
  return base + spare;
}

/** "16h 48m", "2d 2h" (lib/duration); a negative spare reads its size (the caller says behind). */
export function spareWords(hours: number): string {
  return compactDuration(hours * 3600);
}

const lower = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);

/** A step whose time has passed and the save doesn't show done: "Not done yet: shift to Curiosity (due 8:03 pm)"
 *  ("due Oct 18 at 8:03 pm" when not today). The events table and Next step both say it. */
export function notDoneTitle(
  e: Pick<PlanEvent, 'kind' | 'egg' | 'eggs' | 'te' | 'at'>,
  goal: 'fastest' | 'date',
  nowSeconds: number,
  zone: string,
  goalName?: string
): string {
  return `Not done yet: ${lower(eventTitle(e, goal, goalName))} (due ${clockWords(e.at, nowSeconds, zone)})`;
}

/** "Shift to Humility today at 4:00 pm (in 1 h 20 m), then Kindness tomorrow at 9:15 am"; a step not done yet leads:
 *  "Not done yet: shift to Curiosity (due 8:03 pm), then Humility Oct 23 at 4:06 pm". '' with nothing ahead. */
export function nextStepText(
  events: readonly PlanEvent[],
  goal: 'fastest' | 'date',
  nowSeconds: number,
  zone: string,
  rounded = false
): string {
  const ahead = events.filter(e => !e.past && e.kind !== 'goal');
  const first = ahead[0];
  if (!first) return '';
  const w = eventWhen(roundedAt(first, goal, rounded, zone), nowSeconds, zone);
  if (!w) return '';
  // Rounded (the instant answer's, R1): "Shift to Humility tomorrow at around 3:00 pm, then prestige at 197 TE Oct 28
  // at around 4:00 am".
  const at = rounded ? 'at around' : 'at';
  let text = first.notDone
    ? notDoneTitle(first, goal, nowSeconds, zone)
    : rounded
      ? `${eventTitle(first, goal)} ${w.day} ${at} ${w.clock}`
      : `${eventTitle(first, goal)} ${w.day} at ${w.clock} (${w.relative})`;
  const second = ahead[1];
  const w2 = second ? eventWhen(roundedAt(second, goal, rounded, zone), nowSeconds, zone) : null;
  if (second && w2) {
    // "then prestige at 197 TE" (only the first letter lowered: "TE" stays), "then Kindness", "then shift to …".
    const what =
      second.kind === 'shift' && !(second.eggs && second.eggs.length > 1) ? virtueEggName(second.egg) : lower(eventTitle(second, goal));
    text += second.notDone
      ? `, then ${what} (not done yet, due ${clockWords(second.at, nowSeconds, zone)})`
      : `, then ${what} ${w2.day} ${at} ${w2.clock}`;
  }
  return text;
}

/** The route the plan follows, every stop, and its goal: "Following 197 → 222 → 247 → 285 → 313 (Egg Day 2027)".
 *  Right now's header and each calendar event say it. */
export function followingLine(chain: readonly number[], goalName: string): string {
  if (!chain.length) return '';
  return `Following ${chain.join(' → ')}${goalName ? ` (${goalName})` : ''}`;
}

/** Each stop of the route against the clock: 'passed' before the ascension the save is in (`ascNow`, 1-based;
 *  0 before the plan starts), 'now' for that one, 'ahead' after. */
export function chainStops(chain: readonly number[], ascNow: number): { te: number; state: 'passed' | 'now' | 'ahead' }[] {
  return chain.map((te, i) => ({ te, state: ascNow <= 0 ? 'ahead' : i + 1 < ascNow ? 'passed' : i + 1 === ascNow ? 'now' : 'ahead' }));
}

/** "Oct 15 at 2:40 pm (2 h ago)". */
export function whenAgo(atSeconds: number, nowSeconds: number, zone: string): string {
  const d = dateAt(atSeconds, nowSeconds, zone);
  return d ? `${d} (${relativeWords(atSeconds - nowSeconds)})` : '';
}

/** An hour of the day as the browser says it, short: "7 AM" (en-US), "19:00" (de-DE): the minutes are left off
 *  only on a 12-hour clock, where "7 AM" reads whole. */
function hourShort(h: number, locale?: string): string {
  const s = formatHourOfDay(h, locale);
  return /[^\d:\s.]/.test(s) ? s.replace(/[:.]00(?=\D|$)/, '') : s;
}

/** A whole-day stretch in the browser's format, compact: "Oct 27", "Oct 29–30", "Oct 29 – Nov 2",
 *  "Dec 30, 2026 – Jan 2, 2027" (the year only when the stretch crosses one). */
export function stretchWords(d: TimeOffDates, locale?: string): string {
  const [fy, fm, fd] = d.from.split('-').map(Number);
  const [ty, tm, td] = d.to.split('-').map(Number);
  const at = (y: number, m: number, day: number, year: boolean) =>
    formatMoment(Date.UTC(y, m - 1, day, 12), { zone: 'UTC', dateOnly: true, year: year ? 'always' : 'never', locale });
  if (d.from === d.to) return at(fy, fm, fd, false);
  if (fy !== ty) return `${at(fy, fm, fd, true)} – ${at(ty, tm, td, true)}`;
  if (fm === tm) {
    // The first day's words with its day number made the run ("Oct 29" → "Oct 29–30", "29. Okt." → "29–30. Okt.").
    const first = at(fy, fm, fd, false);
    const i = first.search(new RegExp(`(^|\\D)${fd}(\\D|$)`));
    if (i >= 0) {
      const start = first.indexOf(String(fd), i);
      return `${first.slice(0, start)}${fd}–${td}${first.slice(start + String(fd).length)}`;
    }
  }
  return `${at(fy, fm, fd, false)} – ${at(ty, tm, td, false)}`;
}

/** Up to two stretches shown, then "+N more". */
export const SUMMARY_STRETCHES = 2;
function stretchList(list: TimeOffDates[], locale?: string): string {
  const shown = list.slice(0, SUMMARY_STRETCHES).map(d => stretchWords(d, locale)).join(', ');
  const more = list.length - SUMMARY_STRETCHES;
  return more > 0 ? `${shown} +${more} more` : shown;
}

/**
 * The Setup pill's line on My runs (Jordan, 26 Oct 2026: time off and no prestige days in it too):
 * "7 AM–11 PM · time off Oct 29–30 · no prestige Oct 27", "any hour · no time off". The no prestige part is left
 * out when there are none. Hours and dates in the browser's format (lib/clock.ts); `locale` is for specs.
 */
export function setupSummary(
  availability: Availability | null | undefined,
  timeOff: TimeOffDates[] | null | undefined,
  noPrestige?: TimeOffDates[] | null,
  locale?: string
): string {
  const hours = hoursShort(availability).replace(/\b(\d+) ([ap]m)\b/g, (_, n: string, ap: string) =>
    hourShort((Number(n) % 12) + (ap === 'pm' ? 12 : 0), locale)
  );
  const off = usableTimeOff(timeOff);
  const held = usableTimeOff(noPrestige);
  const parts = [hours, off.length ? `time off ${stretchList(off, locale)}` : 'no time off'];
  if (held.length) parts.push(`no prestige ${stretchList(held, locale)}`);
  return parts.join(' · ');
}
