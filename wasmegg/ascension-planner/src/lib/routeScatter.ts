/**
 * My runs' "Your routes at a glance" (RouteScatter.vue, Q9, 18 Oct 2026): the account's routes as points, from
 * what My runs already holds (the board rows LeaderboardPanel hands up: this browser's and the "maybe you" ones,
 * and the runs and answers saved on this device). Nothing is fetched or priced here. Pure.
 *
 * One goal at a time, because the rows carry different numbers per goal: a race row (Fastest) has its days to
 * the target and a finish; a By a date row has the TE it reaches and the time to spare before its date. Mixing
 * targets or dates on one picture would put a 12-day race to 490 beside a 3-day race to 300.
 *
 *   x  ascensions (the route's length), or the finish date (a race's finish, a date answer's last ascension)
 *   y  a race: days to the target (lower is sooner); a date: TE reached, or hours to spare
 *
 * Colour is the search level (ordinal: Light lightest, Exhaustive darkest; not recorded is grey), shape is
 * where the run is from (sent from this browser, looks like yours, saved here). The goal's best is
 * ringed. At most `SCATTER_CAP` points, the best kept, with a note when capped.
 */
import {
  deadlineAscendMs,
  deadlineSpare,
  finishMs,
  foldCopies,
  isDeadlineRow,
  madeDeadline,
  type BoardRow,
} from './leaderboardRank';
import { LEVEL_WORDS, type SearchLevel } from './howSure';
import { rowLevel } from './savedTiles';
import { thisDevice } from '@/search/device';
import { finishesBefore } from './eggDayRule';

export type ScatterX = 'asc' | 'finish';
/** A date goal's y; a race's y is always its days. */
export type ScatterY = 'te' | 'spare';
export type PointFrom = 'yours' | 'maybe' | 'saved';
export type PointLevel = SearchLevel | 'unknown';

export const SCATTER_CAP = 600;

export interface ScatterGoal {
  key: string;
  kind: 'race' | 'date';
  /** "Race to 490", "Egg Day 2026", "By Nov 2". */
  label: string;
  count: number;
}

export interface ScatterPoint {
  id: string;
  goal: string;
  from: PointFrom;
  level: PointLevel;
  chain: number[];
  /** Ascensions: the route's length. */
  asc: number;
  /** Race: the finish; date: the last ascension. Ms, null when unknown (a run saved here has no start). */
  finish: number | null;
  /** Race only: days to the target. */
  days: number | null;
  /** The TE the route ends on (a race's target, a date answer's last stop). */
  te: number;
  /** Date only: hours between the last ascension and the date. */
  spareHours: number | null;
}

/** A run saved on this device (store `savedRuns`, search/runLibrary.ts `RunSummary`), as read here. */
export interface SavedRunLike {
  id: string;
  savedAt: number;
  finalTE: number;
  effort: string;
  bestChain: number[];
  bestDays: number;
}
/** An answer saved on this device (store `savedAnswers`, search/deadlineStore.ts `SavedAnswer`), as read here. */
export interface SavedAnswerLike {
  id: string;
  savedAt: number;
  result: {
    deadline: number;
    level?: string;
    routes: { chain: number[]; ascendAt: number; spare: number }[];
  };
}

export interface ScatterInput {
  rows: readonly BoardRow[] | null;
  savedRuns?: readonly SavedRunLike[];
  savedAnswers?: readonly SavedAnswerLike[];
  /** Egg Day's moment, unix seconds. */
  eggDayAt: number;
  eggDayYear: number;
  zone: string;
}

const LEVELS: readonly SearchLevel[] = ['light', 'quick', 'normal', 'thorough', 'exhaustive'];
const asLevel = (v: unknown): PointLevel => (LEVELS.includes(v as SearchLevel) ? (v as SearchLevel) : 'unknown');

/** The level key's order (the legend's) and colours: one blue, light to dark (validated as an ordinal ramp). */
export const LEVEL_ORDER: readonly PointLevel[] = [...LEVELS, 'unknown'];
export const LEVEL_COLOURS: Record<PointLevel, string> = {
  light: '#86b6ef',
  quick: '#5598e7',
  normal: '#2a78d6',
  thorough: '#1c5cab',
  exhaustive: '#104281',
  unknown: '#a8a69e',
};
export function levelName(l: PointLevel): string {
  return l === 'unknown' ? 'Level not recorded' : LEVEL_WORDS[l];
}
export const FROM_ORDER: readonly PointFrom[] = ['yours', 'maybe', 'saved'];
/** "Sent from this browser", "Maybe you", "Saved on this phone" (search/device.ts `thisDevice`). */
export function fromName(f: PointFrom): string {
  return f === 'yours' ? 'Sent from this browser' : f === 'maybe' ? 'Maybe you' : `Saved on ${thisDevice()}`;
}

