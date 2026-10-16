/**
 * The words of My runs' Right now card (spec myruns-now v3, section 2): an event's title, how far away it is,
 * the next-step sentence and the "calculated …" line. Pure; `now` and the zone are parameters.
 */
import { dateAt, eventWhen, relativeWords } from './eventWhen';
import { shiftTitle, type PlanEvent } from './nowPlan';
import { virtueEggName } from './virtueEggs';
import { hoursWords, timeOffWords } from './pricedWith';
import type { Availability } from '@/search/availabilitySchedule';
import type { TimeOffDates } from '@/search/timeOff';

export function eventTitle(e: Pick<PlanEvent, 'kind' | 'egg' | 'eggs' | 'te'>, goal: 'fastest' | 'date', goalName = 'Egg Day'): string {
  if (e.kind === 'shift') return shiftTitle(e, virtueEggName);
  if (e.kind === 'prestige') return `Prestige at ${e.te} TE`;
  return goal === 'date' ? `${goalName} goal: ${e.te} TE` : `${e.te} TE reached`;
}

/** "today, in 1 h 20 m" · "tomorrow, in 19 h" · "in 2 days" · "in 271 days · 16.8 h spare" · "passed". */
export function howFar(e: Pick<PlanEvent, 'at' | 'past' | 'kind' | 'spareHours'>, nowSeconds: number, zone: string): string {
  if (e.past) return 'passed';
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

/** "Shift to Humility today at 4:00 pm (in 1 h 20 m), then Kindness tomorrow at 9:15 am". '' with nothing ahead. */
export function nextStepText(events: readonly PlanEvent[], goal: 'fastest' | 'date', nowSeconds: number, zone: string): string {
  const ahead = events.filter(e => !e.past && e.kind !== 'goal');
  const first = ahead[0];
  if (!first) return '';
  const w = eventWhen(first.at, nowSeconds, zone);
  if (!w) return '';
  let text = `${eventTitle(first, goal)} ${w.day} at ${w.clock} (${w.relative})`;
  const second = ahead[1];
  const w2 = second ? eventWhen(second.at, nowSeconds, zone) : null;
  if (second && w2) {
    // "then prestige at 197 TE" (only the first letter lowered: "TE" stays), "then Kindness", "then shift to …".
    const lower = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);
    const what =
      second.kind === 'shift' && !(second.eggs && second.eggs.length > 1) ? virtueEggName(second.egg) : lower(eventTitle(second, goal));
    text += `, then ${what} ${w2.day} at ${w2.clock}`;
  }
  return text;
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
