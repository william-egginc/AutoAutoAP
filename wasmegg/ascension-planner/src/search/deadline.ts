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
  /** The fine pass around the best routes. On unless false. */
  refine?: boolean;
  /** Routes the fine pass starts from. */
  refineFrom?: number;
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

/** Shapes the coarse pass would try at this step: sum over stop counts of C(values, stops - 1). */
export function countShapes(
  spec: Pick<DeadlineSpec, 'currentTE' | 'lastHi' | 'minStops' | 'maxStops'>,
  step: number
): number {
  const n = gridValues(spec.currentTE, spec.lastHi, step).length;
  let total = 0;
  for (let k = Math.max(1, spec.minStops); k <= spec.maxStops; k++) total += choose(n, k - 1);
  return total;
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
  const report = () => cb.onProgress?.({ stage, priced, best, open: openNow, shapes: shapesNow });

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
  async function bracketAll(shapes: number[][], startAt: (floor: number) => number): Promise<void> {
    const first = Math.max(1, spec.step);
    const brackets: Bracket[] = shapes.map(shape => ({ shape, ok: null, miss: null, jump: first, done: false }));
    const floorOf = (b: Bracket) =>
      Math.max(spec.lastLo, (b.shape[b.shape.length - 1] ?? Math.floor(spec.currentTE)) + 1);
    for (const b of brackets) if (floorOf(b) > spec.lastHi) b.done = true;

    for (let round = 0; round < 64; round++) {
      const probes = new Map<Bracket, number>();
      for (const b of brackets) {
        if (b.done) continue;
        const floor = floorOf(b);
        let t: number;
        if (b.ok === null && b.miss === null) t = Math.min(spec.lastHi, Math.max(floor, startAt(floor)));
        else if (b.ok !== null && b.miss !== null) {
          if (b.miss - b.ok <= 1) {
            b.done = true;
            continue;
          }
          t = Math.floor((b.ok + b.miss) / 2);
        } else if (b.ok !== null) {
          if (b.ok >= spec.lastHi) {
            b.done = true;
            continue;
          }
          t = Math.min(spec.lastHi, b.ok + b.jump);
          b.jump *= 2;
        } else {
          if ((b.miss as number) <= floor) {
            b.done = true;
            continue;
          }
          t = Math.max(floor, (b.miss as number) - b.jump);
          b.jump *= 2;
        }
        probes.set(b, t);
      }
      const open = probes.size;
      openNow = open;
      shapesNow = brackets.length;
      report();
      if (!open) return;
      await price([...probes.entries()].map(([b, t]) => [...b.shape, t]));
      if (stoppedEarly) return;
      for (const [b, t] of probes) {
        const m = makes([...b.shape, t]);
        if (m) b.ok = Math.max(b.ok ?? -Infinity, t);
        else b.miss = Math.min(b.miss ?? Infinity, t);
      }
    }
  }

  // Where to start a shape's bracket: the best last stop so far, which neighbouring shapes share --
  // or, before anything has made the deadline, halfway up what this shape could reach.
  const startAt = (floor: number) => (best ? best.chain[best.chain.length - 1] : Math.floor((floor + spec.lastHi) / 2));

  const step = stepForBudget(spec);
  const values = gridValues(spec.currentTE, spec.lastHi, step);
  const byCount = new Map<number, number[][]>();
  for (let k = Math.max(1, spec.minStops); k <= spec.maxStops; k++) byCount.set(k, [...combinations(values, k - 1)]);

  // ---- 0. seed: a spread of shapes from every count, bracketed from mid-range, so the full pass
  // starts every shape next to the answer instead of walking up to it from the bottom.
  const sample = spread([...byCount.values()].flat(), 24);
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
  cb.onProgress?.({ stage: stoppedEarly ? 'stopped' : 'done', priced, best, open: 0, shapes });
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
