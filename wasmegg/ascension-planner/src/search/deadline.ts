/**
 * "How high can I get by a date?" -- the highest last stop a route reaches by a deadline.
 *
 * Every other search here answers "how fast to 490": the finish line is a TE and the score is the
 * time. This turns it round: the finish line is a TIME (Egg Day, 14 July 9:00 AM Pacific), and the
 * score is the TE of the last stop reached by then, with the time to spare as the tie-break.
 *
 * WHY IT IS CHEAP. The chain evaluator (search/chain.ts) prices a route to whatever its last entry
 * is, and a route's early stops take exactly as long whatever comes after them (measured on the PC:
 * 141 166 198 225 took 239.034 d as a 225 plan and inside the 490 plan). So "the best route to 248"
 * is priced like any chain, and every route sharing its early stops shares those legs through the
 * prefix memo -- trying many last stops costs one extra leg each.
 *
 * HOW IT SEARCHES.
 *   1. Coarse pass. Every set of early stops ("shape") on a grid, for every stop count asked for.
 *      For each shape it brackets the highest last stop that still makes the deadline: start from
 *      the best last stop found so far (neighbouring shapes land close together), step up while it
 *      makes it and down while it misses, then halve the gap to the exact TE. All shapes advance a
 *      round at a time, so each round is one parallel batch for the workers.
 *   2. Pattern search. From the best few routes (and the best of each stop count), every early
 *      stop is moved by half the grid, then a quarter, then 2, then 1 TE, the last stop
 *      re-bracketed each time, and any improvement kept -- until nothing moves at 1 TE. A full
 *      1-TE grid would be tens of thousands of routes; this spends the fine resolution only where
 *      the coarse pass says the answer is.
 *
 * WHAT IT ASSUMES. For one shape, a higher last stop is never reached sooner. That is what the
 * bracketing relies on, and it holds for the final leg the way the simulator prices it: reaching
 * more TE on the same farm from the same moment takes at least as long. The early stops carry no
 * such assumption -- they are enumerated, not bracketed.
 *
 * Pure: the caller supplies `evaluate` (the worker pool, or a stand-in in tests).
 */
import type { ChainResult, LegSummary } from './types';
import type { SetsLearned } from './deadlineEstimate';

export interface DeadlineSpec {
  currentTE: number;
  planStart: number;
  /** Unix seconds. The last stop must be reached (or, with `ascendAt`, ascended at) by then. */
  deadline: number;
  /** Stops per route INCLUDING the last one. 1 is "no ascension: keep going to the last stop". */
  minStops: number;
  maxStops: number;
  /** The last stop is searched within [lastLo, lastHi]. `lastLo` is also where bracketing starts. */
  lastLo: number;
  lastHi: number;
  /** Grid step for the early stops in the coarse pass. Raised automatically to fit `maxShapes`. */
  step: number;
  /** Coarse-pass budget in shapes (sets of early stops), summed over all stop counts. */
  maxShapes?: number;
  /**
   * The FIRST stop is also tried at every TE this far above the current TE, whatever the grid.
   * Default 5. It matters most and the grid misses it: on the alt's 24 Sep save the best first
   * ascension was 139 or 140 (137, 139 and 140 within 0.01 d), and a later first one cost 3-13 d --
   * a 20-TE grid starting at 140 could only offer 140 and 160.
   */
  firstStopFine?: number;
  /**
   * Shapes to try first, alongside the spread-out sample: the account's current route, its last
   * best. A good starting point makes every other bracket start next to the answer.
   */
  seedShapes?: number[][];
  /**
   * The player's own space, Insane-style: one list of values per early stop, in order. When given,
   * EXACTLY these combinations are tried (strictly increasing, above the current TE, below
   * `lastHi`) -- no guessing, no seed spread, no homing in outside them -- so the answer is proven
   * for that space. The stop count is `bands.length + 1`; `minStops`/`maxStops`/`step` are ignored.
   */
  bands?: number[][];
  /**
   * Several spaces at once, one per chain the player queued (each its own ascension count): every
   * route in any of them is tried in the one run. An empty set is one ascension -- no early stops.
   * Takes precedence over `bands`.
   */
  bandSets?: number[][][];
  /** The fine pass around the best routes. On unless false. */
  refine?: boolean;
  /** Routes the fine pass starts from. */
  refineFrom?: number;
  /**
   * How many routes the workers can price at once. A round asks one route per open shape, each
   * guess depending on the last -- so with fewer shapes open than workers (one chain of one
   * ascension is ONE shape) most workers sat idle while it halved its way down, eight rounds in a
   * row. With room to spare, each open shape now gets several guesses a round, spread across its
   * gap: seven workers on one shape cut a 300-TE range in three rounds instead of nine. Same answer,
   * more routes priced, less time. Unset or 1: one guess a shape a round, as before, so a run saved
   * without it replays the same way.
   */
  parallel?: number;
  /**
   * Let the last stop go past `lastLo`..`lastHi`: down to one above the last early stop and up to
   * `MAX_LAST_STOP`. The box is then where the search STARTS looking, not a wall. Without it a box
   * set too low stopped at its top with days to spare, and one set too high (or a single value
   * nobody can reach) found nothing at all (Allan, 30 Sept). Unset: the box is the whole range, as
   * before, so a run saved without it replays the same way.
   */
  extend?: boolean;
  /**
   * When the player can actually ASCEND at the last stop, given when it is reached -- the next
   * awake moment under their schedule. Absent: reaching it is enough.
   */
  ascendAt?: (reachUnix: number) => number;
}