function shortDate(ms: number, zone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: zone, month: 'short', day: 'numeric' }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(5, 10);
  }
}

/** "Oct 21 at 2:40 pm" (12-hour, am/pm). */
export function whenText(ms: number, zone: string): string {
  try {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
        .formatToParts(new Date(ms))
        .map(x => [x.type, x.value])
    ) as Record<string, string>;
    return `${p.month} ${p.day} at ${p.hour}:${p.minute} ${(p.dayPeriod ?? '').toLowerCase()}`.trim();
  } catch {
    return shortDate(ms, zone);
  }
}

export function goalOfRace(target: number): ScatterGoal {
  return { key: `race:${target}`, kind: 'race', label: `Race to ${target}`, count: 0 };
}
export function goalOfDate(deadline: number, eggDayAt: number, eggDayYear: number, zone: string): ScatterGoal {
  return {
    key: `date:${deadline}`,
    kind: 'date',
    label: deadline === eggDayAt ? `Egg Day ${eggDayYear}` : `By ${shortDate(deadline * 1000, zone)}`,
    count: 0,
  };
}

/** The goals that have points, Egg Day first, then the other dates soonest first, then the races by target
 *  (My runs' own order), and every point. */
export function buildScatter(i: ScatterInput): { goals: ScatterGoal[]; points: ScatterPoint[]; missed: number } {
  const goals = new Map<string, ScatterGoal & { sortKey: [number, number] }>();
  const points: ScatterPoint[] = [];
  let missed = 0;
  const goal = (g: ScatterGoal, sortKey: [number, number]) => {
    const had = goals.get(g.key);
    if (had) return had;
    const made = { ...g, sortKey };
    goals.set(g.key, made);
    return made;
  };
  const seen = new Set<string>();
  const seenKey = (goalKey: string, chain: readonly number[]) => `${goalKey}|${chain.join(',')}`;

  for (const f of foldCopies(i.rows ?? [])) {
    const r = f.row;
    if (!Array.isArray(r.chain) || !r.chain.length) continue;
    const from: PointFrom = f.copies.some(c => c.yours) ? 'yours' : 'maybe';
    if (isDeadlineRow(r)) {
      // An answer whose last ascension misses its date is not an answer (lib/myRuns.ts `compareBest`).
      if (!madeDeadline(r)) {
        missed++;
        continue;
      }
      const d = r.deadline as number;
      const g = goal(goalOfDate(d, i.eggDayAt, i.eggDayYear, i.zone), [d === i.eggDayAt ? 0 : 1, d]);
      points.push({
        id: r.id ?? `row-${points.length}`,
        goal: g.key,
        from,
        level: rowLevel(r) ?? 'unknown',
        chain: r.chain,
        asc: r.chain.length,
        finish: deadlineAscendMs(r),
        days: null,
        te: r.finalTE,
        spareHours: deadlineSpare(r) / 3600,
      });
      seen.add(seenKey(g.key, r.chain));
    } else {
      if (!Number.isFinite(r.finalTE) || !Number.isFinite(r.durationDays)) continue;
      const g = goal(goalOfRace(r.finalTE), [2, r.finalTE]);
      points.push({
        id: r.id ?? `row-${points.length}`,
        goal: g.key,
        from,
        level: rowLevel(r) ?? 'unknown',
        chain: r.chain,
        asc: r.chain.length,
        finish: finishMs(r),
        days: r.durationDays,
        te: r.finalTE,
        spareHours: null,
      });
      seen.add(seenKey(g.key, r.chain));
    }
  }

  // Saved on this device: the same route already on the board for the same goal is one point, not two.
  for (const s of i.savedRuns ?? []) {
    if (!Array.isArray(s.bestChain) || !s.bestChain.length || !Number.isFinite(s.bestDays) || s.bestDays <= 0) continue;
    const g = goal(goalOfRace(s.finalTE), [2, s.finalTE]);
    if (seen.has(seenKey(g.key, s.bestChain))) continue;
    seen.add(seenKey(g.key, s.bestChain));
    points.push({
      id: `saved-${s.id}`,
      goal: g.key,
      from: 'saved',
      level: asLevel(s.effort),
      chain: s.bestChain,
      asc: s.bestChain.length,
      finish: null,
      days: s.bestDays,
      te: s.finalTE,
      spareHours: null,
    });
  }
  for (const a of i.savedAnswers ?? []) {
    const best = a.result?.routes?.[0];
    const d = a.result?.deadline;
    if (!best || !Array.isArray(best.chain) || !best.chain.length || typeof d !== 'number') continue;
    // Late answers are left out like the board's (lib/eggDayRule.ts); untimed ones stay, as before.
    const at = Number.isFinite(best.ascendAt) ? best.ascendAt : Number.isFinite(best.spare) ? d - best.spare : NaN;
    if (!Number.isNaN(at) && !finishesBefore(at, d)) {
      missed++;
      continue;
    }
    const g = goal(goalOfDate(d, i.eggDayAt, i.eggDayYear, i.zone), [d === i.eggDayAt ? 0 : 1, d]);
    if (seen.has(seenKey(g.key, best.chain))) continue;
    seen.add(seenKey(g.key, best.chain));
    points.push({
      id: `answer-${a.id}`,
      goal: g.key,
      from: 'saved',
      level: asLevel(a.result.level),
      chain: best.chain,
      asc: best.chain.length,
      finish: Number.isFinite(best.ascendAt) ? best.ascendAt * 1000 : null,
      days: null,
      te: best.chain[best.chain.length - 1],
      spareHours: Number.isFinite(best.spare) ? best.spare / 3600 : null,
    });
  }

  for (const p of points) goals.get(p.goal)!.count++;
  const list = [...goals.values()]
    .sort((a, b) => a.sortKey[0] - b.sortKey[0] || a.sortKey[1] - b.sortKey[1])
    .map(({ sortKey: _s, ...g }) => g);
  return { goals: list, points, missed };
}

