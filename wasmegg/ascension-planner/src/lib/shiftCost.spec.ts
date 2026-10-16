import { describe, expect, it } from 'vitest';
import { nextShiftCost, shiftCost } from 'lib';
import { nextShiftCostAt, plannedShiftsCost, shiftCostAt } from './shiftCost';

describe('shift cost', () => {
  it('at N = shifts done + 1 is the companion’s nextShiftCost(backup)', () => {
    for (const [se, done] of [
      [1e24, 0],
      [1e24, 60],
      [3.7e22, 214],
      [5e25, 66],
      [0, 10],
    ]) {
      const backup = { game: { soulEggsD: se }, virtue: { shiftCount: done } };
      expect(nextShiftCostAt(se, done)).toBeCloseTo(nextShiftCost(backup as never), -1);
      expect(nextShiftCostAt(se, done) / nextShiftCost(backup as never)).toBeCloseTo(1, 12);
      expect(shiftCostAt(se, done + 1)).toBe(shiftCost(se, done));
    }
  });

  it('reproduces the shift-cost report: 66 used, the next 100 cost about 72.68% of SE', () => {
    // Its chart starts near 26 quintillion at shift 67: about 1.26e22 soul eggs.
    const se = 1.264e22;
    expect(shiftCostAt(se, 67) / 1e18).toBeCloseTo(26, 0);
    expect(plannedShiftsCost(se, 66, 100) / se).toBeCloseTo(0.7268, 3);
  });

  it('adds the planned shifts one by one, and nothing for none', () => {
    expect(plannedShiftsCost(1e24, 10, 0)).toBe(0);
    const first = shiftCostAt(1e24, 11);
    // The second is paid out of what the first left.
    expect(plannedShiftsCost(1e24, 10, 2)).toBe(first + shiftCostAt(1e24 - first, 12));
    expect(plannedShiftsCost(1e24, 10, -3)).toBe(0);
  });
});