export interface DeadlineRoute {
  chain: number[];
  /** When the last stop is reached, unix seconds. */
  reachAt: number;
  /** When the player can ascend at it (= reachAt without a schedule). */
  ascendAt: number;
  /** Seconds between the deciding moment and the deadline. Never negative for a listed route. */
  spare: number;
  legs: LegSummary[];
}

export interface DeadlineProgress {
  stage: string;
  priced: number;
  best: DeadlineRoute | null;
  /** Shapes still being bracketed in this pass, of how many. */
  open: number;
  shapes: number;
  /** The best routes so far, best first (each shape's best last stop), for a live table. */
  top: DeadlineRoute[];
  /** Space runs: what the sets finished so far cost, for re-estimating the total (deadlineEstimate.ts). */
  learn?: SetsLearned;
}

export interface DeadlineCallbacks {
  /** Price a batch. Chains that cannot be evaluated are simply absent from the result. */
  evaluate(chains: number[][]): Promise<ChainResult[]>;
  onProgress?(p: DeadlineProgress): void;
  shouldStop?(): boolean;
}

export interface DeadlineOutcome {
  /** Every route found, best first: highest last stop, then most time to spare. */
  routes: DeadlineRoute[];
  /** The best route for each stop count that has one. */
  byStops: Map<number, DeadlineRoute>;
  /** The grid step the coarse pass actually used (raised from `spec.step` to fit the budget). */
  step: number;
  shapes: number;
  priced: number;
  stoppedEarly: boolean;
}

export const DEFAULT_MAX_SHAPES = 3000;
const STEP_LADDER = [1, 2, 5, 10, 15, 20, 25, 30, 40, 50];

/** n choose k, exact enough for budgeting. */
function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

/** Early-stop values on the grid: above the current TE, below the highest last stop. */
export function gridValues(currentTE: number, lastHi: number, step: number): number[] {
  const values: number[] = [];
  const first = Math.max(Math.floor(currentTE) + 1, Math.ceil((Math.floor(currentTE) + 1) / step) * step);
  for (let v = first; v < lastHi; v += step) values.push(v);
  return values;
}

/** First-stop values: every TE just above the current one, then the grid. */
export function firstStopValues(currentTE: number, lastHi: number, step: number, fine = 5): number[] {
  const set = new Set(gridValues(currentTE, lastHi, step));
  for (let v = Math.floor(currentTE) + 1; v <= Math.floor(currentTE) + fine && v < lastHi; v++) set.add(v);
  return [...set].sort((a, b) => a - b);
}

type ShapeSpec = Pick<DeadlineSpec, 'currentTE' | 'lastHi' | 'minStops' | 'maxStops' | 'firstStopFine'>;

/** Every shape (set of early stops) with `k - 1` stops: a first stop from the fine list, the rest
 *  on the grid above it. */
