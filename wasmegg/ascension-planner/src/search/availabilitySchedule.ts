/**
 * The availability schedule's SHAPE: the type, whether it rules anything out, and how it is written
 * down. Everything here is plain arithmetic on the schedule's own fields.
 *
 * WHY THIS IS ITS OWN FILE. The clock half of the model (search/availability.ts: which local hour an
 * instant falls in, the next instant you are free) needs `getTimezoneOffsetAt` from lib/events, and
 * lib/events carries the precomputed Pacific-time table, about 240 KB of JSON. The Chain Explorer
 * only ever asks the questions below -- "does this run have a schedule?", "how do I describe it?" --
 * yet importing them from availability.ts put that whole table into the Explorer's bundle, because a
 * bundler assigns chunks by which modules a page can reach, not by which functions it calls. Code a
 * page like that reaches must import from HERE, never from availability.ts.
 *
 * availability.ts re-exports all of this, so the planner's imports did not change.
 */

export interface Availability {
  /** Days the player can act, 0 = Sunday .. 6 = Saturday. Empty means every day. */
  days: number[];
  /** Available hours, `[fromHour, toHour)`. Wraps, so 18 -> 2 is "evenings into the night".
   *  `fromHour === toHour` means the whole day is available. */
  fromHour: number;
  toHour: number;
  /** IANA zone the hours and days are read in. The plan's own timezone, not the browser's. */
  timezone: string;
  /**
   * Weekly hours (R10, 21 Nov 2026): the BLOCKED hours of the week, as Joo's picker paints them: indices 0-167,
   * Monday 00:00-01:00 first (`WEEK_HOURS`, `weekIndex`), read in `timezone`. When present it is the whole schedule and
   * `days` / `fromHour` / `toHour` are kept only as the daily window it was made from (or the last one, for older
   * readers). Absent: the daily window above, exactly as before (`maskOfWindow` turns it into a mask).
   */
  blocked?: number[];
}

/** Hours in a week: `Availability.blocked` holds indices 0-167, Monday 00:00-01:00 first. */
export const WEEK_HOURS = 168;

/** THE one conversion between our weekdays (0 = Sunday, Date#getDay) and the Monday-first week index. */
export function weekIndex(sundayFirstDay: number, hour: number): number {
  return ((sundayFirstDay + 6) % 7) * 24 + hour;
}

/** The blocked indices with anything that is not 0-167 dropped, sorted, each once. */
export function validBlocked(blocked: readonly number[]): number[] {
  return [...new Set(blocked.filter(i => Number.isInteger(i) && i >= 0 && i < WEEK_HOURS))].sort((x, y) => x - y);
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The schedule's days with anything that is not a weekday number dropped. */
export function validDays(a: Availability): number[] {
  return a.days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6);
}

/**
 * True when this schedule actually rules anything out.
 *
 * Every day plus every hour is not a constraint, it is the default, and treating it as one would
 * mean a fingerprint change and a pointless push loop for a setting that excludes nothing.
 */
export function isConstrained(a: Availability | null | undefined): a is Availability {
  if (!a) return false;
  // Weekly hours: a schedule when some hour is blocked and some is free. A week with EVERY hour blocked is no schedule
  // (decided 21 Nov 2026): Setup will not save one, and an old or odd saved one plans as if no hours were set, never as
  // "never available".
  if (a.blocked !== undefined) return blockedArray(a) !== null;
  return windowConstrained(a);
}

/** The daily window's own test (the schedule before weekly hours). */
function windowConstrained(a: Availability): boolean {
  const { fromHour: f, toHour: t } = a;
  if (!Number.isInteger(f) || !Number.isInteger(t)) return false;
  if (f < 0 || f > 23 || t < 0 || t > 23) return false;
  const days = validDays(a);
  const allDays = days.length === 0 || days.length === 7;
  const allHours = f === t;
  return !(allDays && allHours);
}

