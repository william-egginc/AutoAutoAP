/**
 * The My plans filters: which of the viewer's own runs to show, and "the best one for each".
 *
 * A player comparing their own plans asks "what is best if I play 7 am to 11 pm", "what if I start on
 * a Saturday", "is 5 ascensions better than 6". Each answer is a slice of the same list, so the
 * filters only narrow what My plans already ranks (lib/leaderboardRank.ts `buildMyPlans`, earliest
 * finish first; `deadlineOrder` for "the highest TE by a date"). Nothing here re-ranks.
 *
 * Every dimension is read from the board row as sent: the hours from `window` (the text
 * search/availabilitySchedule.ts `describeAvailability` writes), the start from `startUtc`/`startLocal`
 * on the row's own calendar, ascensions from the route, the goal from `deadline`, time off from
 * `timeOff`. Pure, so the component only renders.
 */
import { isDeadlineRow, scheduleText, startMs, type BoardRow } from './leaderboardRank';
import { showSchedule } from './displayTime';

export type DayPart = 'night' | 'morning' | 'afternoon' | 'evening';
export type Goal = 'target' | 'deadline';
export type GroupBy = 'hours' | 'day' | 'ascensions';

/** One value per dimension, null for "All". `hours` is '' for "Any hour" (no awake hours set). */
export interface PlanFilters {
  hours: string | null;
  /** Day of the week the plan starts, 0 = Sunday. */
  day: number | null;
  part: DayPart | null;
  ascensions: number | null;
  goal: Goal | null;
  timeOff: 'with' | 'without' | null;
  /** Show only the best plan for each value of this dimension. */
  groupBy: GroupBy | null;
}

export const NO_FILTERS: Readonly<PlanFilters> = {
  hours: null,
  day: null,
  part: null,
  ascensions: null,
  goal: null,
  timeOff: null,
  groupBy: null,
};

/** What one row is, on every dimension. */
export interface Facets {
  hours: string;
  day: number | null;
  part: DayPart | null;
  ascensions: number;
  goal: Goal;
  timeOff: boolean;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Start-of-day buckets, by the hour the plan starts on its own clock. */
const PARTS: { part: DayPart; from: number; to: number; label: string }[] = [
  { part: 'night', from: 0, to: 6, label: 'Night' },
  { part: 'morning', from: 6, to: 12, label: 'Morning' },
  { part: 'afternoon', from: 12, to: 18, label: 'Afternoon' },
  { part: 'evening', from: 18, to: 24, label: 'Evening' },
];

/** An hour of the day on a 12-hour clock, short: `7 am`, `noon`, `12 am`. */
export function hour12(hour: number): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h === 12) return 'noon';
  return `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`;
}

/**
 * A row's `window` read back into hours and days: `every day 07:00-23:00 America/Chicago`,
 * `Mon,Sat 09:00-01:00 UTC`, `every day all day UTC`. Null for no schedule or text it cannot read.
 */
export function parseWindow(
  window: string | null | undefined
): { days: number[]; fromHour: number; toHour: number; timezone: string } | null {
  if (!window) return null;
  const m = /^(every day|[A-Za-z]{3}(?:,[A-Za-z]{3})*) (all day|(\d{1,2}):00-(\d{1,2}):00)(?: (\S+))?\s*$/.exec(
    window.trim()
  );
  if (!m) return null;
  const days = m[1] === 'every day' ? [] : m[1].split(',').map(d => DAYS.indexOf(d));
  if (days.some(d => d < 0)) return null;
  const allDay = m[2] === 'all day';
  return {
    days,
    fromHour: allDay ? 0 : Number(m[3]),
    toHour: allDay ? 0 : Number(m[4]),
    timezone: m[5] ?? '',
  };
}

/** `7 am–11 pm`, `Sat, Sun 9 am–1 am`, `all day`, or `Any hour` for no schedule. */
export function hoursLabel(window: string | null | undefined): string {
  if (!window) return 'Any hour';
  const a = parseWindow(window);
  if (!a) return scheduleText(window);
  const days = [...new Set(a.days)].sort((x, y) => x - y);
  const dayText = !days.length || days.length === 7 ? '' : `${days.map(d => DAYS[d]).join(', ')} `;
  const hours = a.fromHour === a.toHour ? 'all day' : `${hour12(a.fromHour)}–${hour12(a.toHour)}`;
  return `${dayText}${hours}`;
}

/** The full schedule for a tooltip, by the player's clock (lib/displayTime.ts `showSchedule`). */
export function hoursTitle(window: string | null | undefined): string {
  if (!window) return 'Planned for play at any hour (no awake hours set)';
  const a = parseWindow(window);
  return a ? showSchedule({ ...a, timezone: a.timezone || 'its own timezone' }) : window;
}