/** The goal shown first: the one with the most points (ties: the list's order). Null with none. */
export function defaultGoal(goals: readonly ScatterGoal[]): string | null {
  let best: ScatterGoal | null = null;
  for (const g of goals) if (!best || g.count > best.count) best = g;
  return best?.key ?? null;
}

/** Best first: a race by its days (then the earlier finish), a date by its TE, then the most spare. */
export function bestOrder(kind: 'race' | 'date'): (a: ScatterPoint, b: ScatterPoint) => number {
  if (kind === 'race')
    return (a, b) => (a.days ?? Infinity) - (b.days ?? Infinity) || (a.finish ?? Infinity) - (b.finish ?? Infinity);
  return (a, b) => b.te - a.te || (b.spareHours ?? -Infinity) - (a.spareHours ?? -Infinity);
}

export interface ScatterView {
  goal: ScatterGoal | null;
  /** Best first, at most the cap. */
  shown: ScatterPoint[];
  best: ScatterPoint | null;
  /** In the goal but not drawable on this x/y (a run saved here has no finish date). */
  noValue: number;
  /** Left out by the cap. */
  capped: number;
  x: ScatterX;
  y: ScatterY | 'days';
}

/** The goal's points that can be drawn on this x and y, best first, capped. */
export function scatterView(
  goals: readonly ScatterGoal[],
  points: readonly ScatterPoint[],
  goalKey: string | null,
  x: ScatterX,
  yWanted: ScatterY,
  cap = SCATTER_CAP
): ScatterView {
  const goal = goals.find(g => g.key === goalKey) ?? null;
  const y: ScatterY | 'days' = goal?.kind === 'race' ? 'days' : yWanted;
  if (!goal) return { goal, shown: [], best: null, noValue: 0, capped: 0, x, y };
  const mine = points.filter(p => p.goal === goal.key);
  const ok = mine.filter(p => xOf(p, x) != null && yOf(p, y) != null);
  const sorted = [...ok].sort(bestOrder(goal.kind));
  return {
    goal,
    shown: sorted.slice(0, cap),
    best: sorted[0] ?? null,
    noValue: mine.length - ok.length,
    capped: Math.max(0, sorted.length - cap),
    x,
    y,
  };
}

export function xOf(p: ScatterPoint, x: ScatterX): number | null {
  return x === 'asc' ? p.asc : p.finish;
}
export function yOf(p: ScatterPoint, y: ScatterY | 'days'): number | null {
  if (y === 'days') return p.days;
  if (y === 'te') return p.te;
  return p.spareHours;
}

export const X_NAMES: Record<ScatterX, string> = { asc: 'Ascensions', finish: 'Finish date' };
export const Y_NAMES: Record<ScatterY | 'days', string> = {
  days: 'Days to finish (lower is sooner)',
  te: 'TE reached',
  spare: 'Hours to spare',
};

const days1 = (d: number) => `${d.toFixed(1)} days`;
const hours1 = (h: number) => `${h.toFixed(1)} h`;
const asc = (n: number) => `${n} ${n === 1 ? 'ascension' : 'ascensions'}`;

/** The hover / tap / focus card: the route, then its numbers, then where it is from. */
export function pointLines(p: ScatterPoint, goal: ScatterGoal, zone: string, best = false): string[] {
  const out = [`${best ? 'Best · ' : ''}${p.chain.join(' → ')}`];
  if (goal.kind === 'race') {
    const finish = p.finish != null ? ` · finishes ${whenText(p.finish, zone)}` : '';
    out.push(`${asc(p.asc)} · ${p.days != null ? days1(p.days) : 'days unknown'}${finish}`);
  } else {
    const spare = p.spareHours != null ? ` · ${hours1(p.spareHours)} to spare` : '';
    out.push(`${asc(p.asc)} · TE ${p.te}${spare}`);
    if (p.finish != null) out.push(`Last ascension ${whenText(p.finish, zone)}`);
  }
  out.push(`${levelName(p.level)} · ${fromName(p.from)}`);
  return out;
}

