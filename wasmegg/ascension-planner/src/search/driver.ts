/**
 * The search itself — a port of the staged recipe in scripts/autoplan.py.
 *
 * READ THIS BEFORE CHANGING ANY OF IT. Every stage here exists because a simpler version of it was
 * measured losing time, and the comments record which:
 *
 *  - `resolveLast` re-solves the LAST checkpoint. It must not re-centre on the window edge: an
 *    earlier version returned the edge winner and recursed on it, so the window WALKED upward until
 *    it was sweeping 450-473 against a final of 490. The centre stays put; the window only widens,
 *    symmetrically, capped, and bounded above by `maxLast` (default final-150, because a tiny final
 *    leg pays a full rebuild for almost no earning time).
 *
 *  - `descent` re-solves the last checkpoint after EVERY accepted move. Moving any earlier
 *    checkpoint shifts every later arrival time, which shifts which weekly sale boundary the final
 *    build lands on. Skipping this cost 2.3 days on one measured test.
 *
 *  - `slices` exists because coordinate descent is not exact: on a measured case it ranked 4th of
 *    441 and lost 0.371 d to a joint (X2,X3) optimum no single-axis sweep can see. Its loop bound is
 *    `len - 2`, not `len - 3` — the older bound never swept the LAST adjacent pair, which is both
 *    the cheapest pair (longest shared prefix) and a pair `resolveLast` alone cannot move jointly.
 *
 *  - `countProbe` exists because the checkpoint COUNT is otherwise settled on a coarse grid and
 *    never revisited. Measured: a coarse scan ranked 7 checkpoints ahead of 6 by 2.675 d, and
 *    deleting one checkpoint from the polished 7-chain gave 195 219 248 286 327 490 — later
 *    confirmed rank 1 of a 4913-chain exhaustive. That one spurious checkpoint was the entire
 *    measured loss of that run.
 *
 *  - `otherCounts` (Fast only) exists because Fast has no count probe, and a Fast run kept at the
 *    seed's 4 ascensions finished ~4 days behind a 5-7 ascension route (row 57db9894, 10 Oct). It
 *    gives each other count one descent pass from the instant answer's route at that count (else a
 *    drop/insert of the best route), walks outward while the edge count keeps winning, and polishes
 *    the winner in full. Inside the limits only.
 *
 * And one thing this file deliberately does NOT do: prune by prefix cost. A prefix that arrives
 * later can arrive with a higher delivery rate and win overall. Dropping candidates on early-leg
 * time is not safe.
 *
 * Everything is driven through `evaluateBatch`, so the driver knows nothing about workers. That is
 * what lets the same code be unit-tested against an inline evaluator.
 */
import { EFFORT, estimateChains } from './effort';
import type { ChainKey, ChainResult, EffortTier, LegSummary, SearchProgress } from './types';

/** Duration comparisons are in seconds; this is autoplan.py's `1e-9` days in the same units,
 *  rounded up. Far below any real difference between two chains (the smallest meaningful gap is
 *  minutes) and far above float noise. */
const EPS_SECONDS = 1e-4;

/**
 * Fast's stage 4c skips the descent pass at a count whose start, once its last checkpoint is solved,
 * is more than this behind the best route so far: two days, twice the instant answer's own error (it
 * can be off by about a day). One pass moves a route hours, rarely days, so a count that far behind
 * would not catch up, and the pass is most of the stage's cost (about 42 chains per checkpoint).
 */
const OTHER_COUNT_CUTOFF_SECONDS = 2 * 86400;

export interface EvaluateBatch {
  (chains: number[][]): Promise<{ results: ChainResult[]; legSims: number; workersUsed: number }>;
}

export interface DriverOptions {
  /** Where the search starts. Normally the user's own chain, or a seed from a previous run. */
  seedChain: number[];
  final: number;
  currentTE: number;
  effort: EffortTier;
  /** Upper bound for the last checkpoint. Defaults to `final - 150`. */
  maxLast?: number;
  /** Hold the first N checkpoints fixed. Moving X1 re-simulates every downstream leg, and X1 is
   *  usually the best-validated value, so pinning it is often the right trade. */
  pin?: number;
  /** Allowed checkpoint counts (chain length, final included), from the count probe's point of
   *  view. Defaults to "one either side of the seed". */
  minCheckpoints?: number;
  maxCheckpoints?: number;
  /** Starting routes at other ascension counts for Fast's stage 4c (`otherCounts`): the instant
   *  answer's route for each count it lists, fastest first. Each must end at `final`; the first route
   *  per count is used, and counts outside the limits are ignored. */
  countSeeds?: readonly (readonly number[])[];
  evaluateBatch: EvaluateBatch;
  /** Called after every batch and at every stage boundary. */
  onProgress?: (progress: SearchProgress) => void;
  /** Called after every batch with the full cache, for checkpointing to IndexedDB. */
  onCache?: (entries: CacheEntry[]) => void;
  /** Checked between batches. Returning true ends the run cleanly and returns the best so far —
   *  which, because the stages are nested, is always a usable answer. */
  shouldStop?: () => boolean;
  /** Cache entries restored from a previous run, so a refresh replays instead of re-simulating. */
  restoredCache?: CacheEntry[];
}

