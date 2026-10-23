import { describe, expect, it } from 'vitest';
import { canonicalDelivered, sweepTails, type BuildParams, type TailSweep } from './precomputedLeg';
import { routeWorkers, SAFARI_SWEEP_BUDGET, SMALL_SWEEP_BUDGET, SWEEP_BUDGET, SweepCache, sweepBudget } from './sweepCache';

const fake = (bytes: number): TailSweep => ({
  from: 0,
  to: 0,
  seconds: new Float64Array(0),
  endTE: new Int16Array(0),
  deliveredInto: () => {},
  bytes,
});

describe('SweepCache', () => {
  it('stays inside its budget as sweeps go in, dropping the longest unused first', () => {
    const c = new SweepCache(100);
    c.set('a', fake(40));
    c.set('b', fake(40));
    expect(c.get('a')).toBeDefined(); // a is now the most recent
    c.set('c', fake(40));
    expect(c.bytes).toBeLessThanOrEqual(100);
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBeDefined();
    expect(c.get('c')).toBeDefined();
  });

  it('keeps the newest even when it alone is over budget, and counts a replaced key once', () => {
    const c = new SweepCache(10);
    c.set('a', fake(5));
    c.set('big', fake(50));
    expect(c.size).toBe(1);
    expect(c.get('big')).toBeDefined();
    c.set('big', fake(8));
    expect(c.bytes).toBe(8);
    c.clear();
    expect(c.size).toBe(0);
    expect(c.bytes).toBe(0);
  });

  it("splits the pool's budget across its route workers, a phone's smaller", () => {
    expect(routeWorkers(true, 6)).toBe(2);
    expect(routeWorkers(false, 8)).toBe(4);
    expect(routeWorkers(false, 2)).toBe(1);
    expect(sweepBudget(true, 6)).toBe(SMALL_SWEEP_BUDGET / 2);
    expect(sweepBudget(false, 20)).toBe(SWEEP_BUDGET / 4);
    expect(sweepBudget(false, 2)).toBe(SWEEP_BUDGET);
  });

  it('keeps half on Safari on a computer, a phone its own (22 Oct 2026 Safari reloads)', () => {
    expect(sweepBudget(false, 8, true)).toBe(SAFARI_SWEEP_BUDGET / 4);
    expect(SAFARI_SWEEP_BUDGET).toBe(SWEEP_BUDGET / 2);
    expect(sweepBudget(true, 6, true)).toBe(SMALL_SWEEP_BUDGET / 2);
    expect(sweepBudget(false, 8, false)).toBe(SWEEP_BUDGET / 4);
  });

  it("counts a real sweep at what it holds (about 21 KB low in the game; 12 Oct 2026's iPhone crash)", () => {
    const b: BuildParams = {
      sales: 2,
      tier13: false,
      waitStart: 300000,
      saleEnd: 400000,
      peakELR: 5e12,
      delivered: canonicalDelivered(160),
    };
    const sw = sweepTails(b, 490, 0, 157);
    // Its end counts only: a closure over sweepTails' own arrays kept about 39 KB a sweep.
    expect(sw.bytes).toBeGreaterThan(10_000);
    expect(sw.bytes).toBeLessThan(30_000);
    expect(Math.floor(sweepBudget(true, 6) / sw.bytes)).toBeGreaterThan(5_000);
  });
});