const weekdayFormatters = new Map<string, Intl.DateTimeFormat>();

/** Day of the week and hour of `ms` in `zone` (UTC for a zone the browser does not know). */
function dayAndHour(ms: number, zone: string): { day: number; hour: number } {
  let f = weekdayFormatters.get(zone);
  if (!f) {
    const opts: Intl.DateTimeFormatOptions = { weekday: 'short', hour: 'numeric', hourCycle: 'h23' };
    try {
      f = new Intl.DateTimeFormat('en-US', { ...opts, timeZone: zone });
    } catch {
      f = new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' });
    }
    weekdayFormatters.set(zone, f);
  }
  const parts = f.formatToParts(new Date(ms));
  const day = DAYS.indexOf(parts.find(p => p.type === 'weekday')?.value ?? '');
  const hour = Number(parts.find(p => p.type === 'hour')?.value) % 24;
  return { day, hour };
}

/** Where a row sits on every dimension. Its start is read in its own timezone, else in `zone`. */
export function facetsOf(row: BoardRow, zone: string): Facets {
  const start = startMs(row);
  const at = start == null ? null : dayAndHour(start, row.timezone || zone);
  return {
    // Without the zone: one account plays on one clock, and the zone is in the tooltip.
    hours: row.window ? scheduleText(row.window) : '',
    day: at && at.day >= 0 ? at.day : null,
    part: at ? (PARTS.find(p => at.hour >= p.from && at.hour < p.to)?.part ?? null) : null,
    ascensions: row.chain.length,
    goal: isDeadlineRow(row) ? 'deadline' : 'target',
    timeOff: !!row.timeOff?.length,
  };
}

/** Whether a row is in every chosen category. */
export function inFilters(row: BoardRow, f: PlanFilters, zone: string): boolean {
  const x = facetsOf(row, zone);
  if (f.hours !== null && x.hours !== f.hours) return false;
  if (f.day !== null && x.day !== f.day) return false;
  if (f.part !== null && x.part !== f.part) return false;
  if (f.ascensions !== null && x.ascensions !== f.ascensions) return false;
  if (f.goal !== null && x.goal !== f.goal) return false;
  if (f.timeOff === 'with' && !x.timeOff) return false;
  if (f.timeOff === 'without' && x.timeOff) return false;
  return true;
}

export interface FilterOption<V> {
  value: V;
  label: string;
  title?: string;
}

export interface FilterOptions {
  hours: FilterOption<string>[];
  day: FilterOption<number>[];
  part: FilterOption<DayPart>[];
  ascensions: FilterOption<number>[];
  goal: FilterOption<Goal>[];
  timeOff: FilterOption<'with' | 'without'>[];
}

/**
 * The values each dimension takes in `rows`, in reading order. A dimension with fewer than two is
 * not a choice, and the bar leaves it out. `target` names the race goal (`Fastest to 490`).
 */
export function filterOptions(rows: readonly BoardRow[], zone: string, target?: number | null): FilterOptions {
  const hours = new Map<string, BoardRow>();
  const days = new Set<number>();
  const parts = new Set<DayPart>();
  const ascensions = new Set<number>();
  const goals = new Set<Goal>();
  const off = new Set<boolean>();
  for (const r of rows) {
    const x = facetsOf(r, zone);
    if (!hours.has(x.hours)) hours.set(x.hours, r);
    if (x.day !== null) days.add(x.day);
    if (x.part !== null) parts.add(x.part);
    ascensions.add(x.ascensions);
    goals.add(x.goal);
    off.add(x.timeOff);
  }
  // Any hour first, then by the hour play starts.
  const startHour = (k: string) => (k ? (parseWindow(hours.get(k)?.window)?.fromHour ?? 24) : -1);
  return {
    hours: [...hours.keys()]
      .sort((a, b) => startHour(a) - startHour(b) || a.localeCompare(b))
      .map(k => ({ value: k, label: hoursLabel(hours.get(k)?.window), title: hoursTitle(hours.get(k)?.window) })),
    // Monday first: a plan week reads Mon..Sun.
    day: [...days]
      .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
      .map(d => ({ value: d, label: DAYS[d], title: 'Plans that start on this day, on their own clock' })),
    part: PARTS.filter(p => parts.has(p.part)).map(p => ({
      value: p.part,
      label: p.label,
      title: `Plans that start between ${hour12(p.from)} and ${hour12(p.to)}, on their own clock`,
    })),
    ascensions: [...ascensions].sort((a, b) => a - b).map(n => ({ value: n, label: String(n) })),
    goal: (['target', 'deadline'] as const)
      .filter(g => goals.has(g))
      .map(g => ({
        value: g,
        label:
          g === 'target' ? (target != null ? `Fastest to ${target}` : 'Fastest to a target') : 'Highest TE by a date',
      })),
    timeOff: [
      ...(off.has(true) ? [{ value: 'with' as const, label: 'With time off' }] : []),
      ...(off.has(false) ? [{ value: 'without' as const, label: 'No time off' }] : []),
    ],
  };
}

