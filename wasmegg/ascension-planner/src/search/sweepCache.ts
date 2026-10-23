/**
 * The route search's sweeps kept across its steps (search/routeFinder.ts `expandArrivals`), held to a
 * memory budget.
 *
 * Each sweep held about 39 KB (its arrays are typed arrays, so they don't show in a heap figure), and
 * the route worker kept up to 60,000 of them, checked only between requests: up to about 2.3 GB a
 * worker. On an iPhone the instant answer's two route workers took
 * Safari's page past its memory limit, and it reloaded and died again (the user, 12 Oct 2026, By a
 * date on egg-beta). A sweep is now about 21 KB (precomputedLeg.ts `sweepTails`), and the budget is
 * checked as each one goes in, the longest unused first out. A sweep dropped is only worked out again
 * when it is asked for: the answer is the same.
 *
 * The budgets, from 12 lookups sharing one cache at TE 160 (the instant answer and Prestige by's
 * re-pricing, in Node, 12 Oct): no limit 54 s and 1.8 GB; 1 GB 60 s (live's old code: 61 s);
 * 512 MB 68 s; 128 MB 102 s. That is one cache seeing every sweep; split across workers each sees
 * its share, so a pool's budget goes as far as one cache with all of it.
 */
import type { TailSweep } from './precomputedLeg';
import { isSafari, isSmallDevice } from './device';

/** What `expandArrivals` needs of a cache: a plain Map works too (the command line's precompute). */
export interface SweepStore {
  get(key: string): TailSweep | undefined;
  set(key: string, sweep: TailSweep): unknown;
}

const MB = 1024 * 1024;
/** The instant answer's route workers' budget, all of them together, on a phone or small machine
 *  (search/device.ts) and on a computer. Each worker gets its share: a step's arrivals are split
 *  across them (search/routePool.ts), so each sees about its share of the sweeps too. The search
 *  workers never keep sweeps; the route workers sleep while a search runs. */
export const SMALL_SWEEP_BUDGET = 384 * MB;
export const SWEEP_BUDGET = 2048 * MB;
/** Safari on a computer: half a computer's (22 Oct 2026). Safari reloads the tab at a much lower memory level
 *  than Chrome, and these sweeps are typed arrays outside every heap figure. 1 GB cost the measured lookups about
 *  10% more time than no limit (above); the answer is the same. */
export const SAFARI_SWEEP_BUDGET = 1024 * MB;

/** The route workers the instant answer runs (routePool.ts `poolSize`, two on a small device). */
export function routeWorkers(small: boolean, cores: number): number {
  const n = Math.max(1, Math.min(4, (cores || 4) - 1));
  return small ? Math.min(2, n) : n;
}

/** One route worker's budget on this device. */
export function sweepBudget(
  small: boolean = isSmallDevice(),
  cores: number = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4,
  safari: boolean = isSafari()
): number {
  const total = small ? SMALL_SWEEP_BUDGET : safari ? SAFARI_SWEEP_BUDGET : SWEEP_BUDGET;
  return Math.floor(total / routeWorkers(small, cores));
}

export class SweepCache implements SweepStore {
  private map = new Map<string, TailSweep>();
  /** Bytes held now (the sweeps' own `bytes`). */
  bytes = 0;

  constructor(readonly maxBytes: number = sweepBudget()) {}

  get size(): number {
    return this.map.size;
  }

  get(key: string): TailSweep | undefined {
    const sw = this.map.get(key);
    if (sw) {
      // Most recently used goes last, so the oldest unused is first out.
      this.map.delete(key);
      this.map.set(key, sw);
    }
    return sw;
  }

  set(key: string, sweep: TailSweep): this {
    const old = this.map.get(key);
    if (old) {
      this.bytes -= old.bytes;
      this.map.delete(key);
    }
    this.map.set(key, sweep);
    this.bytes += sweep.bytes;
    for (const [k, sw] of this.map) {
      if (this.bytes <= this.maxBytes || k === key) break;
      this.map.delete(k);
      this.bytes -= sw.bytes;
    }
    return this;
  }

  clear(): void {
    this.map.clear();
    this.bytes = 0;
  }
}