function* shapesFor(spec: ShapeSpec, step: number, k: number): Generator<number[]> {
  if (k <= 1) {
    yield [];
    return;
  }
  const grid = gridValues(spec.currentTE, spec.lastHi, step);
  for (const f of firstStopValues(spec.currentTE, spec.lastHi, step, spec.firstStopFine ?? 5)) {
    const above = grid.filter(v => v > f);
    for (const rest of combinations(above, k - 2)) yield [f, ...rest];
  }
}

/** Shapes the coarse pass would try at this step, summed over the stop counts. */
export function countShapes(spec: ShapeSpec, step: number): number {
  const grid = gridValues(spec.currentTE, spec.lastHi, step);
  const firsts = firstStopValues(spec.currentTE, spec.lastHi, step, spec.firstStopFine ?? 5);
  let total = 0;
  for (let k = Math.max(1, spec.minStops); k <= spec.maxStops; k++) {
    if (k === 1) total += 1;
    else for (const f of firsts) total += choose(grid.filter(v => v > f).length, k - 2);
  }
  return total;
}

/** Every strictly increasing pick of one value per band: above the current TE, below `lastHi`. */
export function bandShapes(bands: number[][], currentTE: number, lastHi: number): number[][] {
  if (!bands.length || bands.some(b => !b.length)) return [];
  const out: number[][] = [];
  const walk = (slot: number, acc: number[]) => {
    if (slot === bands.length) {
      out.push([...acc]);
      return;
    }
    for (const v of bands[slot]) {
      const floor = acc.length ? acc[acc.length - 1] : Math.floor(currentTE);
      if (v > floor && v < lastHi) walk(slot + 1, [...acc, v]);
    }
  };
  walk(0, []);
  return out;
}

/** How many sets of early stops `bandShapes` gives, without building them (a DP across bands).
 *  No bands at all is one set: straight to the last stop. */
export function countBandShapes(bands: number[][], currentTE: number, lastHi: number): number {
  if (!bands.length) return 1;
  if (bands.some(b => !b.length)) return 0;
  let prevValues = bands[0].filter(v => v > Math.floor(currentTE) && v < lastHi);
  let prev = prevValues.map(() => 1);
  for (let slot = 1; slot < bands.length; slot++) {
    const values = bands[slot].filter(v => v < lastHi);
    prev = values.map(v => prevValues.reduce((n, u, i) => (v > u ? n + prev[i] : n), 0));
    prevValues = values;
  }
  return prev.reduce((a, b) => a + b, 0);
}

/**
 * Sets of early stops across several chains, each one tried once however many chains list it: two
 * chains with the same number of ascensions can share some. Counted by listing them when that is
 * cheap; past that (or when no two chains share a length) the plain sum is close enough for an
 * estimate. A chain whose bands do not make `asc - 1` stops counts nothing. Shared by the panel and
 * the command line, so the two estimates agree.
 */
export function countSpaceShapes(
  rows: { asc: number; bands: number[][] }[],
  currentTE: number,
  lastHi: number
): number {
  const counts = rows.map(row =>
    row.asc <= 1 ? 1 : row.bands.length === row.asc - 1 ? countBandShapes(row.bands, currentTE, lastHi) : 0
  );
  const total = counts.reduce((a, b) => a + b, 0);
  const asc = rows.filter((_, k) => counts[k] > 0).map(r => Math.max(1, Math.floor(r.asc)));
  if (new Set(asc).size === asc.length || total > 50_000) return total;
  const seen = new Set<string>();
  rows.forEach((row, k) => {
    if (!counts[k]) return;
    const list = row.asc <= 1 ? [[]] : bandShapes(row.bands, currentTE, lastHi);
    for (const s of list) seen.add(s.join(','));
  });
  return seen.size;
}

/**
 * One box's text as values: `160-200:10`, `175`, or several of either joined by commas
 * (`138-142:1, 150, 160-180:5`). Sorted, duplicates dropped. Same notation as Insane's bands.
 */
/** The highest last stop an extended search goes to: the planner's target. */
export const MAX_LAST_STOP = 490;

/** Above any TE the game has; a stop box never lists more than this. */
const MAX_STOP = 1000;

