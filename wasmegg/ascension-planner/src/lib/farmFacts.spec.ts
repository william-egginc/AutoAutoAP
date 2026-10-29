import { describe, expect, it } from 'vitest';
import { eggLines, farmFacts, nextTeLine, NEXT_TE_CAP_DAYS } from './farmFacts';
import { getThresholdForTE } from './truthEggs';

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

  it('to goal (ux29-d): the egg being laid, the TE still to earn from its own thresholds at the save\'s rate', () => {
    const d = { curiosity: 1.5e9, integrity: 5.5e9, humility: 0, resilience: 1e10, kindness: 0 };
    // Integrity has passed 2 thresholds; 2 TE more to the goal is its 4th, at 7e10 eggs.
    const lines = eggLines(d, {}, 'integrity', 1e6, 2);
    expect(lines[1].goalInSeconds).toBeCloseTo((7e10 - 5.5e9) / 1e6, 3);
    expect(lines[0].goalInSeconds).toBeNull();
    // No goal known, or the goal reached: none.
    expect(eggLines(d, {}, 'integrity', 1e6)[1].goalInSeconds).toBeNull();
    expect(eggLines(d, {}, 'integrity', 1e6, 0)[1].goalInSeconds).toBeNull();
    // More TE than the egg has left (ux35-a, pieha): to its last TE, the rest from the other eggs.
    expect(eggLines(d, {}, 'integrity', 1e6, 500)[1].goalInSeconds).toBeCloseTo((getThresholdForTE(98) - 5.5e9) / 1e6, 3);
    // No TE left on the egg: none.
    expect(eggLines({ ...d, integrity: getThresholdForTE(98) }, {}, 'integrity', 1e6, 5)[1].goalInSeconds).toBeNull();
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

describe('nextTeLine (Your eggs, the line under each egg)', () => {
  const egg = { egg: 'curiosity' as const, te: 10, progress: 0.13, current: true, nextInSeconds: 0 };
  const DAY = 86400;
  it('the egg being laid: when, at the save\'s rate, less the time since the save', () => {
    expect(nextTeLine({ ...egg, nextInSeconds: 5 * DAY }, 1e9 + DAY, 1e9)).toBe("next TE in 4d at your save's rate");
    expect(nextTeLine({ ...egg, nextInSeconds: DAY }, 1e9 + 2 * DAY, 1e9)).toBe('next TE likely reached since your save');
  });
  it('over about 10 years: "not at this rate", never "in 57308 days"', () => {
    expect(nextTeLine({ ...egg, nextInSeconds: 57308 * DAY }, 1e9, 1e9)).toBe('next TE: not at this rate (over 10 years)');
    expect(nextTeLine({ ...egg, nextInSeconds: NEXT_TE_CAP_DAYS * DAY }, 1e9, 1e9)).toBe("next TE in 10 years at your save's rate");
    expect(nextTeLine({ ...egg, nextInSeconds: NEXT_TE_CAP_DAYS * DAY + 60 }, 1e9, 1e9)).toBe('next TE: not at this rate (over 10 years)');
  });
  it('to goal beside it when a goal and a rate are known, less the time since the save; never over 10 years', () => {
    const at = { ...egg, nextInSeconds: 3 * 3600 + 20 * 60 };
    expect(nextTeLine({ ...at, goalInSeconds: 4 * DAY + 5 * 3600 }, 1e9, 1e9)).toBe('next TE in 3h 20m · to goal about 4d 5h at this rate');
    expect(nextTeLine({ ...at, goalInSeconds: 4 * DAY + 5 * 3600 + 3600 }, 1e9 + 3600, 1e9)).toBe(
      'next TE in 2h 20m · to goal about 4d 5h at this rate'
    );
    expect(nextTeLine({ ...at, goalInSeconds: (NEXT_TE_CAP_DAYS + 1) * DAY }, 1e9, 1e9)).toBe("next TE in 3h 20m at your save's rate");
    expect(nextTeLine({ ...at, goalInSeconds: null }, 1e9, 1e9)).toBe("next TE in 3h 20m at your save's rate");
  });
  it('the other eggs: after a shift; no rate: the share only', () => {
    expect(nextTeLine({ ...egg, current: false }, 1e9, 1e9)).toBe('13% to the next TE · after a shift');
    expect(nextTeLine({ ...egg, nextInSeconds: null }, 1e9, 1e9)).toBe('13% to the next TE');
  });
});
