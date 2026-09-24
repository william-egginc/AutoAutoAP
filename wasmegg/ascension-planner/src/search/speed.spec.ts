import { describe, expect, it } from 'vitest';
import { fallbackWorkerSeconds, measuredWorkerSeconds, sweepSeconds, workerSecondsOf, workerSecondsPerChain, timeWeightedWorkers } from './speed';

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

describe('time-weighted workers', () => {
  const H = 3600_000;
  it('is the plain count when it never changed', () => {
    expect(timeWeightedWorkers(0, 1000, 8, 1000, 1000 + 2 * H)).toBe(8);
  });
  it('weights each count by how long it ran', () => {
    // 4 h on 4 workers banked, then 10 min on 16.
    const start = 1_000_000;
    const changed = start + 4 * H;
    expect(timeWeightedWorkers(4 * H * 4, changed, 16, start, changed + H / 6)).toBe(4.5);
  });
  it('falls back to the current count with no run to weigh', () => {
    expect(timeWeightedWorkers(0, 0, 7, 0, 0)).toBe(7);
  });
});
