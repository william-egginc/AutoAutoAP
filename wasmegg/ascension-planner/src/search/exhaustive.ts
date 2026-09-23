/**
 * @module exhaustive
 * @description Enumerating every strictly-increasing chain over a pool, for the mode that can
 * actually prove something.
 *
 * The staged search returns a strong local optimum and says so. This returns the true optimum of
 * the space it enumerates, because it prices all of it. That is the only reason this project can
 * say "rank 1 of 4913" about anything.
 *
 * THERE IS NO PRUNING HERE, and that is not an omission. Pruning by prefix cost is inadmissible:
 * a prefix that arrives later can arrive with a higher delivery rate and win overall. It was
 * implemented once and measured, and it cut 0 of 69 chains on a real run. Exhaustive means
 * exhaustive.
 *
 * IT RUNS AWAY FAST. Choosing 6 checkpoints from 185..390 at step 1 is C(206,6) = 8.2e10 chains.
 * The count is combinatorial in the pool size, so the difference between step 10 and step 5 is not
 * double, it is orders of magnitude. `countChains` exists so a caller can say so before simulating
 * anything, rather than after.
 */

/** Pool spec, the browser form of the CLI's `--range lo:hi[:step]`. */
export interface PoolSpec {
  lo: number;
  hi: number;
  /** Values are taken every `step` TE. Defaults to 1 and must be positive. */
  step: number;
}

/**
 * The checkpoint values to choose from, with anything unreachable dropped.
 *
 * At or below `currentTE` is not an ascension the account can perform, and at or above `final` is
 * the target itself, which every chain ends with anyway.
 */
export function buildPool(spec: PoolSpec, currentTE: number, final: number): number[] {
  const step = Number.isFinite(spec.step) && spec.step > 0 ? Math.floor(spec.step) : 1;
  if (!Number.isFinite(spec.lo) || !Number.isFinite(spec.hi) || spec.hi < spec.lo) return [];

  const values: number[] = [];
  for (let v = Math.floor(spec.lo); v <= Math.floor(spec.hi); v += step) values.push(v);
  return [...new Set(values)].filter(v => v > currentTE && v < final).sort((a, b) => a - b);
}

/**
 * Every strictly-increasing chain over `pool` with between `minAsc` and `maxAsc` ascensions,
 * `final` appended to each. Ported verbatim from the CLI's own enumeration so the two modes cannot
 * drift into enumerating different spaces.
 *
 * `minAsc`/`maxAsc` count the final target, so a 5-ascension chain takes 4 values from the pool.
 */
export function exhaustiveChains(
  pool: number[],
  minAsc: number,
  maxAsc: number,
  final: number,
  currentTE: number,
  limit = Infinity
): number[][] {
  const out: number[][] = [];
  const walk = (i: number, acc: number[]) => {
    if (out.length >= limit) return;
    if (acc.length >= minAsc - 1 && acc.length <= maxAsc - 1 && acc.length) out.push([...acc, final]);
    if (acc.length >= maxAsc - 1) return;
    for (let j = i; j < pool.length && out.length < limit; j++) {
      if (pool[j] >= final) break;
      if (!acc.length ? pool[j] > currentTE : pool[j] > acc[acc.length - 1]) walk(j + 1, [...acc, pool[j]]);
    }
  };
  walk(0, []);
  return out;
}

/**
 * How many chains `exhaustiveChains` would return, without building them.
 *
 * Enumerating first and counting the array is how a browser tab dies before it can warn anybody:
 * at step 1 over a wide range the array does not fit in memory. This is the same sum of binomial
 * coefficients, computed in floating point, so it saturates to Infinity instead of allocating.
 */
export function countChains(poolSize: number, minAsc: number, maxAsc: number): number {
  const lo = Math.max(1, Math.floor(minAsc));
  const hi = Math.max(lo, Math.floor(maxAsc));
  let total = 0;
  for (let asc = lo; asc <= hi; asc++) {
    const pick = asc - 1;
    if (pick < 1 || pick > poolSize) continue;
    total += binomial(poolSize, pick);
    if (!Number.isFinite(total)) return Infinity;
  }
  return total;
}

function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  const kk = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= kk; i++) {
    result = (result * (n - kk + i)) / i;
    if (!Number.isFinite(result)) return Infinity;
  }
  return Math.round(result);
}

