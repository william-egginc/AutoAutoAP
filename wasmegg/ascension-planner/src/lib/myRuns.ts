/**
 * My runs (#/myruns, MyRunsList.vue): which of the viewer's own board runs to show, and in what order.
 *
 * The tab replaced Compare's My plans (15 Oct 2026), which listed only the runs to one target TE: a
 * tester who sent an Egg Day answer found nothing there. So everything shows by default, every kind
 * and target, and the filters only narrow it:
 *
 *   Kind        All / Egg Day / Race to a target TE (any, or one) / By a date (every other date)
 *   Awake hours either / any time of day / my awake hours (Compare's own: a row sent with a `window`
 *               was planned around awake hours)
 *   Ascensions  any / 1..12 (the route's length)
 *   Stops       "200 250": every number typed is a stop of the route
 *   Sort        best first / newest sent / fewest ascensions / finish date
 *
 * "Best" per kind: a date answer by the highest TE reached, then the most time to spare (the By a date
 * board's `deadlineOrder`); a race run by the earliest finish. Mixed kinds keep their own groups, Egg Day
 * first, then the other dates soonest first, then the races by target. Pure: the component only renders.
 */
import {
  accountKeyOf,
  deadlineAscendMs,
  deadlineOrder,
  finishMs,
  isDeadlineRow,
  madeDeadline,
  sentMs,
  type BoardRow,
} from './leaderboardRank';

export type RunKind = 'eggday' | 'race' | 'dates';
export type KindFilter = 'all' | RunKind;
/** 'either', or Compare's two: 'any' (no awake hours set) and 'awake' (planned around them). */
export type HoursFilter = 'either' | 'any' | 'awake';
export type RunSort = 'best' | 'newest' | 'fewest' | 'finish';

export interface MyRunsFilters {
  kind: KindFilter;
  /** Race's target TE, null for any; read only when `kind` is 'race'. */
  target: number | null;
  hours: HoursFilter;
  /** Stops in the route, null for any. */
  ascensions: number | null;
  /** Stops the route must hold, as typed: "200 250". */
  stops: string;
  sort: RunSort;
}

export const DEFAULT_MY_RUNS_FILTERS: Readonly<MyRunsFilters> = {
  kind: 'all',
  target: null,
  hours: 'either',
  ascensions: null,
  stops: '',
  sort: 'best',
};

/** The Ascensions choices: any, or 1 to this many. */
export const MAX_ASCENSIONS_CHOICE = 12;

export const SORT_LABELS: Record<RunSort, string> = {
  best: 'Best first',
  newest: 'Newest',
  fewest: 'Fewest ascensions',
  finish: 'Finish date',
};

/**
 * Whether a board row is the viewer's: sent with this browser's code (`yours`, from GET /mine), or an
 * older run that looks like it, as My plans counted them (the save's timezone and artifacts), with the
 * race's own limits on a guess (lib/leaderboardRank.ts `viewerTag`): never a row that carries another
 * owner code, never one priced from a TE above the save's (a save was never at a higher TE earlier).
 * `viewerTE` 0: no save loaded, so no TE check.
 */
export function isMyRun(row: BoardRow, accountKey: string | null, viewerTE: number): boolean {
  if (row.yours) return true;
  if (!accountKey || row.acct || accountKeyOf(row) !== accountKey) return false;
  const te = row.backupTE ?? row.currentTE;
  return !(viewerTE > 0 && typeof te === 'number' && te > viewerTE);
}

/** Which board a row belongs on: Egg Day's (its deadline is Egg Day's moment), By a date's, or a race. */
export function runKind(row: Pick<BoardRow, 'deadline'>, eggDayAt: number): RunKind {
  if (!isDeadlineRow(row)) return 'race';
  return row.deadline === eggDayAt ? 'eggday' : 'dates';
}

/** The whole numbers typed in the stops box, in order: "200, 250" and "200 250" are [200, 250]. */
export function parseStops(text: string): number[] {
  return (text.match(/\d+/g) ?? []).map(Number).filter(n => Number.isFinite(n) && n > 0);
}

