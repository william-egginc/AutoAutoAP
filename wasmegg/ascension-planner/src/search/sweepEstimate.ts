/**
 * @module sweepEstimate
 * @description ONE time left for a Full sweep, for its panel's "Est. wall clock" and the progress bar
 * that follows the player across tabs, so the two cannot disagree.
 *
 * What went wrong (the user, 9 Oct, a 3-chain queue carried on after a refresh with ~4,400 chains
 * already priced): the bar said "4,393 of ~34,375 chains · about 2 min left", then "about 4.2 h
 * left"; the panel, at the same time, "Chains it will run 132,192 · Est. wall clock 8 min left".
 *  - Both extrapolated from chains done over time elapsed, and the chains done included the ones
 *    REPLAYED from the checkpoint, which cost nothing: thousands of chains "in" a few seconds.
 *  - The bar counted the chain running; the panel counted every chain of the queue.
 *
 * Here the rate is the By a date one (deadlineEstimate.ts `addLegSample`, `liveLegRate`), in chains
 * instead of legs: samples of FRESH chains (priced this session, not replayed), the clock starting
 * when the workers start pricing, the last 12 minutes of them. Nothing to go on until the workers
 * have done 5 s of real work ("measuring time left…"), and `measuring` until 2 minutes of it. The
 * time left covers the whole queue: the chain running, then the chains queued after it, each priced
 * at this chain's measured rate scaled by how much a chain of its length typically costs.
 */
import { liveLegRate, recentLegRate, RATE_WINDOW_SECONDS, SAMPLE_EVERY_MS } from './deadlineEstimate';
import { workerSecondsPerChain } from './speed';

/**
 * The samples after one more report of `done` chains (the replayed `replayed` of them cost nothing):
 * `[unix ms, fresh chains]`, as `addLegSample` keeps legs, with one difference. A report that comes
 * while the last sample is under `SAMPLE_EVERY_MS` after the one before it REPLACES that last one
 * instead of being dropped, so the newest count is always in. A chain takes seconds, so reports are sparse: dropped, the
 * workers' first four chains read as one ("about 34.5 h left" for 3 h of work, browser-tested 9 Oct).
 * Until anything fresh is priced the list is one sample at the latest moment, so the clock starts
 * where the replay (and the workers' start) ends.
 */
export function addChainSample(
  list: readonly [number, number][],
  now: number,
  done: number,
  replayed = 0
): [number, number][] {
  const fresh = Math.max(0, done - replayed);
  if (fresh <= 0) return [[now, 0]];
  const keepFrom = now - 2 * RATE_WINDOW_SECONDS * 1000;
  const n = list.length;
  // The last sample is provisional while it is under `SAMPLE_EVERY_MS` after the one before it.
  const base = n >= 2 && list[n - 1][0] - list[n - 2][0] < SAMPLE_EVERY_MS ? list.slice(0, -1) : list;
  return [...base.filter(x => x[0] >= keepFrom), [now, fresh]];
}

export interface SweepTimeLeftInput {
  /** `[unix ms, fresh chains priced]`, from `addChainSample(list, now, done, replayed)`. */
  samples: readonly (readonly [number, number])[];
  /** Chains done in the chain running, replayed ones and the chunk in flight included. */
  done: number;
  /** Chains in the chain running. */
  total: number;
  /** Ascensions in the chain running (its length). */
  ascensions: number;
  /** A multi-chain click (InsanePanel's queue): which chain runs (0-based), and each chain's count
   *  and length. Null or absent for a single run (a carry-on runs its own chain only). */
  queue?: { at: number; counts: readonly number[]; ascensions: readonly number[] } | null;
}

export interface SweepTimeLeft {
  /** Seconds for everything left, the queue's later chains included; null while there is nothing
   *  measured to go on. */
  seconds: number | null;
  /** Under 2 minutes of real work behind the rate (the bar's "(measuring…)"). */
  measuring: boolean;
  /** Chains left to price, the queue's later chains included. */
  chainsLeft: number;
  /** Every chain the run prices: the queue's, or this chain's. */
  chainsTotal: number;
  /** "Chain 2 of 3", for a queue; null for a single run. */
  chain: { at: number; of: number } | null;
}

/** What a chain of `ascensions` costs next to one of `like`: the board's typical figures' ratio. */
export function relativeChainCost(ascensions: number, like: number): number {
  const base = workerSecondsPerChain(like);
  return base > 0 ? workerSecondsPerChain(ascensions) / base : 1;
}

export function sweepTimeLeft(input: SweepTimeLeftInput): SweepTimeLeft {
  const total = Math.max(input.total, input.done);
  const currentLeft = Math.max(0, total - input.done);
  const q = input.queue;
  const inQueue = !!q && q.at >= 0 && q.at < q.counts.length;
  let before = 0;
  let laterChains = 0;
  // The later chains in units of this chain's chains, so this chain's rate can price them.
  let laterUnits = 0;
  if (inQueue) {
    for (let k = 0; k < q.counts.length; k++) {
      const n = Math.max(0, q.counts[k] || 0);
      if (k < q.at) before += n;
      else if (k > q.at) {
        laterChains += n;
        laterUnits += n * relativeChainCost(q.ascensions[k] ?? input.ascensions, input.ascensions);
      }
    }
  }
  const samples = input.samples;
  const at = samples.length ? samples[samples.length - 1][0] : 0;
  const { rate } = liveLegRate(samples, at, null);
  return {
    seconds: rate && rate > 0 ? (currentLeft + laterUnits) / rate : null,
    measuring: recentLegRate(samples, at) === null,
    chainsLeft: currentLeft + laterChains,
    chainsTotal: before + total + laterChains,
    chain: inQueue ? { at: q.at + 1, of: q.counts.length } : null,
  };
}

/**
 * A time left in words, the same way wherever it is shown (the progress bar on every tab, the Full
 * sweep's Est. wall clock): "40 s", "25 min", "4.2 h", "3.1 days". The panel's own hours-only format
 * read "1.3 h" where the bar read "80 min" for the same figure.
 */
export function formatTimeLeft(seconds: number): string {
  if (!(seconds > 0)) return '';
  if (seconds < 90) return `${Math.round(seconds)} s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min`;
  if (seconds < 48 * 3600) return `${(seconds / 3600).toFixed(1)} h`;
  return `${(seconds / 86400).toFixed(1)} days`;
}