/**
 * Wall-clock upper bound in hours.
 *
 * `secondsPerChain` is the measured floor with a warm prefix memo, so this over-estimates, which
 * is the direction an "are you sure" should err. Prefix sharing makes the real figure lower.
 */
export function estimateHours(chains: number, workers: number, secondsPerChain = 15): number {
  if (!Number.isFinite(chains)) return Infinity;
  return (chains * secondsPerChain) / 3600 / Math.max(1, workers);
}

/** `2.1 h`, `45 min`, `3.4 years`. Coarse on purpose: this is a decision aid, not a countdown. */
export function formatHours(hours: number): string {
  if (!Number.isFinite(hours)) return 'longer than you have';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  const days = hours / 24;
  if (days < 365) return `${days.toFixed(1)} days`;
  return `${(days / 365).toFixed(1)} years`;
}

/**
 * Sort so chains sharing a prefix are adjacent.
 *
 * The evaluator memoises by prefix, and a leg simulation is the entire cost of the thing. Chunking
 * an unsorted list scatters siblings across chunks and throws that away: the CLI measured prefix
 * sharing saving the large majority of leg simulations on a real run.
 */
export function sortByPrefix(chains: number[][]): number[][] {
  return [...chains].sort((a, b) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
    return a.length - b.length;
  });
}

/* ------------------------------------------------------------------------------------------- *
 * Shaping the space
 *
 * Plain `--range lo:hi:step` enumeration has a blind spot: STEP CONTROLS THE GRID, NOT THE CHAIN.
 * At step 15 the pool is 185, 200, 215, 230 ... and `185 200 215 230 490` is a perfectly legal
 * chain -- three 15-TE ascensions followed by a 260-TE one. Each of those is a full farm rebuild
 * for almost no earning time, and the enumeration prices thousands of them.
 *
 * Two ways to stop that, both OPT-IN, because both narrow what the run proves. An exhaustive over
 * a restricted space is the true optimum OF THAT SPACE, and the moment a constraint is added the
 * claim shrinks with it. That is worth saying out loud rather than burying: the value of this mode
 * is that it proves something.
 *
 * AND A MEASURED WARNING ABOUT MINIMUM GAP. It is tempting to set one and forget it. The best
 * 7-ascension chain found on this account so far is `185 200 215 230 290 380 490`, whose interior
 * gaps are 15, 15, 15, 60, 90 -- any minimum gap above 15 excludes it outright. Small early gaps
 * are cheap when the ascension is short; they only look absurd from the far end of the chain.
 * ------------------------------------------------------------------------------------------- */

/** Smallest interior gap seen in a chain measured as good on this project's own corpora. */
export const SMALLEST_MEASURED_GAP = 15;

/**
 * Every strictly-increasing chain over `pool`, with a minimum distance between consecutive
 * checkpoints. `minGap` of 0 or less is the unconstrained enumeration.
 *
 * The gap to the final target is deliberately NOT constrained: the last leg is long by nature and
 * the driver's `maxLast` is the knob for that end of the chain.
 */
export function exhaustiveChainsWithGap(
  pool: number[],
  minAsc: number,
  maxAsc: number,
  final: number,
  currentTE: number,
  minGap: number,
  limit = Infinity
): number[][] {
  if (!(minGap > 0)) return exhaustiveChains(pool, minAsc, maxAsc, final, currentTE, limit);
  const out: number[][] = [];
  const walk = (i: number, acc: number[]) => {
    if (out.length >= limit) return;
    if (acc.length >= minAsc - 1 && acc.length <= maxAsc - 1 && acc.length) out.push([...acc, final]);
    if (acc.length >= maxAsc - 1) return;
    for (let j = i; j < pool.length && out.length < limit; j++) {
      const v = pool[j];
      if (v >= final) break;
      if (!acc.length ? v > currentTE : v - acc[acc.length - 1] >= minGap) walk(j + 1, [...acc, v]);
    }
  };
  walk(0, []);
  return out;
}

