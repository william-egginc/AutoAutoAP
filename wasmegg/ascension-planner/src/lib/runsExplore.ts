/**
 * My runs › Your runs, explorable (Jordan, 24 Oct 2026: "dig deeper into what my plans do"). The list of the
 * viewer's board runs (MyRunsList.vue) gets one compact bar of chip buttons (components/myruns/RunsExploreBar.vue)
 * in place of the old selects (MyRunsFilters.vue):
 *
 *   Goal        Fastest to 490 (the planner's target), Other targets (every other race), Egg Day, Other dates
 *   Ascensions  the route's length
 *   Level       instant answer / Fast / Exact / Custom (what found the run; "Not recorded" on older rows)
 *   Hours       My hours (planned around awake hours) / Any time
 *   Sent        Today / 1–6 days ago / 1–4 weeks ago / Older (calendar days in the viewer's timezone)
 *   Sort        Best first / Newest / Fastest finish / Most TE / Fewest ascensions
 *   Stops       "200 250": every number typed is a stop of the route (kept from the old filters)
 *
 * Kept light, since most players have few runs: a chip exists only for a value that occurs in the player's runs, a
 * group only when it has two values or more, and the whole bar only from `MIN_RUNS_FOR_BAR` runs (below that every
 * run shows, best first). Within a group the chips are "or" (Fast or Exact); groups are "and". A chip remembered
 * for a value no run has any more is simply not applied (`effectiveSelection`).
 *
 * The selection is remembered per account in this browser (`aap-runs-explore:<account hash>`, lib/accountHash.ts,
 * never the player ID), every read and write in try/catch. Pure: the component only renders.
 */
import { finishOf, parseStops, hasStops, runKind, sortMyRuns } from './myRuns';
import { sentMs, type BoardRow } from './leaderboardRank';

export type GoalValue = string; // 'fastest:<planner target>' | 'fastest:other' | 'eggday' | 'date'
export type LevelValue = 'instant' | 'Fast' | 'Exact' | 'Custom' | 'unknown';
export type HoursValue = 'mine' | 'any';
export type WhenValue = 'today' | 'week' | 'month' | 'older';
export type ExploreSort = 'best' | 'newest' | 'finish' | 'te' | 'fewest';
export type ExploreGroup = 'goal' | 'asc' | 'level' | 'hours' | 'when';

export interface RunsExplore {
  goal: GoalValue[];
  asc: number[];
  level: LevelValue[];
  hours: HoursValue[];
  when: WhenValue[];
  stops: string;
  sort: ExploreSort;
}

export const DEFAULT_RUNS_EXPLORE: Readonly<RunsExplore> = Object.freeze({
  goal: [],
  asc: [],
  level: [],
  hours: [],
  when: [],
  stops: '',
  sort: 'best',
});

export function emptyExplore(sort: ExploreSort = 'best'): RunsExplore {
  return { goal: [], asc: [], level: [], hours: [], when: [], stops: '', sort };
}

/** Fewer runs than this: no bar at all, every run shows best first. */
export const MIN_RUNS_FOR_BAR = 4;

export const SORTS: { id: ExploreSort; label: string }[] = [
  { id: 'best', label: 'Best first' },
  { id: 'newest', label: 'Newest' },
  { id: 'finish', label: 'Fastest finish' },
  { id: 'te', label: 'Most TE' },
  { id: 'fewest', label: 'Fewest ascensions' },
];

export const GROUP_LABELS: Record<ExploreGroup, string> = {
  goal: 'Goal',
  asc: 'Ascensions',
  level: 'Level',
  hours: 'Hours',
  when: 'Sent',
};

const LEVEL_ORDER: LevelValue[] = ['instant', 'Fast', 'Exact', 'Custom', 'unknown'];
const LEVEL_LABELS: Record<LevelValue, string> = {
  instant: 'Instant answer',
  Fast: 'Fast',
  Exact: 'Exact',
  Custom: 'Custom',
  unknown: 'Not recorded',
};
const HOURS_ORDER: HoursValue[] = ['mine', 'any'];
const HOURS_LABELS: Record<HoursValue, string> = { mine: 'My hours', any: 'Any time' };
const WHEN_ORDER: WhenValue[] = ['today', 'week', 'month', 'older'];
const WHEN_LABELS: Record<WhenValue, string> = {
  today: 'Today',
  week: '1–6 days ago',
  month: '1–4 weeks ago',
  older: 'Older',
};

