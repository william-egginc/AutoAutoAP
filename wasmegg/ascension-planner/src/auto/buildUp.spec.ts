/**
 * Continue my build-up's walk to C3 (auto/buildUp.ts), with every shift and purchase helper stubbed:
 * a step whose purchases take no time to speak of is bought where the farm is, without its shift
 * (which would reset the farm's chickens and cash); a longer one runs exactly as a fresh build runs
 * it; C1 only on a farm that has bought nothing but research.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EngineState, ShiftResult } from './types';

/** Seconds each step's in-place purchases take (the trial), by step name. */
let inPlace: Record<string, number> = {};
const ran: string[] = [];
const vehicleLimits: number[] = [];

const result = (name: string, s: EngineState, seconds: number, egg?: string): ShiftResult => {
  ran.push(name);
  // A step with no entry in `inPlace` has nothing to buy, in place or after its shift (the vehicle
  // planner stands for K1's and K2's both).
  const key = name.slice(0, 2);
  const buys = inPlace[key] !== undefined || (name === 'K2 in place' && inPlace.K1 !== undefined);
  return {
    actions: [
      ...(egg ? [{ type: 'shift', payload: { toEgg: egg } } as never] : []),
      ...(buys ? [{ type: 'buy_vehicle', payload: {} } as never] : []),
    ],
    elapsedSeconds: seconds,
    endState: { ...s, ...(egg ? { currentEgg: egg, bankValue: 0, population: 1 } : {}) } as EngineState,
  };
};

vi.mock('./shifts/c1', () => ({ runC1: (s: EngineState) => result('C1', s, 1800) }));
vi.mock('./shifts/k1', () => ({ runK1: (s: EngineState) => result('K1 shift', s, 1800, 'kindness') }));
vi.mock('./shifts/i1', () => ({
  // Maxes the habs, buying them (a capped I1 that can't goes on to the rounds: buildUp.lowTe.spec.ts).
  runI1: (s: EngineState) => {
    const r = result('I1 shift', s, 99999, 'integrity');
    return {
      ...r,
      actions: [...r.actions, { type: 'buy_hab', payload: {} } as never],
      endState: { ...r.endState, habIds: [18, 18, 18, 18] },
    };
  },
  habsMaxed: (s: EngineState) => s.habIds.every(id => id === 18),
  I1_TIME_LIMIT_SECONDS: 4 * 3600,
}));
vi.mock('./shifts/c2', () => ({ runC2: (s: EngineState) => result('C2 shift', s, 14400, 'curiosity') }));
vi.mock('./shifts/k2', () => ({ K2_TIME_LIMIT_SECONDS: 24 * 3600, runK2: (s: EngineState) => result('K2 shift', s, 99999, 'kindness') }));
vi.mock('./shifts/r1', () => ({ runR1: (s: EngineState) => result('R1 shift', s, 3600, 'resilience') }));
vi.mock('./shifts/helpers/vehicles', () => ({
  runVehiclesForTimeLimit: (s: EngineState) => result('K1 in place', s, inPlace.K1 ?? 0),
  runMaxVehiclesPlan: (s: EngineState, _c: unknown, limit: number) => {
    vehicleLimits.push(limit);
    return result('K2 in place', s, inPlace.K2 ?? 0);
  },
}));
vi.mock('./shifts/helpers/habs', () => ({
  runHabPurchasePlan: (s: EngineState) => result('I1 in place', s, inPlace.I1 ?? 0),
}));
vi.mock('./shifts/helpers/silos', () => ({
  runSiloBudgetPlan: (s: EngineState) => result('R1 in place', s, inPlace.R1 ?? 0),
}));
vi.mock('./shifts/helpers/milestones', () => ({
  runBuyResearchLevelByLevel: (s: EngineState) => ({ actions: [], elapsedSeconds: inPlace.C2 ?? 0, endState: s }),
  runTierUnlockMilestone: (s: EngineState) => ({ actions: [], elapsedSeconds: 0, endState: s }),
}));
vi.mock('@/calculations/commonResearch', () => ({ getResearchById: () => null, isTierUnlocked: () => true }));
vi.mock('./hold', () => ({
  eggOfShift: () => null,
  holdForPlayer: (s: EngineState, _c: unknown, _t: number, e: number) => ({ heldSeconds: 0, actions: [], state: s, elapsedSeconds: e }),
}));