export interface CacheEntry {
  key: ChainKey;
  seconds: number;
  legs: LegSummary[];
}

export interface SearchOutcome {
  chain: number[];
  seconds: number;
  legs: LegSummary[];
  /** True when `shouldStop` ended the run before the tier's last stage finished. The answer is
   *  still the best found, and still whatever the completed stages guarantee. */
  stoppedEarly: boolean;
  /** The last stage that actually ran to completion — what the answer is backed by. */
  lastCompletedStage: string;
  chainsEvaluated: number;
  legSims: number;
  /** Ascension counts (chain lengths) the run searched from, in the order it started each: the seed's
   *  first. One entry unless stage 4c (Fast) or the count probe (Exact, Very high) moved it. */
  countsProbed: number[];
}

/**
 * A starting route usable at its own count: strictly increasing, above the current TE, ending at
 * `final`. Null otherwise.
 */
function usableRoute(route: readonly number[], final: number, currentTE: number): number[] | null {
  if (route.length < 2 || route[route.length - 1] !== final || route[0] <= currentTE) return null;
  for (let i = 1; i < route.length; i++) if (!(route[i] > route[i - 1])) return null;
  return [...route];
}

/**
 * The other ascension counts Fast's stage 4c will check before any walking: every count inside the
 * limits that `seeds` has a route for, and one either side of the seed's, never the seed's own and
 * never below 2 (one ascension has no checkpoint to move). Sorted. Shared with the store so the
 * estimate shown before Find counts the same probes the run makes.
 */
export function plannedCountChecks(o: {
  seedLen: number;
  minLen: number;
  maxLen: number;
  final: number;
  currentTE: number;
  seeds?: readonly (readonly number[])[];
}): number[] {
  const lo = Math.max(2, o.minLen);
  const out = new Set<number>();
  for (const r of o.seeds ?? []) {
    const c = usableRoute(r, o.final, o.currentTE);
    if (c) out.add(c.length);
  }
  out.add(o.seedLen - 1);
  out.add(o.seedLen + 1);
  return [...out].filter(n => n !== o.seedLen && n >= lo && n <= o.maxLen).sort((a, b) => a - b);
}

/**
 * The chain cache, and the batching layer between the driver and the workers.
 *
 * Mirrors autoplan.py's `Sim` class: `run(groups)` takes one value-list per checkpoint, forms the
 * Cartesian product, drops anything that is not strictly increasing, and evaluates only what is not
 * already known. Every stage below builds its sweep as one `run` call so the whole sweep goes to the
 * pool as a single batch — which is what lets the batch be split on prefix subtrees and keeps prefix
 * sharing intact (see search/batch.ts).
 */
class ChainCache {
  private readonly seconds = new Map<ChainKey, number>();
  private readonly legs = new Map<ChainKey, LegSummary[]>();
  chainsEvaluated = 0;
  legSims = 0;
  /** Wall seconds spent inside `evaluateBatch`, for the live time estimate. */
  wallSeconds = 0;
  lastWorkersUsed = 0;

  constructor(
    private readonly final: number,
    private readonly currentTE: number,
    private readonly evaluateBatch: EvaluateBatch
  ) {}

  restore(entries: CacheEntry[]): void {
    for (const e of entries) {
      this.seconds.set(e.key, e.seconds);
      this.legs.set(e.key, e.legs);
    }
  }

  entries(): CacheEntry[] {
    return [...this.seconds.entries()].map(([key, s]) => ({ key, seconds: s, legs: this.legs.get(key) ?? [] }));
  }

  get(chain: number[]): number | undefined {
    return this.seconds.get(chain.join(','));
  }

  legsOf(chain: number[]): LegSummary[] {
    return this.legs.get(chain.join(',')) ?? [];
  }

