/**
 * @module smartTimeLeft
 * @description A Smart search's time left (Fast and Exact), for the progress bar on every tab.
 *
 * The routes left to its upper bound over the same windowed rate as a Full sweep's (search/sweepEstimate.ts), from the
 * routes priced this session (`addChainSample`), blended with the planned speed until two minutes are measured. It was
 * the routes left times a per-batch average (30% on the newest batch), and a Smart search's batches differ several times
 * over in cost per route (the last stop's re-solve against an early stop's sweep, which simulates every later ascension
 * again): the tester's "20 min, then 10, then 20" (R7 live, 9 Nov 2026). The upper bound stays an upper bound: the
 * search stops as soon as nothing moves, so it often ends sooner than this says.
 *
 * In src/lib, not src/search, on purpose: it decides no result, so it stays out of the result code hash
 * (lib/resultCodeHash.ts) and nobody's kept answers are worked out again for it.
 */
import { liveLegRate } from '@/search/deadlineEstimate';

export function smartTimeLeft(input: {
  samples: readonly (readonly [number, number])[];
  done: number;
  total: number;
  /** Seconds a route at the planned speed (this device's workers, the typical speed); null for none. */
  plannedSecondsPerChain: number | null;
}): { seconds: number | null; measuring: boolean } {
  const left = Math.max(0, Math.max(input.total, input.done) - input.done);
  const samples = input.samples;
  const at = samples.length ? samples[samples.length - 1][0] : 0;
  const p = input.plannedSecondsPerChain;
  const { rate, measuring } = liveLegRate(samples, at, p && p > 0 ? 1 / p : null);
  return { seconds: rate && rate > 0 ? left / rate : null, measuring };
}