/**
 * How many chains the above would return, without building them.
 *
 * `countChains` is a sum of binomials, which stops being right the moment a gap constraint exists.
 * This is a DP over (pool index, checkpoints chosen so far): `ways[j][k]` is the number of chains
 * of k checkpoints whose last one is `pool[j]`. O(pool^2 x maxAsc), which is nothing next to
 * enumerating, and it keeps the promise that the form can refuse a space before allocating it.
 */
export function countChainsWithGap(pool: number[], minAsc: number, maxAsc: number, minGap: number): number {
  if (!(minGap > 0)) return countChains(pool.length, minAsc, maxAsc);
  const n = pool.length;
  const maxPick = Math.max(0, Math.floor(maxAsc) - 1);
  const minPick = Math.max(1, Math.floor(minAsc) - 1);
  if (n === 0 || maxPick === 0) return 0;

  // ways[k][j]: chains of k checkpoints ending at pool[j].
  const ways: number[][] = [];
  ways[1] = new Array(n).fill(1);
  let total = minPick <= 1 && 1 <= maxPick ? n : 0;

  for (let k = 2; k <= maxPick; k++) {
    const row = new Array(n).fill(0);
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let i = 0; i < j; i++) {
        if (pool[j] - pool[i] >= minGap) sum += ways[k - 1][i];
      }
      row[j] = sum;
      if (!Number.isFinite(row[j])) return Infinity;
    }
    ways[k] = row;
    if (k >= minPick) {
      for (const v of row) {
        total += v;
        if (!Number.isFinite(total)) return Infinity;
      }
    }
  }
  return total;
}

/**
 * Per-checkpoint bands: checkpoint 1 comes from band 1, checkpoint 2 from band 2, and so on.
 *
 * This is the surgical version of the same idea. "185-200, then 210-240, then 250-290" says where
 * each ascension should land rather than leaving the enumeration free to stack four of them inside
 * twenty TE. The ascension count is fixed by construction: N bands is N+1 ascensions, target
 * included.
 *
 * Bands may overlap; the strictly-increasing and `minGap` rules still apply, so an overlap simply
 * means the two checkpoints can be close, not that they can swap order.
 */
export function bandedChains(
  bands: number[][],
  final: number,
  currentTE: number,
  minGap = 0,
  limit = Infinity
): number[][] {
  if (!bands.length || bands.some(b => !b.length)) return [];
  const out: number[][] = [];
  const walk = (slot: number, acc: number[]) => {
    if (out.length >= limit) return;
    if (slot === bands.length) {
      out.push([...acc, final]);
      return;
    }
    for (const v of bands[slot]) {
      if (out.length >= limit) return;
      if (v >= final) continue;
      const ok = acc.length ? v - acc[acc.length - 1] >= Math.max(1, minGap) : v > currentTE;
      if (ok) walk(slot + 1, [...acc, v]);
    }
  };
  walk(0, []);
  return out;
}

/** Counted the same way, by DP across the bands, so a wide set can be refused before it is built. */
export function countBanded(bands: number[][], final: number, currentTE: number, minGap = 0): number {
  if (!bands.length || bands.some(b => !b.length)) return 0;
  const gap = Math.max(1, minGap);

  // counts[i]: how many partial chains end at bands[slot][i].
  let prev: number[] = bands[0].filter(v => v > currentTE && v < final).map(() => 1);
  let prevValues = bands[0].filter(v => v > currentTE && v < final);

  for (let slot = 1; slot < bands.length; slot++) {
    const values = bands[slot].filter(v => v < final);
    const row = new Array(values.length).fill(0);
    for (let j = 0; j < values.length; j++) {
      let sum = 0;
      for (let i = 0; i < prevValues.length; i++) {
        if (values[j] - prevValues[i] >= gap) sum += prev[i];
      }
      row[j] = sum;
      if (!Number.isFinite(row[j])) return Infinity;
    }
    prev = row;
    prevValues = values;
  }

  let total = 0;
  for (const v of prev) {
    total += v;
    if (!Number.isFinite(total)) return Infinity;
  }
  return total;
}

