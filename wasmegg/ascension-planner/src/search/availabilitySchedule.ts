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
  const days = validDays(a).sort((x, y) => x - y);
  return `avail${days.join('') || 'all'}-${a.fromHour}-${a.toHour}@${a.timezone}`;
}

/** The sleep preset: available every day between waking and bedtime. */
export function fromSleepHours(sleepFrom: number, sleepUntil: number, timezone: string): Availability {
  return { days: [], fromHour: sleepUntil, toHour: sleepFrom, timezone };
}