/** `Mon-Fri 18:00-23:00 America/Denver` — for logs, CSV headers and the panel. */
export function describeAvailability(a: Availability | null | undefined): string {
  if (!isConstrained(a)) return 'any time';
  // A mask that is its own daily window reads as that window (a saved schedule turned into a mask keeps its words, its
  // key and the collector's `window`). Any other: DRAFT words, the collector's `window` text is Collector's (R10).
  if (!isOwnWindow(a)) return `weekly ${WEEK_HOURS - blockedArray(a)!.count}h free ${a.timezone}`;
  const pad = (h: number) => `${String(h).padStart(2, '0')}:00`;
  const days = validDays(a).sort((x, y) => x - y);
  const dayText = !days.length || days.length === 7 ? 'every day' : days.map(d => DAY_NAMES[d]).join(',');
  const hourText = a.fromHour === a.toHour ? 'all day' : `${pad(a.fromHour)}-${pad(a.toHour)}`;
  return `${dayText} ${hourText} ${a.timezone}`;
}

/** Stable, order-independent key for the run fingerprint. Reordering the day checkboxes must not
 *  invalidate a checkpoint. */
export function availabilityKey(a: Availability | null | undefined): string {
  if (!isConstrained(a)) return '';
  if (!isOwnWindow(a)) return `availw-${blockedHex(a)}@${a.timezone}`;
  const days = validDays(a).sort((x, y) => x - y);
  return `avail${days.join('') || 'all'}-${a.fromHour}-${a.toHour}@${a.timezone}`;
}

/** The sleep preset: available every day between waking and bedtime. */
export function fromSleepHours(sleepFrom: number, sleepUntil: number, timezone: string): Availability {
  return { days: [], fromHour: sleepUntil, toHour: sleepFrom, timezone };
}

/**
 * The daily window as weekly blocked hours: the preset that turns a saved from/to/days schedule into a mask, and the
 * reading every older schedule had. A window past midnight belongs to the day it STARTED (Friday 6 PM-2 AM frees
 * early Saturday), exactly as `isAvailable` reads the window. A window that rules nothing out, or has hours that are
 * not 0-23, blocks nothing.
 */
export function maskOfWindow(days: number[], fromHour: number, toHour: number): number[] {
  const a: Availability = { days, fromHour, toHour, timezone: 'UTC' };
  if (!windowConstrained(a)) return [];
  const chosen = validDays(a);
  const anyDay = !chosen.length || chosen.length === 7;
  const wraps = fromHour > toHour;
  const out: number[] = [];
  for (let d = 0; d < 7; d++)
    for (let h = 0; h < 24; h++) {
      const inHours = fromHour === toHour || (wraps ? h >= fromHour || h < toHour : h >= fromHour && h < toHour);
      const onDay = anyDay || chosen.includes(wraps && h < toHour ? (d + 6) % 7 : d);
      if (!(inHours && onDay)) out.push(weekIndex(d, h));
    }
  return out.sort((x, y) => x - y);
}

/** The mask read once per schedule object: 1 = blocked, by week index, and how many; null when it is no schedule
 *  (nothing blocked, or everything). Schedules are plain objects made fresh when a setting changes, never edited. */
export interface BlockedArray {
  readonly blocked: Uint8Array;
  readonly count: number;
}
const blockedCache = new WeakMap<Availability, BlockedArray | null>();
export function blockedArray(a: Availability): BlockedArray | null {
  let v = blockedCache.get(a);
  if (v === undefined) {
    const list = a.blocked !== undefined ? validBlocked(a.blocked) : maskOfWindow(a.days, a.fromHour, a.toHour);
    if (list.length === 0 || list.length === WEEK_HOURS) v = null;
    else {
      const blocked = new Uint8Array(WEEK_HOURS);
      for (const i of list) blocked[i] = 1;
      v = { blocked, count: list.length };
    }
    blockedCache.set(a, v);
  }
  return v;
}

/** No mask, or a mask that is exactly the daily window it carries. */
function isOwnWindow(a: Availability): boolean {
  if (a.blocked === undefined) return true;
  if (!windowConstrained(a)) return false;
  const own = maskOfWindow(a.days, a.fromHour, a.toHour);
  const mine = validBlocked(a.blocked);
  return own.length === mine.length && own.every((x, i) => x === mine[i]);
}

/** The blocked hours as 42 hex digits, Monday 00:00 first, 4 hours to a digit. */
function blockedHex(a: Availability): string {
  const b = blockedArray(a)!.blocked;
  let out = '';
  for (let i = 0; i < WEEK_HOURS; i += 4) out += ((b[i] << 3) | (b[i + 1] << 2) | (b[i + 2] << 1) | b[i + 3]).toString(16);
  return out;
}