/** `185-200:5` -> [185, 190, 195, 200]. The band form of a pool spec, for the UI's text entry. */
export function parseBand(text: string, defaultStep = 5): number[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const [rangePart, stepPart] = trimmed.split(':');
  const bounds = rangePart.split(/[-–]/).map(x => Number(x.trim()));
  const step = Number(stepPart) > 0 ? Math.floor(Number(stepPart)) : defaultStep;
  if (bounds.length === 1 && Number.isFinite(bounds[0])) return [Math.floor(bounds[0])];
  if (bounds.length !== 2 || !bounds.every(Number.isFinite) || bounds[1] < bounds[0]) return [];
  const out: number[] = [];
  for (let v = Math.floor(bounds[0]); v <= Math.floor(bounds[1]); v += step) out.push(v);
  return out;
}

/** `185-200:5; 210-240; 250-290` -> one band per segment. Blank segments are dropped. */
export function parseBands(text: string, defaultStep = 5): number[][] {
  return text
    .split(';')
    .flatMap(part => part.split('\n'))
    .map(part => parseBand(part, defaultStep))
    .filter(b => b.length);
}

/* ------------------------------------------------------------------------------------------- *
 * Suggesting a space to enumerate
 *
 * Two different answers live here, and which one the suggester gives depends on whether the
 * honest one is affordable.
 *
 * COMPLETE, WHEN IT FITS. Choosing N-1 checkpoints freely from every reachable TE is the answer
 * that proves something: no corpus, no assumed shape, and no restriction on the target, because
 * nothing about it was measured on 490. Two ascensions is ~300 chains on any account and three is
 * under the budget on most, so for the short chains this should not be quoting anybody's
 * measurements -- it should be handing over the whole space. The 2-ascension corpus run is exactly
 * that, every integer from 136 to 489 priced, and its winner (235) is not a multiple of 5, which
 * no grid would ever have offered.
 *
 * MEASURED, WHEN IT DOES NOT. Past three ascensions the complete space is astronomical -- six
 * ascensions is five checkpoints chosen from 181..489, which is 2.3e10 chains -- so the only way
 * to spend a finite budget is to spend it where good chains have been found before. That is what
 * the table below is.
 *
 * Where the near-best chains in this project's corpus put each checkpoint, as a fraction of the
 * journey from current TE to the target. Two corpora, unioned:
 *
 *   - the original ten CSVs, seven accounts, 21,667 priced chains, taking every chain within 2%
 *     of its run's best at that ascension count, then the median per run and the min/max ACROSS
 *     runs;
 *   - six later CSVs, three accounts, 121,401 priced chains, taking every chain within 1% of its
 *     run's best and then the full min/max WITHIN each run, so a band describes the plateau rather
 *     than where the run medians happened to fall. The old method could return a band two TE wide
 *     when its runs agreed, which is precision the corpus does not have.
 *
 * EDGE EXTENSION, because these are searches and not surveys. When a run's near-best set runs into
 * the edge of what that run actually enumerated, the optimum may well be outside the box and the
 * band is an artifact of where somebody pointed the search. The 7-ascension run's best chain,
 * 195 219 245 248 270 300, sits on its own upper edge at three of six checkpoints. So a band that
 * touches an explored edge is extended on that side by half the explored width, capped at 0.06 of
 * the journey. It is a hedge against the sampling, not a measurement.
 *
 * Accounts are counted by distinct save, and the two corpora are counted separately, so an account
 * appearing in both is counted twice. Runs are distinct files either way.
 *
 * WHY THIS IS 490-ONLY, AND NOT A LAW. The pattern does not transfer across targets. On 490 the
 * last checkpoint sits at 0.29-0.64 of the journey; on 300, measured on three independent runs, it
 * sits at 0.80-0.86. In absolute terms that is `final - 150ish` for 490 and `final - 25..35` for
 * 300. Neither a fixed offset nor a fixed fraction describes both, so suggesting 490's shape for a
 * 300 target would be worse than suggesting nothing. The complete sweep has no such limit, which
 * is the other reason to prefer it whenever it fits.
 *
 * AND THE BIGGER CAVEAT. These chains come from STAGED and BANDED searches, which explore a
 * neighbourhood. So this is where good chains were FOUND, which is not the same as where good
 * chains ARE. Edge extension blunts that; it does not remove it. Bands built from this are a way
 * to spend a fixed budget on the region that has paid before, not evidence that nothing else pays.
 * ------------------------------------------------------------------------------------------- */

/** Targets the fractions were measured on. Outside this, only the complete sweep is offered. */
export const SUGGESTION_TARGET_RANGE: [number, number] = [420, 560];

