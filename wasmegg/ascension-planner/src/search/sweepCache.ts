/**
 * The route search's sweeps kept across its steps (search/routeFinder.ts `expandArrivals`), held to a
 * memory budget.
 *
 * Each sweep holds about 40 KB of arrays (TailSweep `bytes`), and they are typed arrays, so they don't
 * show in a heap figure. The route worker used to keep up to 60,000 of them, checked only between
 * requests: up to about 2.3 GB a worker. On an iPhone the instant answer's two route workers took
 * Safari's page past its memory limit, and it reloaded and died again (the user, 12 Oct 2026, By a
 * date on egg-beta). Here the budget is checked as each one goes in, and the longest unused goes first.
 * A sweep dropped is only worked out again when it is asked for: the answer is the same.
 */
import type { TailSweep } from './precomputedLeg';
import { isSmallDevice } from './device';

/** What `expandArrivals` needs of a cache: a plain Map works too (the command line's precompute). */
export interface SweepStore {
  get(key: string): TailSweep | undefined;
  set(key: string, sweep: TailSweep): unknown;
}

const MB = 1024 * 1024;
/** A route worker's budget on a phone or small machine (search/device.ts), and on a computer. */
export const SMALL_SWEEP_BUDGET = 48 * MB;
export const SWEEP_BUDGET = 192 * MB;

/** This device's budget for one cache. */
export function sweepBudget(small: boolean = isSmallDevice()): number {
  return small ? SMALL_SWEEP_BUDGET : SWEEP_BUDGET;
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
