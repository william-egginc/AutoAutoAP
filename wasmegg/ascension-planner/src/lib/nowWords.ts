/**
 * The words of My runs' Right now card (spec myruns-now v3, section 2): an event's title, how far away it is,
 * the next-step sentence and the "calculated …" line. Pure; `now` and the zone are parameters.
 */
import { dateAt, eventWhen, relativeWords } from './eventWhen';
import { shiftTitle, type PlanEvent } from './nowPlan';
import { clockWords } from './planPace';
import { virtueEggName } from './virtueEggs';
import { hoursWords, timeOffWords } from './pricedWith';
import type { Availability } from '@/search/availabilitySchedule';
import type { TimeOffDates } from '@/search/timeOff';

export function eventTitle(e: Pick<PlanEvent, 'kind' | 'egg' | 'eggs' | 'te'>, goal: 'fastest' | 'date', goalName = 'Egg Day'): string {
  if (e.kind === 'shift') return shiftTitle(e, virtueEggName);
  if (e.kind === 'prestige') return `Prestige at ${e.te} TE`;
  return goal === 'date' ? `${goalName} goal: ${e.te} TE` : `${e.te} TE reached`;
}

/** "today, in 1 h 20 m" · "tomorrow, in 19 h" · "in 2 days" · "in 271 days · 16.8 h spare" · "passed" ·
 *  "not done yet, due 3 h ago". */
export function howFar(
  e: Pick<PlanEvent, 'at' | 'past' | 'kind' | 'spareHours' | 'notDone'>,
  nowSeconds: number,
  zone: string
): string {
  if (e.past) return 'passed';
  if (e.notDone) {
    const w = eventWhen(e.at, nowSeconds, zone);
    return w ? `not done yet, due ${w.relative}` : 'not done yet';
  }
  const w = eventWhen(e.at, nowSeconds, zone);
  if (!w) return '';
  const base = w.day === 'today' || w.day === 'tomorrow' ? `${w.day}, ${w.relative}` : w.relative;
  const spare = e.kind === 'goal' && typeof e.spareHours === 'number' ? ` · ${spareWords(e.spareHours)} spare` : '';
  return base + spare;
}

/** "16.8 h", "2.1 days". */
export function spareWords(hours: number): string {
  return hours >= 48 ? `${(hours / 24).toFixed(1)} days` : `${hours.toFixed(1)} h`;
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
export function nextStepText(events: readonly PlanEvent[], goal: 'fastest' | 'date', nowSeconds: number, zone: string): string {
  const ahead = events.filter(e => !e.past && e.kind !== 'goal');
  const first = ahead[0];
  if (!first) return '';
  const w = eventWhen(first.at, nowSeconds, zone);
  if (!w) return '';
  let text = first.notDone
    ? notDoneTitle(first, goal, nowSeconds, zone)
    : `${eventTitle(first, goal)} ${w.day} at ${w.clock} (${w.relative})`;
  const second = ahead[1];
  const w2 = second ? eventWhen(second.at, nowSeconds, zone) : null;
  if (second && w2) {
    // "then prestige at 197 TE" (only the first letter lowered: "TE" stays), "then Kindness", "then shift to …".
    const what =
      second.kind === 'shift' && !(second.eggs && second.eggs.length > 1) ? virtueEggName(second.egg) : lower(eventTitle(second, goal));
    text += second.notDone
      ? `, then ${what} (not done yet, due ${clockWords(second.at, nowSeconds, zone)})`
      : `, then ${what} ${w2.day} at ${w2.clock}`;
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

/** The Setup button's line on My runs: "7 am–11 pm · no time off", "any hour · time off Oct 20–22". */
export function setupSummary(availability: Availability | null | undefined, timeOff: TimeOffDates[] | null | undefined): string {
  const hours = hoursWords(availability).replace(/^your hours /, '').replace(/^(\d+ [ap]m) to (\d+ [ap]m)/, '$1–$2');
  return `${hours} · ${timeOffWords(timeOff)}`;
}
