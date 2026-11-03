/**
 * K2 (shifts/k2.ts) maxes vehicles with a time budget, K2_TIME_LIMIT_SECONDS, instead of without
 * limit: on weak gear at low TE an uncapped K2 waited up to 7.7 h, and ~130 years with no gear at TE 60.
 * The in-place K2 of Continue my build-up (auto/buildUp.ts) uses the same budget.
 */
import { describe, expect, it, vi } from 'vitest';

const limits: number[] = [];
vi.mock('./helpers/vehicles', () => ({
  runMaxVehiclesPlan: (s: unknown, _c: unknown, limit: number) => {
    limits.push(limit);
    return { actions: [], elapsedSeconds: 0, endState: s };
  },
  runVehiclesForTimeLimit: (s: unknown) => ({ actions: [], elapsedSeconds: 0, endState: s }),
}));
vi.mock('./helpers/actionHelpers', () => ({
  applyShiftIfNeeded: (s: unknown) => ({ state: s, actions: [] }),
}));

const { runK2, K2_TIME_LIMIT_SECONDS } = await import('./k2');

describe('K2 has a time budget', () => {
  it('is 8 hours', () => {
    expect(K2_TIME_LIMIT_SECONDS).toBe(8 * 3600);
  });
  it('runK2 passes it to the vehicle planner', () => {
    limits.length = 0;
    runK2({ currentEgg: 'kindness' } as never, {} as never);
    expect(limits).toEqual([K2_TIME_LIMIT_SECONDS]);
  });
});