export function parseStopBox(text: string, defaultStep = 5): number[] {
  const set = new Set<number>();
  for (const part of text.split(',')) {
    const t = part.trim();
    if (!t) continue;
    const [range, stepPart] = t.split(':');
    const bounds = range.split(/[-–]/).map(x => Number(x.trim()));
    // Whole steps of at least 1: `:0.5` used to floor to 0 and loop forever, on a keystroke.
    const step = Math.floor(Number(stepPart)) >= 1 ? Math.floor(Number(stepPart)) : defaultStep;
    if (bounds.length === 1 && Number.isFinite(bounds[0])) set.add(Math.floor(bounds[0]));
    else if (bounds.length === 2 && bounds.every(Number.isFinite) && bounds[1] >= bounds[0]) {
      // No TE is above MAX_STOP, so neither is a stop: `220-1e9` is 220 up to it, not a billion.
      const hi = Math.min(Math.floor(bounds[1]), MAX_STOP);
      for (let v = Math.floor(bounds[0]); v <= hi; v += step) set.add(v);
    }
  }
  return [...set].sort((a, b) => a - b);
}

/** A chain's text, Insane-style: one band per early stop, `;` between them, each a stop box
 *  (`138-142:1; 160-200:10, 215; 230-260:5`). */
export function parseChainText(text: string): number[][] {
  return text
    .split(';')
    .map(part => parseStopBox(part))
    .filter(b => b.length);
}

/** The finest step on the ladder, at or above the one asked for, whose shape count fits. */
export function stepForBudget(spec: DeadlineSpec): number {
  const budget = spec.maxShapes ?? DEFAULT_MAX_SHAPES;
  const ladder = STEP_LADDER.filter(s => s >= Math.max(1, Math.floor(spec.step)));
  for (const s of ladder) if (countShapes(spec, s) <= budget) return s;
  return ladder[ladder.length - 1] ?? 50;
}

function* combinations(values: number[], k: number, from = 0, acc: number[] = []): Generator<number[]> {
  if (acc.length === k) {
    yield [...acc];
    return;
  }
  for (let i = from; i <= values.length - (k - acc.length); i++) {
    acc.push(values[i]);
    yield* combinations(values, k, i + 1, acc);
    acc.pop();
  }
}

/** One shape being bracketed: the highest last stop known to make it, the lowest known to miss.
 *  `jump` doubles on every step in the same direction, so a far-off answer takes a few rounds, not
 *  one per grid step. */
interface Bracket {
  shape: number[];
  ok: number | null;
  miss: number | null;
  jump: number;
  done: boolean;
  /** Routes tried on this shape so far (learning the cost of a set). */
  used: number;
}

/** Up to `n` items spread evenly through `list`. */
function spread<T>(list: T[], n: number): T[] {
  if (list.length <= n) return [...list];
  return Array.from({ length: n }, (_, i) => list[Math.floor(((i + 0.5) * list.length) / n)]);
}