/**
 * How many chains a suggestion may propose.
 *
 * Sized from the runs this project has actually completed in a browser: 17,892, 25,920 and 41,580
 * chains. At the measured 0.66-3.2 s per chain across a worker pool that is a few hours, which is
 * what someone opening this mode is signing up for. It is the knob to turn if that is wrong --
 * every suggestion is tuned to fill it, so raising it buys resolution and width rather than
 * nothing.
 */
export const SUGGESTION_CHAIN_BUDGET = 75_000;

/** Steps a suggested band may use. Familiar numbers; the corpus runs used 1, 2 and 5. */
const STEP_LADDER = [1, 2, 5, 10, 15, 20, 25, 30];

/** Phase 1 refines every band to at least this resolution before spending budget on width. */
const STEP_FLOOR = 5;

/** Widening either side never exceeds this fraction of the journey, measured or not. */
const MAX_MARGIN = 0.1;

interface BandTable {
  /** `[lo, hi]` fraction of the journey, one per intermediate checkpoint. */
  bands: [number, number][];
  runs: number;
  accounts: number;
}

const MEASURED_BANDS: Record<number, BandTable> = {
  // 2 and 3 are the fallback for a journey too long for a complete sweep; on almost every real
  // account `suggestBands` never reaches them. Every run behind them used step 1 -- every integer
  // TE, no grid at all -- the older pair on 180 -> 490 and one later run on 132 -> 490, which is
  // also why their bands are wide: two accounts that disagree, and no grid to blame it on.
  2: {
    bands: [[0.265, 0.365]],
    runs: 3,
    accounts: 2,
  },
  3: {
    bands: [
      [0.052, 0.232],
      [0.306, 0.447],
    ],
    runs: 3,
    accounts: 2,
  },
  // The only count with no second opinion: one exhaustive sweep, one account.
  4: {
    bands: [
      [0.035, 0.1],
      [0.129, 0.29],
      [0.323, 0.452],
    ],
    runs: 1,
    accounts: 1,
  },
  5: {
    bands: [
      [0.016, 0.169],
      [0.136, 0.258],
      [0.197, 0.422],
      [0.379, 0.621],
    ],
    runs: 7,
    accounts: 5,
  },
  6: {
    bands: [
      [0.0, 0.136],
      [0.046, 0.227],
      [0.167, 0.379],
      [0.258, 0.5],
      [0.409, 0.641],
    ],
    runs: 7,
    accounts: 5,
  },
  7: {
    bands: [
      [0.024, 0.096],
      [0.079, 0.189],
      [0.142, 0.241],
      [0.193, 0.343],
      [0.238, 0.473],
      [0.29, 0.548],
    ],
    runs: 5,
    accounts: 3,
  },
  // One run, 41,580 chains, 181 -> 490, and every band edge-extended because its near-best set
  // filled the box it was given. Thin evidence for a shape, but the shape is unambiguous: eight
  // ascensions wants seven checkpoints crowded into the first 40% of the journey, the last of them
  // around 0.36, and then one enormous final leg.
  8: {
    bands: [
      [0.025, 0.065],
      [0.058, 0.13],
      [0.093, 0.166],
      [0.122, 0.195],
      [0.19, 0.263],
      [0.252, 0.324],
      [0.32, 0.392],
    ],
    runs: 1,
    accounts: 1,
  },
};

export interface BandSuggestion {
  /** Rendered for the bands box, e.g. `185-203:5; 195-223:5; ...`. */
  text: string;
  bands: number[][];
  /**
   * `complete` is every reachable checkpoint at step 1, so the run proves the optimum of the whole
   * space. `measured` is the corpus shape, so it proves the optimum of that shape only.
   */
  kind: 'complete' | 'measured';
  /**
   * True only when nothing was gridded away: a complete sweep at step 1, where the run that
   * follows returns the true optimum of the whole reachable space rather than of a sample of it.
   */
  exact: boolean;
  /** Chains in the suggested space, counted with the strictly-increasing rule already applied. */
  chains: number;
  /** Step each band ended up with. All 1 on a complete sweep. */
  steps: number[];
  runs: number;
  accounts: number;
  /** Widening applied either side, as a fraction of the journey. 0 on a complete sweep. */
  margin: number;
}