/** Whether a dimension is a choice: two or more values on the rows. */
export function offered(options: FilterOptions, key: keyof FilterOptions): boolean {
  return options[key].length >= 2;
}

/**
 * The filters as they apply to these rows. A remembered value the rows no longer have, or a
 * dimension the bar does not show, is "All": a filter nobody can see must not hide anything.
 */
export function effectiveFilters(f: PlanFilters, options: FilterOptions): PlanFilters {
  const keep = <K extends keyof FilterOptions>(key: K, v: PlanFilters[K]): PlanFilters[K] =>
    v !== null && offered(options, key) && options[key].some(o => o.value === v) ? v : (null as PlanFilters[K]);
  const groupDim: Record<GroupBy, keyof FilterOptions> = { hours: 'hours', day: 'day', ascensions: 'ascensions' };
  return {
    hours: keep('hours', f.hours),
    day: keep('day', f.day),
    part: keep('part', f.part),
    ascensions: keep('ascensions', f.ascensions),
    goal: keep('goal', f.goal),
    timeOff: keep('timeOff', f.timeOff),
    groupBy: f.groupBy && offered(options, groupDim[f.groupBy]) ? f.groupBy : null,
  };
}

/** Anything chosen at all. */
export function isFiltered(f: PlanFilters): boolean {
  return Object.values(f).some(v => v !== null);
}

/** The key a row is grouped under for "the best for each". */
export function groupKey(row: BoardRow, by: GroupBy, zone: string): string {
  const x = facetsOf(row, zone);
  return by === 'hours' ? x.hours : by === 'day' ? String(x.day ?? '') : String(x.ascensions);
}

/** What a group is called: `7 am–11 pm`, `Sat`, `5 ascensions`. */
export function groupLabel(row: BoardRow, by: GroupBy, zone: string): string {
  const x = facetsOf(row, zone);
  if (by === 'hours') return hoursLabel(row.window);
  if (by === 'day') return x.day === null ? 'Unknown start' : DAYS[x.day];
  return `${x.ascensions} ${x.ascensions === 1 ? 'ascension' : 'ascensions'}`;
}

/**
 * The first item of each group, in the order given. `items` must already be best first (My plans
 * is: its best, then the others by finish), so the first of a group is that group's best.
 */
export function bestPerGroup<T>(items: readonly T[], rowOf: (t: T) => BoardRow, by: GroupBy, zone: string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const t of items) {
    const k = groupKey(rowOf(t), by, zone);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

// ------------------------------------------------------------------------------- remembered

const KEY = 'aap.myPlansFilters';

/** Saved filters read back, keeping only values of the right kind; anything else is "All". */
export function parseSavedFilters(raw: string | null): PlanFilters {
  let v: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') v = parsed as Record<string, unknown>;
  } catch {
    // a preference, not a reason to fail
  }
  const oneOf = <V>(x: unknown, allowed: readonly V[]): V | null => (allowed.includes(x as V) ? (x as V) : null);
  const int = (x: unknown) => (typeof x === 'number' && Number.isInteger(x) ? x : null);
  return {
    hours: typeof v.hours === 'string' ? v.hours : null,
    day: int(v.day) !== null && (v.day as number) >= 0 && (v.day as number) <= 6 ? (v.day as number) : null,
    part: oneOf(v.part, ['night', 'morning', 'afternoon', 'evening'] as const),
    ascensions: int(v.ascensions),
    goal: oneOf(v.goal, ['target', 'deadline'] as const),
    timeOff: oneOf(v.timeOff, ['with', 'without'] as const),
    groupBy: oneOf(v.groupBy, ['hours', 'day', 'ascensions'] as const),
  };
}

/** The filters this browser last used on My plans. */
export function loadPlanFilters(): PlanFilters {
  try {
    return parseSavedFilters(localStorage.getItem(KEY));
  } catch {
    return { ...NO_FILTERS };
  }
}

export function savePlanFilters(f: PlanFilters): void {
  try {
    if (isFiltered(f)) localStorage.setItem(KEY, JSON.stringify(f));
    else localStorage.removeItem(KEY);
  } catch {
    // a preference, not a reason to fail
  }
}