/** Whether every stop asked for is a stop of the route (none asked: any route). */
export function hasStops(row: Pick<BoardRow, 'chain'>, stops: readonly number[]): boolean {
  return stops.every(s => row.chain.includes(s));
}

/** Whether a row is in the filters' categories (the sort is not a filter). */
export function inMyRunsFilters(row: BoardRow, f: MyRunsFilters, eggDayAt: number): boolean {
  const kind = runKind(row, eggDayAt);
  if (f.kind !== 'all' && kind !== f.kind) return false;
  if (f.kind === 'race' && f.target != null && row.finalTE !== f.target) return false;
  const awake = !!row.window;
  if (f.hours === 'awake' && !awake) return false;
  if (f.hours === 'any' && awake) return false;
  if (f.ascensions != null && row.chain.length !== f.ascensions) return false;
  return hasStops(row, parseStops(f.stops));
}

/** How many filters narrow the list, for "Filters (2 active)". The kind and its target count once. */
export function activeFilterCount(f: MyRunsFilters): number {
  return (
    Number(f.kind !== 'all') +
    Number(f.hours !== 'either') +
    Number(f.ascensions != null) +
    Number(parseStops(f.stops).length > 0)
  );
}

/** The race targets among the rows, lowest first, for the Target TE choice. */
export function raceTargets(rows: readonly Pick<BoardRow, 'deadline' | 'finalTE'>[]): number[] {
  const seen = new Set<number>();
  for (const r of rows) if (!isDeadlineRow(r) && Number.isFinite(r.finalTE)) seen.add(r.finalTE);
  return [...seen].sort((a, b) => a - b);
}

/** When the run gets there: a date answer's last ascension, a race run's finish. Null when unknown. */
export function finishOf(row: BoardRow): number | null {
  return isDeadlineRow(row) ? deadlineAscendMs(row) : finishMs(row);
}

const KIND_ORDER: Record<RunKind, number> = { eggday: 0, dates: 1, race: 2 };

/** Nulls last, else smaller first. */
function ascNull(a: number | null, b: number | null): number {
  if (a == null || b == null) return Number(a == null) - Number(b == null);
  return a - b;
}

/** Best first: by kind's group, then the group's own "best" (see the module comment). */
export function compareBest(a: BoardRow, b: BoardRow, eggDayAt: number): number {
  const ka = runKind(a, eggDayAt);
  const kb = runKind(b, eggDayAt);
  if (ka !== kb) return KIND_ORDER[ka] - KIND_ORDER[kb];
  if (ka === 'race') {
    return (
      a.finalTE - b.finalTE ||
      ascNull(finishMs(a), finishMs(b)) ||
      Number(!!a.provisional) - Number(!!b.provisional) ||
      (sentMs(b) ?? 0) - (sentMs(a) ?? 0)
    );
  }
  return (
    (a.deadline as number) - (b.deadline as number) ||
    // An answer whose last ascension misses its date is not an answer: after the ones that make it.
    Number(!madeDeadline(a)) - Number(!madeDeadline(b)) ||
    deadlineOrder(a, b)
  );
}

/** The items in the chosen order. `rowOf` reads an item's row (a folded line's best copy, or the row). */
export function sortMyRuns<T>(items: readonly T[], rowOf: (t: T) => BoardRow, sort: RunSort, eggDayAt: number): T[] {
  const best = (a: T, b: T) => compareBest(rowOf(a), rowOf(b), eggDayAt);
  const by: Record<RunSort, (a: T, b: T) => number> = {
    best,
    newest: (a, b) => (sentMs(rowOf(b)) ?? 0) - (sentMs(rowOf(a)) ?? 0) || best(a, b),
    fewest: (a, b) => rowOf(a).chain.length - rowOf(b).chain.length || best(a, b),
    finish: (a, b) => ascNull(finishOf(rowOf(a)), finishOf(rowOf(b))) || best(a, b),
  };
  return [...items].sort(by[sort]);
}