export interface SuggestOptions {
  /** Ceiling on the chains a suggestion may propose. Defaults to `SUGGESTION_CHAIN_BUDGET`. */
  maxChains?: number;
  /** One step for every band, skipping the per-band tuning and the complete sweep. */
  step?: number;
  /** Fixed widening either side, skipping the tuning and the complete sweep. */
  margin?: number;
}

/** Smallest ladder step that is at least `want`. */
function ladderStep(want: number): number {
  for (const s of STEP_LADDER) if (s >= want) return s;
  return STEP_LADDER[STEP_LADDER.length - 1];
}

/**
 * The table turned into actual values, or null when the journey has no room for it.
 *
 * Bands are forced strictly ascending in both ends. A wide margin on a short journey would
 * otherwise clamp two adjacent bands onto the same value and produce a "suggestion" whose first
 * two checkpoints are the same number, which every consumer downstream assumes cannot happen.
 */
function materialise(
  table: [number, number][],
  currentTE: number,
  finalTE: number,
  margin: number,
  steps: number[]
): { bands: number[][]; text: string } | null {
  const span = finalTE - currentTE;
  const bands: number[][] = [];
  const parts: string[] = [];
  const m = table.length;
  let prevLo = -Infinity;
  let prevHi = -Infinity;

  for (let i = 0; i < m; i++) {
    // Leave room for the bands after this one, so the ascending nudges below cannot run out of it.
    const floor = currentTE + 1 + i;
    const ceil = finalTE - 1 - (m - 1 - i);
    if (ceil < floor) return null;

    const [lo, hi] = table[i];
    let a = Math.round(currentTE + Math.max(0, lo - margin) * span);
    a = Math.min(Math.max(a, floor, prevLo + 1), ceil);
    let b = Math.round(currentTE + Math.min(1, hi + margin) * span);
    b = Math.min(Math.max(b, a, prevHi + 1), ceil);

    const step = Math.max(1, Math.floor(steps[i]));
    const values: number[] = [];
    for (let v = a; v <= b; v += step) values.push(v);
    if (!values.length) return null;

    bands.push(values);
    parts.push(`${a}-${b}:${step}`);
    prevLo = a;
    prevHi = b;
  }
  return { bands, text: parts.join('; ') };
}

/**
 * Steps and margin that fill the budget, in the order that matters.
 *
 * Resolution first, then width, then more resolution. A 10-TE grid cannot express the difference
 * between 213 and 215, and the corpus's best chains repeatedly land on values a coarse grid skips,
 * so every band is refined to 5 TE before a single chain is spent on widening. Once every band is
 * at 5 the extra budget goes into margin, because at that point another 5 TE either side is worth
 * more than telling 212 from 213. Only then does it go back for step 2 and step 1.
 *
 * Refinement always takes the coarsest band first, which equalises resolution across the chain
 * rather than lavishing step 1 on one band while another is still on 30.
 */
function tuneToBudget(
  table: [number, number][],
  currentTE: number,
  finalTE: number,
  budget: number
): { steps: number[]; margin: number; bands: number[][]; text: string; chains: number } | null {
  const m = table.length;
  const coarsest = STEP_LADDER[STEP_LADDER.length - 1];
  let steps = new Array(m).fill(coarsest);
  let margin = 0;

  const priceOf = (mg: number, st: number[]): { chains: number; built: ReturnType<typeof materialise> } => {
    const built = materialise(table, currentTE, finalTE, mg, st);
    return { chains: built ? countBanded(built.bands, finalTE, currentTE, 1) : Infinity, built };
  };

  const start = priceOf(margin, steps);
  if (!start.built || start.chains > budget) return null;

  const refine = (floor: number): void => {
    for (;;) {
      const candidates = steps
        .map((s, i) => ({ s, i }))
        .filter(x => x.s > floor)
        .sort((x, y) => y.s - x.s || x.i - y.i);
      if (!candidates.length) return;
      let moved = false;
      for (const { s, i } of candidates) {
        const trial = [...steps];
        trial[i] = STEP_LADDER[STEP_LADDER.indexOf(s) - 1];
        if (priceOf(margin, trial).chains <= budget) {
          steps = trial;
          moved = true;
          break;
        }
      }
      if (!moved) return;
    }
  };

  refine(STEP_FLOOR);
  while (margin + 0.01 <= MAX_MARGIN + 1e-9) {
    const next = Math.round((margin + 0.01) * 1000) / 1000;
    if (priceOf(next, steps).chains > budget) break;
    margin = next;
  }
  refine(1);

  const final = priceOf(margin, steps);
  if (!final.built) return null;
  return { steps, margin, bands: final.built.bands, text: final.built.text, chains: final.chains };
}

