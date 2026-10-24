import { describe, expect, it } from 'vitest';
import { eggLines, farmFacts } from './farmFacts';

describe('your eggs from the save', () => {
  it('each egg’s lifetime TE, the way to the next, and when the egg being laid gets it', () => {
    const lines = eggLines(
      { curiosity: 1.5e9, integrity: 5.5e9, humility: 0, resilience: 1e10, kindness: 0 },
      { curiosity: 2, integrity: 1, humility: 0, resilience: 3, kindness: 0 },
      'integrity',
      1e6
    );
    expect(lines.map(l => l.egg)).toEqual(['curiosity', 'integrity', 'humility', 'resilience', 'kindness']);
    expect(lines.map(l => l.te)).toEqual([2, 2, 0, 3, 0]);
    // Integrity: 5.5e9 of the 1e9 → 1e10 stretch is halfway.
    expect(lines[1].progress).toBeCloseTo(0.5, 5);
    expect(lines[1].current).toBe(true);
    expect(lines[1].nextInSeconds).toBeCloseTo(4.5e9 / 1e6, 3);
    expect(lines[0].nextInSeconds).toBeNull();
    expect(eggLines({}, {}, null, null).every(l => l.te === 0 && l.nextInSeconds === null)).toBe(true);
  });

  it('nothing for a save with no virtue farm', () => {
    expect(farmFacts({ farm: null, epic: {}, colleggtibles: { habCap: 1, elr: 1, shippingCap: 1 }, equipped: [] })).toBeNull();
  });

  it('works out a farm with the planner’s own formulas', () => {
    const f = farmFacts({
      farm: {
        eggType: 51,
        cash: 0,
        numSilos: 2,
        commonResearches: {},
        habs: [1, null, null, null],
        vehicles: [{ vehicleId: 0, trainLength: 1 }],
        population: 125,
        deliveredEggs: 0,
        lastStepTime: 0,
        cashEarned: 0,
        cashSpent: 0,
      },
      epic: { silo_capacity: 0 },
      colleggtibles: { habCap: 1, elr: 1, shippingCap: 1 },
      equipped: [],
    })!;
    expect(f.habCapacity).toBeGreaterThan(0);
    expect(f.habFull).toBeCloseTo(125 / f.habCapacity, 6);
    expect(f.elr).toBeGreaterThan(0);
    expect(f.siloMinutes).toBe(120);
  });
});