function range(vals: number[], fmt: (n: number) => string): string {
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  return fmt(lo) === fmt(hi) ? fmt(lo) : `${fmt(lo)} to ${fmt(hi)}`;
}

/** The text alternative: one or two sentences on what the picture shows. */
export function scatterSummary(v: ScatterView, zone: string): string {
  if (!v.goal) return 'No routes of yours to show yet.';
  if (!v.best) return `None of your ${v.goal.label} routes can be placed on this view.`;
  const n = v.shown.length + v.capped;
  const b = v.best;
  const ascs = range(
    v.shown.map(p => p.asc),
    x => String(x)
  );
  const ascText = ascs === '1' ? '1 ascension' : `${ascs} ascensions`;
  if (v.goal.kind === 'race') {
    const when = b.finish != null ? `, finishing ${whenText(b.finish, zone)}` : '';
    return `${n} ${n === 1 ? 'route' : 'routes'} for ${v.goal.label}. The best takes ${days1(b.days ?? 0)} with ${asc(
      b.asc
    )}${when}. Across them: ${ascText}, ${range(
      v.shown.map(p => p.days ?? 0),
      d => d.toFixed(1)
    )} days.`;
  }
  const spare = b.spareHours != null ? ` with ${hours1(b.spareHours)} to spare` : '';
  return `${n} ${n === 1 ? 'answer' : 'answers'} for ${v.goal.label}. The best reaches TE ${b.te}${spare}, in ${asc(
    b.asc
  )}. Across them: ${ascText}, TE ${range(
    v.shown.map(p => p.te),
    t => String(t)
  )}.`;
}

/** Notes under the picture: what was left out and why. */
export function scatterNotes(v: ScatterView, missed: number): string[] {
  const out: string[] = [];
  if (v.capped) out.push(`Showing the best ${v.shown.length} of ${v.shown.length + v.capped}, to keep the page light.`);
  if (v.noValue)
    out.push(
      v.x === 'finish'
        ? `${v.noValue} saved on ${thisDevice()} ${v.noValue === 1 ? 'has' : 'have'} no finish date, so ${v.noValue === 1 ? 'it is' : 'they are'} left out of this view.`
        : `${v.noValue} without this number ${v.noValue === 1 ? 'is' : 'are'} left out.`
    );
  if (missed && v.goal?.kind === 'date')
    out.push(
      `${missed} By a date ${missed === 1 ? 'run misses its date' : 'runs miss their dates'}, so ${missed === 1 ? 'it is' : 'they are'} not shown.`
    );
  return out;
}

// ------------------------------------------------------------------------------------------- axes

/** About `count` round ticks across [lo, hi]. */
export function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  if (lo === hi) return [lo];
  const raw = (hi - lo) / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? raw;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + step * 1e-9; t += step) out.push(Number(t.toFixed(10)));
  return out;
}

/** Whole-number ticks for ascensions: every one up to 12 across, else a round step. */
export function ascTicks(lo: number, hi: number): number[] {
  if (hi - lo <= 12) return Array.from({ length: hi - lo + 1 }, (_, k) => lo + k);
  return niceTicks(lo, hi).filter(t => Number.isInteger(t));
}

/** Day ticks for a finish date axis: midnights in `zone` (approximately: UTC days shifted by the zone's offset
 *  at `lo`), at most about six. */
export function dateTicks(lo: number, hi: number): number[] {
  const DAY = 86_400_000;
  const span = Math.max(1, Math.ceil((hi - lo) / DAY));
  const step = [1, 2, 3, 7, 14, 30].find(s => span / s <= 6) ?? 30;
  const out: number[] = [];
  for (let t = Math.ceil(lo / DAY) * DAY; t <= hi; t += step * DAY) out.push(t);
  return out;
}

export function tickText(v: number, axis: ScatterX | ScatterY | 'days', zone: string): string {
  if (axis === 'finish') return shortDate(v, zone);
  if (axis === 'asc' || axis === 'te') return String(Math.round(v));
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** The point nearest a tap, by distance in the picture's own units, or null when none is within `maxDist`. A tie goes to
 *  the later point (the picture draws the best last, so it is the one on top). Overlapping hit areas can't mislead it. */
export function nearestPoint<T extends { x: number; y: number }>(
  pts: readonly T[],
  x: number,
  y: number,
  maxDist: number
): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const q of pts) {
    const d = Math.hypot(q.x - x, q.y - y);
    if (d <= maxDist && d <= bestD) {
      best = q;
      bestD = d;
    }
  }
  return best;
}