/**
 * A space to enumerate for this account at this ascension count, or null when there isn't one.
 *
 * Prefers the complete sweep -- every reachable TE at step 1 -- whenever it fits the budget, and
 * falls back to the measured bands when it does not. Passing `step` or `margin` skips both the
 * sweep and the tuning and just renders the table, which is how a caller pins down an exact space.
 */
export function suggestBands(
  currentTE: number,
  finalTE: number,
  ascensions: number,
  opts: SuggestOptions = {}
): BandSuggestion | null {
  const n = Math.floor(ascensions);
  const budget = opts.maxChains && opts.maxChains > 0 ? Math.floor(opts.maxChains) : SUGGESTION_CHAIN_BUDGET;
  const table = MEASURED_BANDS[n];
  if (!table) return null;
  const span = finalTE - currentTE;
  if (!(span > 0)) return null;
  const pinned = opts.step !== undefined || opts.margin !== undefined;

  // The whole space, when the whole space is affordable. Every band is the same full range; the
  // strictly-increasing rule is what makes that an enumeration rather than a product, so the count
  // is the plain binomial and does not need the DP.
  //
  // Step 2 is offered as well, and nothing coarser. A full-range sweep at step 2 still cannot miss
  // a region, and it only comes up in the narrow window where step 1 just misses the budget -- on
  // a 100 -> 490 account three ascensions is 75,466 chains at step 1 and 18,915 at step 2. Past
  // step 2 the grid is coarse enough that the measured shape at 5 TE is the better use of the
  // same budget, so the sweep stops rather than degrading into a bad grid.
  if (!pinned) {
    const lo = Math.floor(currentTE) + 1;
    const hi = Math.floor(finalTE) - 1;
    for (const step of [1, 2]) {
      const values: number[] = [];
      for (let v = lo; v <= hi; v += step) values.push(v);
      const chains = countChains(values.length, n, n);
      if (values.length < n - 1 || chains > budget) continue;
      const bands = Array.from({ length: n - 1 }, () => [...values]);
      return {
        text: bands.map(() => `${lo}-${values[values.length - 1]}:${step}`).join('; '),
        bands,
        kind: 'complete',
        exact: step === 1,
        chains,
        steps: new Array(n - 1).fill(step),
        runs: 0,
        accounts: 0,
        margin: 0,
      };
    }
  }

  // Everything below is 490-shaped, so it declines on targets the corpus never saw.
  if (finalTE < SUGGESTION_TARGET_RANGE[0] || finalTE > SUGGESTION_TARGET_RANGE[1]) return null;

  if (pinned) {
    const step = opts.step && opts.step > 0 ? Math.floor(opts.step) : 5;
    const margin = opts.margin !== undefined ? opts.margin : 0;
    const built = materialise(table.bands, currentTE, finalTE, margin, new Array(table.bands.length).fill(step));
    if (!built) return null;
    return {
      ...built,
      kind: 'measured',
      exact: false,
      chains: countBanded(built.bands, finalTE, currentTE, 1),
      steps: new Array(table.bands.length).fill(step),
      runs: table.runs,
      accounts: table.accounts,
      margin,
    };
  }

  const tuned = tuneToBudget(table.bands, currentTE, finalTE, budget);
  if (!tuned) return null;
  return {
    text: tuned.text,
    bands: tuned.bands,
    kind: 'measured',
    exact: false,
    chains: tuned.chains,
    steps: tuned.steps,
    runs: table.runs,
    accounts: table.accounts,
    margin: tuned.margin,
  };
}

/** Ascension counts the suggester can speak to. */
export const SUGGESTABLE_ASCENSIONS = Object.keys(MEASURED_BANDS).map(Number);