/** What the chips read about the list: Egg Day's moment and year, the planner's target, now (ms), the zone. */
export interface ExploreContext {
  eggDayAt: number;
  eggDayYear: number;
  /** The planner's own Fastest target (490): its chip comes first. */
  mainTarget: number;
  nowMs: number;
  zone: string;
}

/**
 * What found a run, in player words. The board's `level` (search/submission.ts): 'light' is the instant answer
 * (priced at once, `atOnce`), 'quick' Fast, 'normal'/'thorough'/'balanced' Exact; 'exhaustive', a run with boxes
 * (`space`) or a By a date answer in boxes mode is Custom. Older rows carry none.
 */
export function levelOf(row: Pick<BoardRow, 'level' | 'effort' | 'atOnce' | 'mode' | 'deadline'> & { space?: unknown }): LevelValue {
  if (row.space || row.level === 'exhaustive' || (row.deadline && row.mode === 'advanced')) return 'Custom';
  const l = row.level ?? row.effort;
  if (l === 'light' || row.atOnce) return 'instant';
  if (l === 'quick') return 'Fast';
  if (l === 'normal' || l === 'thorough' || l === 'balanced') return 'Exact';
  return 'unknown';
}

/** The run's goal chip: 'fastest:<the planner's target>', 'fastest:other' (a race to any other target), 'eggday'
 *  or 'date'. Other targets share one chip so a player who tried many keeps one short row on a phone. */
export function goalOf(row: BoardRow, eggDayAt: number, mainTarget: number): GoalValue {
  const kind = runKind(row, eggDayAt);
  if (kind === 'race') return row.finalTE === mainTarget ? `fastest:${mainTarget}` : 'fastest:other';
  return kind === 'eggday' ? 'eggday' : 'date';
}

/** A calendar day's number in the zone (days since 1970-01-01 there); null when the zone can't be read. */
function dayIndex(ms: number, zone: string): number | null {
  try {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: zone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date(ms))
      .reduce<Record<string, string>>((o, x) => ((o[x.type] = x.value), o), {});
    return Math.round(Date.UTC(+p.year, +p.month - 1, +p.day) / 86_400_000);
  } catch {
    return null;
  }
}

/** When it was sent, as a chip: by calendar days in the viewer's zone. Null when it carries no send time. */
export function whenOf(row: BoardRow, nowMs: number, zone: string): WhenValue | null {
  const t = sentMs(row);
  if (t == null) return null;
  const a = dayIndex(t, zone);
  const b = dayIndex(nowMs, zone);
  if (a == null || b == null) return null;
  const days = b - a;
  if (days <= 0) return 'today';
  if (days <= 6) return 'week';
  if (days <= 29) return 'month';
  return 'older';
}

export function hoursOf(row: Pick<BoardRow, 'window'>): HoursValue {
  return row.window ? 'mine' : 'any';
}

/** One run's value in every group. */
export interface RunFacts {
  goal: GoalValue;
  asc: number;
  level: LevelValue;
  hours: HoursValue;
  when: WhenValue | null;
}

export function factsOf(row: BoardRow, c: ExploreContext): RunFacts {
  return {
    goal: goalOf(row, c.eggDayAt, c.mainTarget),
    asc: row.chain.length,
    level: levelOf(row),
    hours: hoursOf(row),
    when: whenOf(row, c.nowMs, c.zone),
  };
}

export function goalLabel(v: GoalValue, eggDayYear: number): string {
  if (v === 'eggday') return `Egg Day ${eggDayYear}`;
  if (v === 'date') return 'Other dates';
  if (v === 'fastest:other') return 'Other targets';
  return `Fastest to ${v.slice('fastest:'.length)}`;
}

export interface Chip {
  value: string;
  label: string;
  /** Runs with this value (of all the runs, whatever else is picked). */
  count: number;
  on: boolean;
}
export interface ChipGroup {
  id: ExploreGroup;
  label: string;
  chips: Chip[];
}

/** The chips a selection's group holds, as strings (the ascension counts are numbers in the selection). */
function picked(sel: RunsExplore, g: ExploreGroup): string[] {
  return (sel[g] as (string | number)[]).map(String);
}

/**
 * The groups to show: only values that occur, only groups with two values or more, each in a fixed order
 * (goal: the planner's target, other targets lowest first, Egg Day, other dates; ascensions ascending).
 */