const { runBuildUpUntilC3, stillInC1, IN_PLACE_SECONDS } = await import('./buildUp');

const farm = (o: Partial<EngineState> = {}): EngineState =>
  ({
    currentEgg: 'curiosity',
    habIds: [18, 18, 18, 18],
    vehicles: [{ vehicleId: 11, trainLength: 6 }],
    bankValue: 1e40,
    population: 1e10,
    lastStepTime: 0,
    researchLevels: {},
    ...o,
  }) as EngineState;

beforeEach(() => {
  inPlace = {};
  ran.length = 0;
});

describe('continue my build-up, up to C3', () => {
  it('a step with nothing to buy is skipped, shift and all: a finished farm stays on Curiosity', () => {
    const pre = runBuildUpUntilC3(farm(), {} as never);
    expect(ran).not.toContain('K1 shift');
    expect(ran).not.toContain('I1 shift');
    expect(ran).not.toContain('K2 shift');
    expect(pre.shifted).toEqual([]);
    expect(pre.state.bankValue).toBe(1e40);
    expect(pre.stayOnCuriosity).toBe(true);
  });

  it('buys only on its own egg (Jordan): quick leftovers on another egg still shift there first', () => {
    inPlace = { I1: 30, R1: 10 };
    const pre = runBuildUpUntilC3(farm({ habIds: [16, 16, null, null] }), {} as never);
    expect(pre.shifted).toEqual(['I1', 'R1']);
    expect(ran).toContain('I1 shift');
    expect(ran).toContain('R1 shift');
    expect(pre.state.currentEgg).toBe('resilience');
    expect(pre.stayOnCuriosity).toBe(false);
  });

  it('on the step\'s own egg, quick purchases are bought where the farm is: no shift, no reset', () => {
    inPlace = { K1: 10 };
    const pre = runBuildUpUntilC3(farm({ currentEgg: 'kindness' }), {} as never);
    expect(pre.shifted).toEqual([]);
    expect(ran).not.toContain('K1 shift');
    expect(pre.elapsedSeconds).toBe(10);
    expect(pre.state.bankValue).toBe(1e40);
    expect(pre.state.population).toBe(1e10);
  });

  it('runs a step as a fresh build does, shift and all, when its purchases take longer than the in-place limit', () => {
    inPlace = { I1: IN_PLACE_SECONDS + 1 };
    const pre = runBuildUpUntilC3(farm({ habIds: [16, 16, null, null] }), {} as never);
    expect(pre.shifted).toEqual(['I1']);
    expect(ran).toContain('I1 shift');
    expect(pre.state.currentEgg).toBe('integrity');
    expect(pre.stayOnCuriosity).toBe(false);
  });

  it('runs C1 only on a farm that has bought nothing but research', () => {
    expect(stillInC1(farm({ habIds: [0, null, null, null], vehicles: [{ vehicleId: 0, trainLength: 1 }] }))).toBe(true);
    expect(stillInC1(farm())).toBe(false);
    runBuildUpUntilC3(farm({ habIds: [0, null, null, null], vehicles: [{ vehicleId: 0, trainLength: 1 }] }), {} as never);
    expect(ran[0]).toBe('C1');
    ran.length = 0;
    runBuildUpUntilC3(farm(), {} as never);
    expect(ran).not.toContain('C1');
  });

  it('the in-place K2 has K2\'s 24-hour budget, never an unlimited one', () => {
    vehicleLimits.length = 0;
    inPlace = { K2: 30 };
    runBuildUpUntilC3(farm({ currentEgg: 'kindness' }), {} as never);
    // The last call is K2's trial (K1's nothing-to-buy probe before it is uncapped on purpose).
    expect(vehicleLimits.at(-1)).toBe(24 * 3600);
  });
});