  /** `groups`: one value-list per checkpoint BEFORE the final target. `extra`: whole chains to
   *  price in the same batch (the seed, on the first sweep: see `runChainSearch`). */
  async run(groups: number[][], extra: number[][] = []): Promise<void> {
    const want: number[][] = [];
    const walk = (i: number, acc: number[]): void => {
      if (i === groups.length) {
        want.push([...acc, this.final]);
        return;
      }
      for (const v of groups[i]) {
        // Strictly increasing, and above the player's current TE — the same filter fastsearch.ts
        // applies before it evaluates anything. A checkpoint at or below the current TE is not a
        // checkpoint, it is already behind you.
        if (acc.length ? v > acc[acc.length - 1] : v > this.currentTE) walk(i + 1, [...acc, v]);
      }
    };
    walk(0, []);
    const keys = new Set(want.map(c => c.join(',')));
    for (const c of extra) if (!keys.has(c.join(','))) want.push([...c]);

    await this.price(want);
  }

  /** Price exactly these chains (any lengths), skipping the known ones: no product is formed. */
  async runChains(chains: number[][]): Promise<void> {
    const seen = new Set<string>();
    await this.price(
      chains.filter(c => {
        const k = c.join(',');
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
    );
  }

  private async price(want: number[][]): Promise<void> {
    const todo = want.filter(c => !this.seconds.has(c.join(',')));
    if (!todo.length) return;

    const t0 = Date.now();
    const { results, legSims, workersUsed } = await this.evaluateBatch(todo);
    this.wallSeconds += (Date.now() - t0) / 1000;
    this.legSims += legSims;
    this.lastWorkersUsed = workersUsed;
    this.chainsEvaluated += todo.length;

    for (const r of results) {
      const key = r.chain.join(',');
      this.seconds.set(key, r.seconds);
      this.legs.set(key, r.legs);
    }
    // Chains that failed to simulate are deliberately NOT cached as "known bad": re-asking for one
    // is cheap relative to getting the bookkeeping wrong, and a failure is a property of the
    // simulator's state, not of the chain. This matches autoplan.py, where a missing CSV row simply
    // stays missing.
  }

  /** Evaluate one chain if unknown, then return its duration in seconds. */
  async need(chain: number[]): Promise<number | undefined> {
    if (!this.seconds.has(chain.join(','))) {
      await this.run(chain.slice(0, -1).map(v => [v]));
    }
    return this.get(chain);
  }

  /** Best chain seen ANYWHERE this run within a checkpoint-count range. Every stored value is a
   *  full duration to the same `final` from the same plan start, so they are all comparable — which
   *  doubles as a guard against a stage that regressed. */
  bestSeen(minLen: number, maxLen: number): { chain: number[]; seconds: number } | null {
    let best: { chain: number[]; seconds: number } | null = null;
    for (const [key, s] of this.seconds) {
      const chain = key.split(',').map(Number);
      if (chain.length < minLen || chain.length > maxLen) continue;
      if (!best || s < best.seconds - EPS_SECONDS) best = { chain, seconds: s };
    }
    return best;
  }
}

export async function runChainSearch(opts: DriverOptions): Promise<SearchOutcome> {
  const cfg = EFFORT[opts.effort];
  const final = opts.final;
  const maxLast = opts.maxLast ?? final - 150;
  const pin = opts.pin ?? 0;
  const cache = new ChainCache(final, opts.currentTE, opts.evaluateBatch);
  if (opts.restoredCache?.length) cache.restore(opts.restoredCache);

  let cur = [...opts.seedChain];
  if (cur[cur.length - 1] !== final) cur = [...cur, final];

  const seedLen = cur.length;
  const minLen = opts.minCheckpoints ?? Math.max(2, cur.length - 1);
  const maxLen = opts.maxCheckpoints ?? cur.length + 1;
  const countSeeds = opts.countSeeds ?? [];
  const chainsEstimated = estimateChains(
    cur.length - 1,
    cfg,
    cfg.otherCounts
      ? plannedCountChecks({ seedLen, minLen, maxLen, final, currentTE: opts.currentTE, seeds: countSeeds })
      : []
  );
  /** Counts searched from, in order (SearchOutcome `countsProbed`). */
  const countsProbed: number[] = [seedLen];
  const probedCount = (len: number) => {
    if (!countsProbed.includes(len)) countsProbed.push(len);
  };

  let stage = 'starting';
  let lastCompletedStage = 'none';
  let stopped = false;
  /**
   * The seed is NOT priced on its own first. It used to be (`cache.need(cur)` here): one chain, on
   * one worker, while every other worker sat idle, and the first time estimate was that one serial
   * chain (worker start-up included) taken as the rate for the whole run. On the 9 Oct report (a
   * 7-ascension instant route, 7 workers) the bar sat at "1 of ~606 chains · about 57 min left" for
   * the seed plus the whole first sweep, and the run took 4 min. The seed rides in the last
   * checkpoint's first sweep instead (`resolveLast`'s `extra`), which it is nearly always part of
   * anyway, so it costs nothing extra and the sweep starts at once on every worker.
   */
  let best = cache.get(cur) ?? Infinity;
  /** Best seen anywhere, which is what the UI shows and what a stop returns. A stage can regress;
   *  this cannot. */
  let ever = { chain: [...cur], seconds: best };

  /**
   * Fold in the best chain priced anywhere so far. `note` runs at the end of each step, so a stop in
   * the middle of one returned the best as of the step before, while a faster chain the step had
   * already priced sat in the cache: a stopped run reported 895.745 d with 893.752 d priced, and the
   * runners-up table (built from the cache) led with the faster one. Within the counts the run may
   * use, and the seed's own, the same set every stage draws from.
   */
  function noteBestSeen(): void {
    const seen = cache.bestSeen(Math.min(minLen, seedLen), Math.max(maxLen, seedLen));
    if (seen) note(seen.chain, seen.seconds);
  }

  function report(detail: string): void {
    noteBestSeen();
    opts.onProgress?.({
      stage,
      detail,
      chainsDone: cache.chainsEvaluated,
      chainsEstimated,
      bestChain: [...ever.chain],
      // 0 while nothing is priced yet (the seed is priced in the first sweep): the store's "not
      // priced" value, never Infinity on the screen.
      bestDays: Number.isFinite(ever.seconds) ? ever.seconds / 86400 : 0,
      bestLegs: cache.legsOf(ever.chain),
      countsProbed: [...countsProbed],
    });
    opts.onCache?.(cache.entries());
  }

  function note(chain: number[], seconds: number | undefined): void {
    if (seconds === undefined) return;
    if (seconds < ever.seconds - EPS_SECONDS) ever = { chain: [...chain], seconds };
  }

  function stopRequested(): boolean {
    if (opts.shouldStop?.()) {
      stopped = true;
      return true;
    }
    return false;
  }

  const days = (s: number) => (s / 86400).toFixed(3);

  /**
   * Sweep the last checkpoint at step 1.
   *
   * The optimum is always a run-end: a leg's build phase ends on a Research Sale END (Saturday 09:00
   * Pacific, DST-exact), so sweeping the last checkpoint gives descending runs of 3-5 separated by
   * ~+3.15 d jumps. Verified 462/462 over the fully swept prefixes of the 490 box (SAWTOOTH_STATS in
   * lib/charts/chainSearchMath.ts says how). This still sweeps every value in the window
   * rather than only run-ends — the prune is safe but the saving is small next to the risk of
   * mis-detecting a run boundary from a sparse window.
   */
  async function resolveLast(chain: number[], extra: number[][] = []): Promise<number[]> {
    const ch = [...chain];
    if (ch.length < 2) return ch;
    // autoplan.py indexes `ch[-3]` here and so requires at least three entries. The floor it wants
    // is "whatever the previous checkpoint is"; for a two-entry chain there is no previous
    // checkpoint and the player's current TE is the real floor. One above either: that is what
    // descent allows (`cur[j - 1] + 1`) and what a two-entry chain already used here. This was +2,
    // which left the value one above the previous checkpoint unreachable for the last one only.
    const floor = ch.length >= 3 ? ch[ch.length - 3] + 1 : opts.currentTE + 1;
    const top = Math.min(maxLast, final - 2);
    if (top < floor) return ch;

    // CLAMP THE CENTRE INTO THE LEGAL RANGE. The incoming value can sit outside [floor, top]
    // because nothing that produces it is bound by `maxLast` -- the coarse scan sweeps a fixed
    // grid (185..390) and hands back whatever won on it. Centring on an out-of-range value made
    // `lo` exceed `hi` and the whole sweep returned unchanged, silently: with final=490 the cap is
    // 340, the coarse scan proposed 360, and `lo = max(287, 348) = 348 > hi = min(340, 372) = 340`.
    //
    // That disabled this function for the ENTIRE run -- including the re-solve after every
    // accepted descent move -- so the last checkpoint was only ever moved by descent's +-8 and the
    // 3-D slices' +-6, drifting 360 to 359. Measured cost on a real 9795-chain `thorough` run:
    // it settled at 742.378 d while 741.500 d sat at A6=328, thirty-one below and well inside the
    // window this sweep was meant to cover. Clamping starts the sweep at the edge of the legal
    // range, from which the widening rule can walk down to it.
    const centre = Math.min(Math.max(ch[ch.length - 2], floor), top);
    let span = 12;
    let tried = 0;

    for (;;) {
      const lo = Math.max(floor, centre - span);
      const hi = Math.min(top, centre + span);
      if (hi < lo) return ch;

      const window: number[] = [];
      for (let v = lo; v <= hi; v++) window.push(v);
      // `extra` (the unpriced seed) goes with the first sweep only.
      await cache.run([...ch.slice(0, -2).map(v => [v]), window], tried ? [] : extra);
      tried = window.length;
      if (stopRequested()) return ch;

      let bestSeconds = Infinity;
      let bestValue = -1;
      for (const v of window) {
        const cand = [...ch.slice(0, -2), v, final];
        const d = cache.get(cand);
        if (d === undefined) continue;
        note(cand, d);
        if (d < bestSeconds) {
          bestSeconds = d;
          bestValue = v;
        }
      }
      if (bestValue < 0) return ch;

      // Widen ONLY while the winner is pinned to an edge we can still move. The centre never moves,
      // which is the whole fix for the runaway window described at the top of this file.
      const pinned = (bestValue === lo && lo > floor) || (bestValue === hi && hi < top);
      if (!pinned || span >= 36) return [...ch.slice(0, -2), bestValue, final];
      // Widening: say so, so the count and the log move between the sweeps (the bar used to sit on
      // one number through all three).
      report(`last stop ${lo}-${hi} tried, best at ${bestValue}: widening`);
      span += 12;
    }
  }

  /** Stage 4: coordinate descent, step 1, one checkpoint at a time. */
  async function descent(passes: number, label: string): Promise<void> {
    stage = label;
    // Before the first axis's sweep, so the stage line changes when the work does (it said "solving
    // the last checkpoint" through the first axis and its re-solve).
    report(`from ${days(best)} d  ${cur.join(' ')}`);
    for (let p = 0; p < passes; p++) {
      let moved = false;
      // The LAST checkpoint is excluded here on purpose — `resolveLast` owns it.
      for (let j = pin; j < cur.length - 2; j++) {
        let axisMoved = false;
        const lo = (j ? cur[j - 1] : 0) + 1;
        const hi = cur[j + 1] - 1;
        const vals: number[] = [];
        for (let v = cur[j] - cfg.radius; v <= cur[j] + cfg.radius; v++) if (v >= lo && v <= hi) vals.push(v);
        if (!vals.length) continue;

        await cache.run([...cur.slice(0, j).map(v => [v]), vals, ...cur.slice(j + 1, -1).map(v => [v])]);
        if (stopRequested()) return;

        for (const v of vals) {
          const cand = [...cur.slice(0, j), v, ...cur.slice(j + 1)];
          const d = cache.get(cand);
          if (d === undefined) continue;
          note(cand, d);
          if (d < best - EPS_SECONDS) {
            best = d;
            cur = cand;
            moved = true;
            axisMoved = true;
          }
        }

        if (axisMoved) {
          cur = await resolveLast(cur);
          if (stopRequested()) return;
          best = (await cache.need(cur)) ?? best;
          note(cur, best);
        }
        report(`pass ${p + 1}, stop ${j + 1}: ${days(best)} d  ${cur.join(' ')}`);
      }
      report(`pass ${p + 1}: ${days(best)} d  ${cur.join(' ')}`);
      if (!moved) break;
    }
  }

  /** Stage 5: exhaustive step-1 2-D slices over adjacent checkpoint pairs. */
  async function slices(): Promise<void> {
    stage = 'stage 5: exhaustive 2-D slices';
    for (let j = pin; j < cur.length - 2; j++) {
      // When b IS the last checkpoint, `cur[j+2]` is `final` and is the wrong bound — `resolveLast`
      // caps the last checkpoint at `maxLast` for a real reason.
      const hiB = j + 2 === cur.length - 1 ? Math.min(maxLast, final - 2) : cur[j + 2] - 1;
      const a: number[] = [];
      for (let v = cur[j] - cfg.radius; v <= cur[j] + cfg.radius; v++) {
        if (v > (j ? cur[j - 1] : 0) && v < cur[j + 1] + cfg.radius) a.push(v);
      }
      const b: number[] = [];
      for (let v = cur[j + 1] - cfg.radius; v <= cur[j + 1] + cfg.radius; v++) if (v <= hiB) b.push(v);
      if (!a.length || !b.length) continue;

      await cache.run([...cur.slice(0, j).map(v => [v]), a, b, ...cur.slice(j + 2, -1).map(v => [v])]);
      if (stopRequested()) return;

      for (const va of a) {
        for (const vb of b) {
          if (va >= vb) continue;
          const cand = [...cur.slice(0, j), va, vb, ...cur.slice(j + 2)];
          const d = cache.get(cand);
          if (d === undefined) continue;
          note(cand, d);
          if (d < best - EPS_SECONDS) {
            best = d;
            cur = cand;
          }
        }
      }

      cur = await resolveLast(cur);
      if (stopRequested()) return;
      best = (await cache.need(cur)) ?? best;
      note(cur, best);
      report(`pair ${j + 1}-${j + 2}: ${days(best)} d  ${cur.join(' ')}`);
    }
  }

  /** Stage 6: exhaustive 3-D slices over adjacent triples. Last triple first — that is where it bit
   *  on the one account where it ever moved anything (1.665 d / 40 h). */
  async function slices3(): Promise<void> {
    stage = 'stage 6: exhaustive 3-D slices';
    for (let j = cur.length - 4; j >= pin; j--) {
      // The triple's last member is the final checkpoint when `j + 3` is `final`'s index. Then its
      // ceiling is `maxLast` (as in `slices`), not `final - 1`, and the last checkpoint is re-solved
      // afterwards like every other stage that moves it.
      const lastInTriple = j + 3 === cur.length - 1;
      const hi = lastInTriple ? Math.min(maxLast, final - 2) : cur[j + 3] - 1;
      const rng: number[][] = [];
      for (let k = 0; k < 3; k++) {
        // The floor is the checkpoint BEFORE the triple for its first member. A later member only
        // has to beat the one before it, which is itself being varied, so the floor is that range's
        // lowest value (the loop below rejects anything not increasing). It used to be the OLD value
        // of the previous checkpoint, which ruled out the very moves this stage exists to find.
        const lo = k === 0 ? (j ? cur[j - 1] : opts.currentTE) + 1 : rng[k - 1].length ? rng[k - 1][0] + 1 : Infinity;
        const vals: number[] = [];
        for (let v = cur[j + k] - cfg.radius3; v <= cur[j + k] + cfg.radius3; v++) if (v >= lo && v <= hi) vals.push(v);
        rng.push(vals);
      }
      if (rng.some(r => !r.length)) continue;

      await cache.run([...cur.slice(0, j).map(v => [v]), ...rng, ...cur.slice(j + 3, -1).map(v => [v])]);
      if (stopRequested()) return;

      for (const va of rng[0]) {
        for (const vb of rng[1]) {
          for (const vc of rng[2]) {
            if (!(va < vb && vb < vc)) continue;
            const cand = [...cur.slice(0, j), va, vb, vc, ...cur.slice(j + 3)];
            const d = cache.get(cand);
            if (d === undefined) continue;
            note(cand, d);
            if (d < best - EPS_SECONDS) {
              best = d;
              cur = cand;
            }
          }
        }
      }
      cur = await resolveLast(cur);
      if (stopRequested()) return;
      best = (await cache.need(cur)) ?? best;
      note(cur, best);
      report(`triple ${j + 1}-${j + 2}-${j + 3}: ${days(best)} d  ${cur.join(' ')}`);
    }
  }

  /** Stage 7: prestige-count probe — drop one checkpoint, or insert one, then re-polish. */
  async function countProbe(round: number): Promise<void> {
    stage = round ? `stage 7: prestige-count probe (round ${round + 1})` : 'stage 7: prestige-count probe';
    const cands: number[][] = [];

    for (let i = pin; i < cur.length - 1; i++) {
      if (cur.length - 1 >= 2) cands.push([...cur.slice(0, i), ...cur.slice(i + 1)]);
    }
    let prev = opts.currentTE;
    for (let i = pin; i < cur.length; i++) {
      // `i === cur.length - 1` is the gap between the last checkpoint and `final` — the "is one more
      // prestige up there worth it" question. Its midpoint is far above anything sensible
      // (327..490 -> 408 against a maxLast of 340), so it is capped.
      const m = Math.min(Math.floor((prev + cur[i]) / 2), maxLast);
      if (prev < m && m < cur[i]) cands.push([...cur.slice(0, i), m, ...cur.slice(i)]);
      prev = cur[i];
    }

    const allowed = cands.filter(c => c.length >= minLen && c.length <= maxLen);
    if (!allowed.length) {
      report(`nothing to probe within ${minLen}-${maxLen} stops`);
      return;
    }

    // `cache.run` re-crosses per-axis value sets, so every chain in one call must be the same
    // length. Group by length; the product is a superset of the candidates, and the extras are legal
    // neighbouring chains that cost little and sometimes win.
    const byLen = new Map<number, number[][]>();
    for (const c of allowed) {
      const g = byLen.get(c.length);
      if (g) g.push(c);
      else byLen.set(c.length, [c]);
    }
    for (const [len, grp] of [...byLen.entries()].sort((x, y) => x[0] - y[0])) {
      const groups: number[][] = [];
      for (let i = 0; i < len - 1; i++) groups.push([...new Set(grp.map(c => c[i]))].sort((p, q) => p - q));
      await cache.run(groups);
      if (stopRequested()) return;
      report(`probed ${len}-checkpoint candidates`);
    }

    const win = cache.bestSeen(minLen, maxLen);
    if (!win || win.chain.join(',') === cur.join(',')) {
      report(`no change: ${cur.length} stops confirmed at ${days(best)} d`);
      return;
    }

    cur = win.chain;
    best = win.seconds;
    probedCount(cur.length);
    note(cur, best);
    report(`${days(best)} d  ${cur.join(' ')}`);

    // A dropped/inserted chain inherits a neighbourhood tuned for a different checkpoint count, so
    // it is never accepted raw.
    cur = await resolveLast(cur);
    if (stopRequested()) return;
    best = (await cache.need(cur)) ?? best;
    note(cur, best);
    await descent(3, 'stage 7b: re-polishing the new count');
  }

  /**
   * A start at `len` ascensions built from a route already searched one count away: every way of
   * dropping one checkpoint from the longer neighbour, or inserting one (a gap's midpoint, as the
   * count probe does) into the shorter, priced as exact chains, and the fastest kept. Respects `pin`.
   */
  async function neighbourStart(
    len: number,
    results: Map<number, { chain: number[]; seconds: number }>
  ): Promise<number[] | null> {
    const cands: number[][] = [];
    const longer = results.get(len + 1);
    if (longer) {
      const c = longer.chain;
      for (let i = pin; i < c.length - 1; i++) cands.push([...c.slice(0, i), ...c.slice(i + 1)]);
    }
    const shorter = results.get(len - 1);
    if (shorter) {
      const c = shorter.chain;
      let prev = opts.currentTE;
      for (let i = pin; i < c.length; i++) {
        if (i > 0) prev = c[i - 1];
        const m = Math.min(Math.floor((prev + c[i]) / 2), maxLast);
        if (prev < m && m < c[i]) cands.push([...c.slice(0, i), m, ...c.slice(i)]);
      }
    }
    const legal = cands.filter(c => c.length === len && usableRoute(c, final, opts.currentTE));
    if (!legal.length) return null;
    await cache.runChains(legal);
    let pick: number[] | null = null;
    let pickSeconds = Infinity;
    for (const c of legal) {
      const d = cache.get(c);
      if (d === undefined) continue;
      note(c, d);
      if (d < pickSeconds) {
        pick = c;
        pickSeconds = d;
      }
    }
    return pick;
  }

  /** One descent pass from `start` (after its last checkpoint is solved), leaving `cur`/`best` as
   *  they were. Returns the route it reached and its time, or null when nothing could be priced. The
   *  pass is skipped when the solved start is more than `OTHER_COUNT_CUTOFF_SECONDS` behind `leader`. */
  async function onePass(
    start: number[],
    label: string,
    leader: number
  ): Promise<{ chain: number[]; seconds: number } | null> {
    const keep = { cur, best };
    try {
      cur = await resolveLast(start, cache.get(start) === undefined ? [start] : []);
      if (stopRequested()) return null;
      const d = await cache.need(cur);
      if (d === undefined) return null;
      best = d;
      note(cur, best);
      if (best > leader + OTHER_COUNT_CUTOFF_SECONDS) {
        report(`${cur.length} ascensions: ${days(best)} d after the last stop, too far behind for a pass`);
        return { chain: [...cur], seconds: best };
      }
      await descent(1, label);
      return { chain: [...cur], seconds: best };
    } finally {
      cur = keep.cur;
      best = keep.best;
    }
  }

  /** Stage 4c (Fast): the other ascension counts. See the note at the top of this file. */
  async function otherCounts(): Promise<void> {
    const lo = Math.max(2, minLen);
    const inRange = (len: number) => len >= lo && len <= maxLen;
    const results = new Map<number, { chain: number[]; seconds: number }>();
    const tried = new Set<number>([cur.length]);
    if (Number.isFinite(best)) results.set(cur.length, { chain: [...cur], seconds: best });

    const seeds = new Map<number, number[]>();
    for (const r of countSeeds) {
      const c = usableRoute(r, final, opts.currentTE);
      if (!c || !inRange(c.length) || seeds.has(c.length)) continue;
      // Pinned checkpoints stay pinned: a route that moves them is not this search's to start from.
      if (pin && c.slice(0, pin).join(',') !== cur.slice(0, pin).join(',')) continue;
      seeds.set(c.length, c);
    }

    let queue = plannedCountChecks({
      seedLen: cur.length,
      minLen,
      maxLen,
      final,
      currentTE: opts.currentTE,
      seeds: [...seeds.values()],
    });
    stage = 'stage 4c: other ascension counts';
    report(
      queue.length ? `checking ${queue.join(', ')} ascensions` : `no other count within ${lo}-${maxLen} ascensions`
    );
    while (queue.length) {
      for (const len of queue) {
        if (tried.has(len)) continue;
        tried.add(len);
        const start = seeds.get(len) ?? (await neighbourStart(len, results));
        if (stopRequested()) return;
        if (!start) continue;
        probedCount(len);
        const leader = Math.min(best, ...[...results.values()].map(r => r.seconds));
        const got = await onePass(start, `stage 4c: one pass at ${len} ascensions`, leader);
        if (stopRequested()) return;
        if (got) results.set(len, got);
      }
      // Walk outward from the winner while a neighbouring count inside the limits is unchecked: the
      // answer at the edge of what was checked is the case "a longer route might win" used to flag.
      const win = [...results.values()].reduce<{ chain: number[]; seconds: number } | null>(
        (a, b) => (!a || b.seconds < a.seconds - EPS_SECONDS ? b : a),
        null
      );
      if (!win) break;
      queue = [win.chain.length - 1, win.chain.length + 1].filter(n => inRange(n) && !tried.has(n));
    }

    const win = [...results.values()].reduce<{ chain: number[]; seconds: number } | null>(
      (a, b) => (!a || b.seconds < a.seconds - EPS_SECONDS ? b : a),
      null
    );
    if (!win || win.chain.length === cur.length || !(win.seconds < best - EPS_SECONDS)) {
      report(
        `no other count beat ${cur.length} ascensions (searched ${[...countsProbed].sort((a, b) => a - b).join(', ')})`
      );
      return;
    }
    // One pass is a cheap look, not a polish: the winning count gets the rest of the descent the
    // seed's count had (six passes in all).
    cur = win.chain;
    best = win.seconds;
    note(cur, best);
    await descent(5, `stage 4d: fine-tuning ${cur.length} ascensions`);
  }

  // ------------------------------------------------------------------ the run
  stage = 'stage 4a: solving the last stop';
  report('sweeping the last stop');
  const seed = [...cur];
  cur = await resolveLast(cur, best === Infinity ? [seed] : []);
  // The seed's own time, when the sweep priced it (or `need` below prices it: a seed the sweep
  // could not take, e.g. a one-checkpoint chain).
  note(seed, cache.get(seed));
  if (!stopped) {
    best = (await cache.need(cur)) ?? best;
    note(cur, best);
    lastCompletedStage = 'last-checkpoint sweep';
  }

  if (!stopped) {
    await descent(6, 'stage 4: coordinate descent');
    if (!stopped) lastCompletedStage = 'coordinate descent';
  }
  if (!stopped && cfg.otherCounts) {
    await otherCounts();
    if (!stopped) lastCompletedStage = 'other ascension counts';
  }
  if (!stopped && cfg.slices2) {
    await slices();
    if (!stopped) lastCompletedStage = '2-D slices';
  }
  if (!stopped && cfg.slices3) {
    await slices3();
    if (!stopped) lastCompletedStage = '3-D slices';
  }
  if (!stopped && cfg.countProbe) {
    // Again while the count keeps changing: one round only moves it by one, and a seed two off the
    // best count would otherwise stop short. Bounded by the Limits range, so it cannot run on.
    const rounds = Math.max(1, maxLen - minLen);
    for (let round = 0; round < rounds && !stopped; round++) {
      const before = cur.length;
      await countProbe(round);
      if (cur.length === before) break;
    }
    if (!stopped) lastCompletedStage = 'prestige-count probe';
  }

  stage = stopped ? 'stopped' : 'done';
  noteBestSeen();
  report(`${days(ever.seconds)} d  ${ever.chain.join(' ')}`);

  return {
    chain: ever.chain,
    seconds: ever.seconds,
    legs: cache.legsOf(ever.chain),
    stoppedEarly: stopped,
    lastCompletedStage,
    chainsEvaluated: cache.chainsEvaluated,
    legSims: cache.legSims,
    countsProbed: [...countsProbed],
  };
}