export function chipGroups(rows: readonly BoardRow[], sel: RunsExplore, c: ExploreContext): ChipGroup[] {
  const counts: Record<ExploreGroup, Map<string, number>> = {
    goal: new Map(),
    asc: new Map(),
    level: new Map(),
    hours: new Map(),
    when: new Map(),
  };
  for (const r of rows) {
    const f = factsOf(r, c);
    const add = (g: ExploreGroup, v: string | number | null) => {
      if (v == null) return;
      const k = String(v);
      counts[g].set(k, (counts[g].get(k) ?? 0) + 1);
    };
    add('goal', f.goal);
    add('asc', f.asc);
    add('level', f.level);
    add('hours', f.hours);
    add('when', f.when);
  }
  const goalRank = (v: string): number[] => {
    if (v === `fastest:${c.mainTarget}`) return [0, 0];
    if (v.startsWith('fastest:')) return [1, 0];
    return v === 'eggday' ? [2, 0] : [3, 0];
  };
  const order: Record<ExploreGroup, (a: string, b: string) => number> = {
    goal: (a, b) => {
      const x = goalRank(a);
      const y = goalRank(b);
      return x[0] - y[0] || x[1] - y[1];
    },
    asc: (a, b) => Number(a) - Number(b),
    level: (a, b) => LEVEL_ORDER.indexOf(a as LevelValue) - LEVEL_ORDER.indexOf(b as LevelValue),
    hours: (a, b) => HOURS_ORDER.indexOf(a as HoursValue) - HOURS_ORDER.indexOf(b as HoursValue),
    when: (a, b) => WHEN_ORDER.indexOf(a as WhenValue) - WHEN_ORDER.indexOf(b as WhenValue),
  };
  const label: Record<ExploreGroup, (v: string) => string> = {
    goal: v => goalLabel(v, c.eggDayYear),
    asc: v => v,
    level: v => LEVEL_LABELS[v as LevelValue],
    hours: v => HOURS_LABELS[v as HoursValue],
    when: v => WHEN_LABELS[v as WhenValue],
  };
  const out: ChipGroup[] = [];
  for (const g of ['goal', 'asc', 'level', 'hours', 'when'] as ExploreGroup[]) {
    const m = counts[g];
    if (m.size < 2) continue;
    const on = new Set(picked(sel, g));
    const chips = [...m.keys()].sort(order[g]).map(v => ({ value: v, label: label[g](v), count: m.get(v) ?? 0, on: on.has(v) }));
    out.push({ id: g, label: GROUP_LABELS[g], chips });
  }
  return out;
}

/**
 * The selection as it applies to these runs: values no shown chip carries (a remembered pick for runs that are
 * gone, or a group with one value) are dropped, so nothing narrows the list that the player can't see and clear.
 * Fewer runs than `MIN_RUNS_FOR_BAR`: no bar, so nothing narrows and the sort is best first.
 */
export function effectiveSelection(rows: readonly BoardRow[], sel: RunsExplore, c: ExploreContext): RunsExplore {
  if (rows.length < MIN_RUNS_FOR_BAR) return emptyExplore();
  const groups = chipGroups(rows, sel, c);
  const keep = (g: ExploreGroup): string[] => {
    const shown = groups.find(x => x.id === g);
    if (!shown) return [];
    const vals = new Set(shown.chips.map(ch => ch.value));
    return picked(sel, g).filter(v => vals.has(v));
  };
  return {
    goal: keep('goal'),
    asc: keep('asc').map(Number),
    level: keep('level') as LevelValue[],
    hours: keep('hours') as HoursValue[],
    when: keep('when') as WhenValue[],
    stops: sel.stops,
    sort: sel.sort,
  };
}

/** Whether a run is in the selection: in every group that has a pick, one of its picks; and every stop typed. */
export function inExplore(row: BoardRow, sel: RunsExplore, c: ExploreContext): boolean {
  const f = factsOf(row, c);
  if (sel.goal.length && !sel.goal.includes(f.goal)) return false;
  if (sel.asc.length && !sel.asc.includes(f.asc)) return false;
  if (sel.level.length && !sel.level.includes(f.level)) return false;
  if (sel.hours.length && !sel.hours.includes(f.hours)) return false;
  if (sel.when.length && (f.when == null || !sel.when.includes(f.when))) return false;
  return hasStops(row, parseStops(sel.stops));
}

