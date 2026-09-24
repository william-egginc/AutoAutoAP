import { describe, expect, it } from 'vitest';
import { fallbackWorkerSeconds, measuredWorkerSeconds, sweepSeconds, workerSecondsOf, workerSecondsPerChain } from './speed';

describe('sweep speed', () => {
  it('reads worker-seconds per chain off a run: minutes x 60 x workers / chains', () => {
    expect(workerSecondsOf({ ascensions: 2, chainsPriced: 307, run: { minutes: 7, workers: 7 } })).toBeCloseTo(9.58, 2);
    expect(workerSecondsOf({ ascensions: 2, chainsPriced: 307 })).toBeNull();
  });

  // The two real runs that showed the old estimates were wrong.
  it("estimates an 8-core desktop's M1 at about the 7 minutes it took, not the 2 the old figure said", () => {
    expect(sweepSeconds(307, 7, fallbackWorkerSeconds(2)) / 60).toBeCloseTo(6.9, 0);
  });

  it('uses the board median where enough exhaustive runs agree, and ignores staged runs', () => {
    const rows = [
      { ascensions: 3, chainsPriced: 2077, run: { minutes: 16.9, workers: 9 }, space: {} },
      { ascensions: 3, chainsPriced: 3793, run: { minutes: 28.5, workers: 15 }, space: {} },
      { ascensions: 3, chainsPriced: 100, run: { minutes: 100, workers: 1 } }, // staged: not counted
      { ascensions: 4, chainsPriced: 500, run: { minutes: 10, workers: 7 }, space: {} }, // one run: not enough
    ];
    const m = measuredWorkerSeconds(rows);
    expect(m.get(3)?.runs).toBe(2);
    expect(m.get(3)?.seconds).toBeCloseTo((4.39 + 6.76) / 2, 1);
    expect(m.has(4)).toBe(false);
    expect(workerSecondsPerChain(4, m)).toBe(fallbackWorkerSeconds(4));
  });

  it('grows past the table for very long chains', () => {
    expect(fallbackWorkerSeconds(10)).toBe(19);
    expect(fallbackWorkerSeconds(1)).toBe(fallbackWorkerSeconds(2));
  });
});
