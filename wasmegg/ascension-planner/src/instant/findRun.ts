/**
 * Find a run (components/instant/FindARun.vue) and the Auto Planner tab's Saved runs
 * (components/instant/SavedRuns.vue): the pure pieces. Times are 12-hour with am/pm, in the planner's
 * timezone; nothing here reads storage or the page.
 */
import type { AnswerRow } from './instantAnswer';
import type { Route } from './routeFinder';
import type { GearGap } from './gearDiffers';

/** One ascension of a route: the TE stop it ascends at, and when it starts and ends (unix seconds). */
export interface AscensionTime {
  /** 1, 2, ... */
  n: number;
  to: number;
  start: number;
  end: number;
}

/**
 * Per-ascension starts and ends of a route, as the instant answer priced them. The route finder's legs
 * carry each ascension's own start and end (routeFinder.ts RouteLeg: the next whole hour after the last
 * one ended, or inside the sale its own hour), so they are read off the legs, not worked out again. A
 * leg missing its times (none should) is derived from the one before: it starts when that one ends.
 */
export function ascensionTimes(route: Pick<Route, 'chain' | 'legs'>): AscensionTime[] {
  const out: AscensionTime[] = [];
  route.legs.forEach((leg, i) => {
    const prevEnd = out[i - 1]?.end;
    const start = Number.isFinite(leg.start) ? leg.start : prevEnd;
    if (start === undefined || !Number.isFinite(leg.end)) return;
    out.push({ n: i + 1, to: leg.to ?? route.chain[i], start, end: leg.end });
  });
  return out;
}

/** When a row finishes: race, the target reached; by a date, the last ascension's end. */
export function finishOf(row: AnswerRow, dated: boolean): number {
  const legs = row.route.legs;
  return dated ? (legs[legs.length - 1]?.end ?? row.route.end) : row.route.end;
}

/** The rows, the best first: race by finish; by a date by TE (highest first), then finish. */
export function rowsByBest(rows: readonly AnswerRow[], dated: boolean): AnswerRow[] {
  return [...rows].sort((a, b) =>
    dated
      ? b.endTE - a.endTE || finishOf(a, true) - finishOf(b, true) || a.ascensions - b.ascensions
      : a.route.end - b.route.end || a.ascensions - b.ascensions
  );
}

/**
 * How far a row is from the best row shown: "the best", "8 days behind" (race; under a day in hours),
 * "3 TE behind" (by a date). A row with the best's TE by a date but later is "same TE".
 */
export function behindText(row: AnswerRow, rows: readonly AnswerRow[], dated: boolean): string {
  if (!rows.length) return '';
  const best = rowsByBest(rows, dated)[0];
  if (row === best || row.best) return 'the best';
  if (dated) {
    const te = best.endTE - row.endTE;
    return te > 0 ? `${te} TE behind` : 'same TE';
  }
  const s = row.route.end - best.route.end;
  if (s <= 0) return 'the best';
  const days = Math.round(s / 86400);
  if (days >= 1) return `${days} ${days === 1 ? 'day' : 'days'} behind`;
  const hours = Math.round(s / 3600);
  return hours >= 1 ? `${hours} ${hours === 1 ? 'hour' : 'hours'} behind` : 'under an hour behind';
}

/** "4 to 9" ascension counts of the rows ("7" when one). */
export function countsText(rows: readonly AnswerRow[]): string {
  if (!rows.length) return '';
  const ks = rows.map(r => r.ascensions);
  const lo = Math.min(...ks);
  const hi = Math.max(...ks);
  return lo === hi ? `${lo}` : `${lo} to ${hi}`;
}

/**
 * "Oct 19 at 7:03 am"; with `weekday` "Mon, Oct 19 at 7:03 am"; with `year` "Feb 18, 2029 at 12:44 pm".
 */
export function atText(unix: number, timeZone: string, opts: { weekday?: boolean; year?: boolean } = {}): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    ...(opts.weekday ? { weekday: 'short' as const } : {}),
    month: 'short',
    day: 'numeric',
    ...(opts.year ? { year: 'numeric' as const } : {}),
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(new Date(unix * 1000));
  const p = (t: Intl.DateTimeFormatPartTypes) => parts.find(x => x.type === t)?.value ?? '';
  const day = `${opts.weekday ? `${p('weekday')}, ` : ''}${p('month')} ${p('day')}${opts.year ? `, ${p('year')}` : ''}`;
  return `${day} at ${p('hour')}:${p('minute')} ${p('dayPeriod').toLowerCase()}`;
}

/** "Jul 14, 2027" (a date with no time). */
export function dayText(unix: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(unix * 1000)
  );
}

function span(seconds: number): string {
  const s = Math.abs(seconds);
  if (s < 60) return '';
  if (s < 3600) {
    const m = Math.round(s / 60);
    return `${m} ${m === 1 ? 'minute' : 'minutes'}`;
  }
  if (s < 86400) {
    const h = Math.round(s / 3600);
    return `${h} ${h === 1 ? 'hour' : 'hours'}`;
  }
  const d = Math.round(s / 86400);
  return `${d} ${d === 1 ? 'day' : 'days'}`;
}

/** "2 hours ago", "9 days ago", "just now". */
export function agoText(unix: number, nowSeconds: number): string {
  const w = span(nowSeconds - unix);
  return w ? `${w} ago` : 'just now';
}

/** "in 4 days", "in 3 hours", "now". */
export function inText(unix: number, nowSeconds: number): string {
  const w = span(unix - nowSeconds);
  return w ? `in ${w}` : 'now';
}

/** "Oct 19 at 7:03 am (2 hours ago)". */
export function whenAgo(unix: number, nowSeconds: number, timeZone: string): string {
  return `${atText(unix, timeZone)} (${agoText(unix, nowSeconds)})`;
}

/** The gear a saved run was priced on: the table's (maxed), or the save's, as the card says it. */
export function gearLabel(gap: GearGap | null): string {
  if (!gap) return 'maxed gear';
  const short = gap.bonusShort > 0.05;
  const off = Math.abs(gap.scale - 1) > 0.005;
  if (!short && !off) return 'maxed gear';
  const bits = [
    ...(off ? [`delivery ${(gap.scale * 100).toFixed(1)}% of maxed`] : []),
    ...(short ? [`earnings set ${gap.bonusShort.toFixed(2)} Clothed TE short`] : []),
  ];
  return `your gear (${bits.join(', ')})`;
}

function yearIn(unix: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric' }).format(new Date(unix * 1000));
}

/** A Starts / Ends cell: "Mon, Oct 19 at 7:30 am", with the year when it is not this year's. */
export function cellText(unix: number, timeZone: string, nowSeconds: number): string {
  return atText(unix, timeZone, { weekday: true, year: yearIn(unix, timeZone) !== yearIn(nowSeconds, timeZone) });
}
