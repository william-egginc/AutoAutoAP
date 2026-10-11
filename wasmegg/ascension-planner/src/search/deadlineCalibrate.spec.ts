import { describe, expect, it } from 'vitest';
import { CALIBRATE_FULL_LEGS, CALIBRATE_MAX_HIDDEN, byDatePlan, nextWorkerSecondsPerLeg } from './deadlineEstimate';

describe('nextWorkerSecondsPerLeg', () => {
  it('takes the first measurement as it is', () => {
    expect(nextWorkerSecondsPerLeg({ previous: 0, measured: 3.5, legs: 60 })).toBe(3.5);
  });

  it('blends a short run in by the legs it simulated', () => {
    // A 7-minute run (~2,000 legs) moves the remembered speed a tenth of the way, not all of it.
    expect(nextWorkerSecondsPerLeg({ previous: 3, measured: 5, legs: CALIBRATE_FULL_LEGS / 10 })).toBeCloseTo(3.2, 6);
    expect(nextWorkerSecondsPerLeg({ previous: 3, measured: 5, legs: CALIBRATE_FULL_LEGS })).toBe(5);
    expect(nextWorkerSecondsPerLeg({ previous: 3, measured: 5, legs: 10 * CALIBRATE_FULL_LEGS })).toBe(5);
  });

  it('keeps the old speed when the run was mostly hidden, or measured nothing', () => {
    expect(
      nextWorkerSecondsPerLeg({ previous: 3, measured: 12, legs: 50_000, hidden: CALIBRATE_MAX_HIDDEN + 0.1 })
    ).toBe(3);
    expect(nextWorkerSecondsPerLeg({ previous: 3, measured: 12, legs: 50_000, hidden: 0.2 })).toBe(12);
    expect(nextWorkerSecondsPerLeg({ previous: 3, measured: NaN, legs: 50_000 })).toBe(3);
    expect(nextWorkerSecondsPerLeg({ previous: 0, measured: 0, legs: 50_000 })).toBe(0);
  });
});

describe('byDatePlan records its workers', () => {
  it('says which worker count its time is for', () => {
    const plan = byDatePlan({
      rows: [{ asc: 2, bands: [[160, 161, 162]] }],
      currentTE: 150,
      lastHi: 250,
      workers: 7,
      workerSecondsPerLeg: 3,
    });
    expect(plan.workers).toBe(7);
  });
});