/** How many picks narrow the list (the sort is not one; the stops box counts once). */
export function activeCount(sel: RunsExplore): number {
  return (
    sel.goal.length + sel.asc.length + sel.level.length + sel.hours.length + sel.when.length + Number(parseStops(sel.stops).length > 0)
  );
}

/** A chip pressed: on if it was off, off if it was on. Returns a new selection. */
export function toggleChip(sel: RunsExplore, g: ExploreGroup, value: string): RunsExplore {
  const cur = picked(sel, g);
  const next = cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value];
  return { ...sel, [g]: g === 'asc' ? next.map(Number) : next } as RunsExplore;
}

/** "Clear filters": every pick and the stops box off; the sort stays. */
export function clearExplore(sel: RunsExplore): RunsExplore {
  return emptyExplore(sel.sort);
}

/** The most TE a run reaches: a date answer's TE, a race run's target. */
function teOf(row: BoardRow): number {
  return Number.isFinite(row.finalTE) ? row.finalTE : 0;
}

/** The items in the chosen order (`rowOf` reads a folded line's row). Best, Newest, Fewest as lib/myRuns.ts. */
export function sortExplore<T>(items: readonly T[], rowOf: (t: T) => BoardRow, sort: ExploreSort, eggDayAt: number): T[] {
  if (sort === 'te') {
    const best = sortMyRuns(items, rowOf, 'best', eggDayAt);
    const rank = new Map(best.map((t, i) => [t, i]));
    return [...items].sort((a, b) => teOf(rowOf(b)) - teOf(rowOf(a)) || (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
  }
  if (sort === 'finish') {
    const best = sortMyRuns(items, rowOf, 'best', eggDayAt);
    const rank = new Map(best.map((t, i) => [t, i]));
    return [...items].sort((a, b) => {
      const x = finishOf(rowOf(a));
      const y = finishOf(rowOf(b));
      if (x == null || y == null) return Number(x == null) - Number(y == null) || (rank.get(a) ?? 0) - (rank.get(b) ?? 0);
      return x - y || (rank.get(a) ?? 0) - (rank.get(b) ?? 0);
    });
  }
  return sortMyRuns(items, rowOf, sort, eggDayAt);
}

/** "5 of 25 runs" (always said when the bar shows). */
export function countWords(shown: number, total: number): string {
  return `${shown} of ${total} ${total === 1 ? 'run' : 'runs'}`;
}

// --------------------------------------------------------------------------------- remembered per account

export const RUNS_EXPLORE_PREFIX = 'aap-runs-explore:';

const isStrArr = (x: unknown): x is string[] => Array.isArray(x) && x.every(v => typeof v === 'string');

/** A stored selection, read back loosely: anything odd falls back to the default for that part. */
export function parseExplore(raw: unknown): RunsExplore {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const sort = SORTS.some(s => s.id === o.sort) ? (o.sort as ExploreSort) : 'best';
  const asc = Array.isArray(o.asc) ? o.asc.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0) : [];
  return {
    goal: isStrArr(o.goal) ? o.goal.slice(0, 50) : [],
    asc: asc.slice(0, 50),
    level: isStrArr(o.level) ? (o.level.filter(v => (LEVEL_ORDER as string[]).includes(v)) as LevelValue[]) : [],
    hours: isStrArr(o.hours) ? (o.hours.filter(v => (HOURS_ORDER as string[]).includes(v)) as HoursValue[]) : [],
    when: isStrArr(o.when) ? (o.when.filter(v => (WHEN_ORDER as string[]).includes(v)) as WhenValue[]) : [],
    stops: typeof o.stops === 'string' ? o.stops.slice(0, 80) : '',
    sort,
  };
}

/** The account's remembered selection (its partition hash), the default with none or no storage. */
export function readExplore(partition: string): RunsExplore {
  if (!partition) return emptyExplore();
  try {
    const s = localStorage.getItem(RUNS_EXPLORE_PREFIX + partition);
    return s ? parseExplore(JSON.parse(s)) : emptyExplore();
  } catch {
    return emptyExplore();
  }
}

/** Remember the selection for the account; the default is stored as nothing. */
export function writeExplore(partition: string, sel: RunsExplore): void {
  if (!partition) return;
  try {
    const key = RUNS_EXPLORE_PREFIX + partition;
    if (!activeCount(sel) && sel.sort === 'best') localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(parseExplore(sel)));
  } catch {
    // A private window: the selection lasts for the visit only.
  }
}