export async function runDeadlineSearch(spec: DeadlineSpec, cb: DeadlineCallbacks): Promise<DeadlineOutcome> {
  const cache = new Map<string, ChainResult | null>();
  let priced = 0;
  let stoppedEarly = false;
  const ascendAt = spec.ascendAt ?? ((t: number) => t);
  const found = new Map<string, DeadlineRoute>();
  let best: DeadlineRoute | null = null;
  let stage = '';
  // What `bracketAll` is working on, for progress reported from inside a round.
  let openNow = 0;
  let shapesNow = 0;
  let learnNow: SetsLearned | undefined;
  const report = () =>
    cb.onProgress?.({
      stage,
      priced,
      best,
      open: openNow,
      shapes: shapesNow,
      top: rank([...found.values()]).slice(0, 10),
      ...(learnNow ? { learn: { ...learnNow } } : {}),
    });

  const better = (a: DeadlineRoute, b: DeadlineRoute | null): boolean => {
    if (!b) return true;
    const ta = a.chain[a.chain.length - 1];
    const tb = b.chain[b.chain.length - 1];
    return ta !== tb ? ta > tb : a.spare > b.spare;
  };

  function routeOf(res: ChainResult): DeadlineRoute | null {
    const reachAt = spec.planStart + res.seconds;
    const at = ascendAt(reachAt);
    if (!(at <= spec.deadline)) return null;
    return { chain: [...res.chain], reachAt, ascendAt: at, spare: spec.deadline - at, legs: res.legs };
  }

  async function price(chains: number[][]): Promise<void> {
    const todo = chains.filter(c => !cache.has(c.join(',')));
    // Depth-first, so siblings sharing early stops sit together and the prefix memo hits.
    todo.sort((a, b) => {
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const d = (a[i] ?? -1) - (b[i] ?? -1);
        if (d) return d;
      }
      return 0;
    });
    const CHUNK = 64;
    for (let i = 0; i < todo.length; i += CHUNK) {
      if (cb.shouldStop?.()) {
        stoppedEarly = true;
        return;
      }
      const slice = todo.slice(i, i + CHUNK);
      const results = await cb.evaluate(slice);
      const got = new Map(results.map(r => [r.chain.join(','), r]));
      for (const c of slice) {
        const key = c.join(',');
        const r = got.get(key) ?? null;
        cache.set(key, r);
        priced++;
        const route = r && routeOf(r);
        if (route) {
          found.set(key, route);
          if (better(route, best)) best = route;
        }
      }
      // After every batch, not just every round: a round over thousands of shapes is many batches,
      // and a counter stuck at 0 for ten minutes reads as a hang.
      report();
    }
  }

  const makes = (chain: number[]): boolean | null => {
    const key = chain.join(',');
    if (!cache.has(key)) return null;
    return found.has(key);
  };

  /** Bracket the highest last stop for every shape, a round (one batch) at a time. */
  async function bracketAll(shapes: number[][], startAt: (floor: number) => number, learn = false): Promise<void> {
    // The first step out of a bracket. An extended search may start far from the answer (a box of one
    // value, set well off), so it steps out faster; doubling from 1 TE cost two extra rounds a shape.
    const first = spec.extend ? Math.max(4, spec.step) : Math.max(1, spec.step);
    const brackets: Bracket[] = shapes.map(shape => ({
      shape,
      ok: null,
      miss: null,
      jump: first,
      done: false,
      used: 0,
    }));
    // The hard bounds: the box itself, or with `extend` everything from just above the last early stop
    // to MAX_LAST_STOP. The box still decides where the first guesses go.
    const hi = spec.extend ? Math.max(spec.lastHi, MAX_LAST_STOP) : spec.lastHi;
    const floorOf = (b: Bracket) =>
      Math.max(spec.extend ? 0 : spec.lastLo, (b.shape[b.shape.length - 1] ?? Math.floor(spec.currentTE)) + 1);
    for (const b of brackets) if (floorOf(b) > hi) b.done = true;

    const width = Math.max(1, Math.floor(spec.parallel ?? 1));
    /** `n` whole numbers spread evenly strictly between `lo` and `hi` (fewer when the gap is small). */
    const evenly = (lo: number, hi: number, n: number): number[] => {
      const out = new Set<number>();
      for (let j = 1; j <= n; j++) {
        const v = lo + Math.round((j * (hi - lo)) / (n + 1));
        if (v > lo && v < hi) out.add(v);
      }
      return [...out];
    };
    /** This round's guesses for one bracket, `k` of them; empty when the bracket is closed. With
     *  k = 1 exactly the single probe the search always made: halve, or gallop by a doubling jump. */
    const probesOf = (b: Bracket, k: number): number[] => {
      const floor = floorOf(b);
      if (b.ok === null && b.miss === null) {
        const boxFloor = Math.max(floor, Math.min(spec.lastLo, spec.lastHi));
        const t0 = Math.min(spec.lastHi, Math.max(boxFloor, startAt(boxFloor)));
        // The guess, plus the rest spread over the box (an extended search gallops out of it after).
        return k === 1 ? [t0] : [...new Set([t0, ...evenly(boxFloor - 1, spec.lastHi + 1, k - 1)])];
      }
      if (b.ok !== null && b.miss !== null) {
        if (b.miss - b.ok <= 1) return [];
        return k === 1 ? [Math.floor((b.ok + b.miss) / 2)] : evenly(b.ok, b.miss, k);
      }
      if (b.ok !== null) {
        if (b.ok >= hi) return [];
        const ok = b.ok;
        const pts = Array.from({ length: k }, (_, j) => Math.min(hi, ok + (j + 1) * b.jump));
        b.jump *= k + 1;
        return [...new Set(pts)];
      }
      const miss = b.miss as number;
      if (miss <= floor) return [];
      const pts = Array.from({ length: k }, (_, j) => Math.max(floor, miss - (j + 1) * b.jump));
      b.jump *= k + 1;
      return [...new Set(pts)];
    };

    for (let round = 0; round < 64; round++) {
      const live = brackets.filter(b => !b.done && probesOf({ ...b }, 1).length);
      for (const b of brackets) if (!b.done && !live.includes(b)) b.done = true;
      const k = Math.max(1, Math.min(16, Math.floor(width / Math.max(1, live.length))));
      const probes = new Map<Bracket, number[]>();
      for (const b of live) probes.set(b, probesOf(b, k));
      const open = probes.size;
      if (learn) {
        // Routes tried per set (cached ones too, so a carried-on run learns from its replay), and which
        // sets are finished: a set is finished once its last stop is narrowed down.
        for (const [b, ts] of probes) b.used += ts.length;
        const done = brackets.filter(b => b.done);
        learnNow = {
          sets: brackets.length,
          finishedSets: done.length,
          finishedRoutes: done.reduce((a, b) => a + b.used, 0),
          openRoutes: brackets.reduce((a, b) => a + (b.done ? 0 : b.used), 0),
        };
      }
      openNow = open;
      shapesNow = brackets.length;
      report();
      if (!open) return;
      await price([...probes.entries()].flatMap(([b, ts]) => ts.map(t => [...b.shape, t])));
      if (stoppedEarly) return;
      for (const [b, ts] of probes) {
        for (const t of ts) {
          const m = makes([...b.shape, t]);
          if (m) b.ok = Math.max(b.ok ?? -Infinity, t);
          else b.miss = Math.min(b.miss ?? Infinity, t);
        }
      }
    }
  }

  // Where to start a shape's bracket: the best last stop so far, which neighbouring shapes share --
  // or, before anything has made the deadline, halfway up what this shape could reach.
  const startAt = (floor: number) => (best ? best.chain[best.chain.length - 1] : Math.floor((floor + spec.lastHi) / 2));

  // ---- the player's own space: every combination in it, and nothing else
  const sets = spec.bandSets ?? (spec.bands?.length ? [spec.bands] : null);
  if (sets?.length) {
    const seen = new Set<string>();
    const list: number[][] = [];
    for (const set of sets) {
      for (const shape of set.length ? bandShapes(set, spec.currentTE, spec.lastHi) : [[]]) {
        const key = shape.join(',');
        if (!seen.has(key)) {
          seen.add(key);
          list.push(shape);
        }
      }
    }
    stage = `every route in your space: ${list.length.toLocaleString()} sets of early stops`;
    // A spread first, so the rest start their brackets next to the answer; same routes either way.
    await bracketAll(spread(list, 24), startAt);
    if (!stoppedEarly) await bracketAll(list, startAt, true);
    const routes = rank([...found.values()]);
    const byStops = new Map<number, DeadlineRoute>();
    for (const r of routes) if (!byStops.has(r.chain.length)) byStops.set(r.chain.length, r);
    stage = stoppedEarly ? 'stopped' : 'done';
    openNow = 0;
    report();
    return { routes, byStops, step: 0, shapes: list.length, priced, stoppedEarly };
  }

  const step = stepForBudget(spec);
  const byCount = new Map<number, number[][]>();
  for (let k = Math.max(1, spec.minStops); k <= spec.maxStops; k++) byCount.set(k, [...shapesFor(spec, step, k)]);

  // ---- 0. seed: the caller's own shapes (the account's current route) plus a spread from every
  // count, bracketed from mid-range, so the full pass starts every shape next to the answer
  // instead of walking up to it from the bottom.
  const valid = (shape: number[]) =>
    shape.length + 1 >= spec.minStops &&
    shape.length + 1 <= spec.maxStops &&
    shape.every((v, i) => v > (i ? shape[i - 1] : Math.floor(spec.currentTE)) && v < spec.lastHi);
  const own = (spec.seedShapes ?? []).filter(valid);
  const sample = [...own, ...spread([...byCount.values()].flat(), 24)];
  stage = `finding the rough answer on ${sample.length} spread-out routes`;
  await bracketAll(sample, startAt);

  // ---- 1. coarse pass
  let shapes = 0;
  for (const [k, list] of byCount) {
    if (stoppedEarly) break;
    shapes += list.length;
    stage = `coarse pass: ${k} stop${k === 1 ? '' : 's'}, ${list.length.toLocaleString()} shapes, every ${step} TE`;
    await bracketAll(list, startAt);
  }

  // ---- 2. pattern search: home in from the best few routes (and the best of each stop count),
  // moving one early stop at a time by half the grid, then a quarter, then 2, then 1 TE, keeping
  // every improvement. Fine resolution only where the coarse pass says the answer is.
  if (spec.refine !== false && !stoppedEarly && step > 1) {
    const resolutions = [...new Set([Math.floor(step / 2), Math.floor(step / 4), 2, 1])]
      .filter(r => r >= 1 && r < step)
      .sort((a, b) => b - a);
    const seen = new Set<string>();
    const topKey = () =>
      rank([...found.values()])
        .slice(0, spec.refineFrom ?? 5)
        .map(r => r.chain.join(','))
        .join('|');
    for (const r of resolutions) {
      for (let pass = 0; pass < 15 && !stoppedEarly; pass++) {
        const ranked = rank([...found.values()]);
        const starts = new Map<string, DeadlineRoute>();
        for (const x of ranked.slice(0, spec.refineFrom ?? 5)) starts.set(x.chain.join(','), x);
        const perCount = new Map<number, DeadlineRoute>();
        for (const x of ranked) if (!perCount.has(x.chain.length)) perCount.set(x.chain.length, x);
        for (const x of perCount.values()) starts.set(x.chain.join(','), x);

        const neighbours: number[][] = [];
        for (const x of starts.values()) {
          const shape = x.chain.slice(0, -1);
          for (let i = 0; i < shape.length; i++) {
            for (const d of [-r, r]) {
              const s = [...shape];
              s[i] += d;
              const lo = i === 0 ? Math.floor(spec.currentTE) + 1 : s[i - 1] + 1;
              const hi = i === s.length - 1 ? spec.lastHi - 1 : s[i + 1] - 1;
              if (s[i] < lo || s[i] > hi) continue;
              const key = s.join(',');
              if (seen.has(key)) continue;
              seen.add(key);
              neighbours.push(s);
            }
          }
        }
        if (!neighbours.length) break;
        const before = topKey();
        stage = `homing in, ${r} TE at a time: ${neighbours.length} nearby routes`;
        shapes += neighbours.length;
        await bracketAll(neighbours, startAt);
        if (topKey() === before) break;
      }
    }
  }

  const routes = rank([...found.values()]);
  const byStops = new Map<number, DeadlineRoute>();
  for (const r of routes) if (!byStops.has(r.chain.length)) byStops.set(r.chain.length, r);
  stage = stoppedEarly ? 'stopped' : 'done';
  openNow = 0;
  shapesNow = shapes;
  report();
  return { routes, byStops, step, shapes, priced, stoppedEarly };
}

/**
 * Best first: highest last stop, then most time to spare. Only each shape's best last stop is kept
 * -- a shape that makes 248 also "makes" 240, and listing both would bury the answer in its own
 * lesser variants.
 */
export function rank(routes: DeadlineRoute[]): DeadlineRoute[] {
  const perShape = new Map<string, DeadlineRoute>();
  for (const r of routes) {
    const key = r.chain.slice(0, -1).join(',');
    const prior = perShape.get(key);
    const t = r.chain[r.chain.length - 1];
    if (
      !prior ||
      t > prior.chain[prior.chain.length - 1] ||
      (t === prior.chain[prior.chain.length - 1] && r.spare > prior.spare)
    ) {
      perShape.set(key, r);
    }
  }
  return [...perShape.values()].sort((a, b) => {
    const d = b.chain[b.chain.length - 1] - a.chain[a.chain.length - 1];
    return d || b.spare - a.spare;
  });
}
