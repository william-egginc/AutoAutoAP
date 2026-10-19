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

const result = (name: string, s: EngineState, seconds: number, egg?: string): ShiftResult => {
  ran.push(name);
  return {
    actions: [{ type: egg ? 'shift' : 'buy', payload: { toEgg: egg } } as never],
    elapsedSeconds: seconds,
    endState: { ...s, ...(egg ? { currentEgg: egg, bankValue: 0, population: 1 } : {}) } as EngineState,
  };
};

vi.mock('./shifts/c1', () => ({ runC1: (s: EngineState) => result('C1', s, 1800) }));
vi.mock('./shifts/k1', () => ({ runK1: (s: EngineState) => result('K1 shift', s, 1800, 'kindness') }));
vi.mock('./shifts/i1', () => ({
  I1_TIME_LIMIT_SECONDS: 4 * 3600,
  habsMaxed: () => true,
  runI1: (s: EngineState) => result('I1 shift', s, 99999, 'integrity'),
}));
vi.mock('./shifts/c2', () => ({
  runC2: (s: EngineState) => result('C2 shift', s, 14400, 'curiosity'),
  runR1LookaheadEarningsBuy: (s: EngineState) => ({ actions: [], elapsedSeconds: 0, endState: s }),
}));
vi.mock('./shifts/k2', () => ({ runK2: (s: EngineState) => result('K2 shift', s, 99999, 'kindness') }));
vi.mock('./shifts/r1', () => ({ runR1: (s: EngineState) => result('R1 shift', s, 3600, 'resilience') }));
vi.mock('./shifts/helpers/vehicles', () => ({
  runVehiclesForTimeLimit: (s: EngineState) => result('K1 in place', s, inPlace.K1 ?? 0),
  runMaxVehiclesPlan: (s: EngineState) => result('K2 in place', s, inPlace.K2 ?? 0),
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
// The opening rounds and the C2/K2 skip are covered by buildUp.rounds.spec.ts; here every shift buys.
vi.mock('./ascension', () => ({
  SKIP_WHEN_NO_PURCHASES: new Set<string>(),
  isPurchase: () => true,
  tagShiftName: () => {},
  runC1K1I1Segment: () => {
    throw new Error('no rounds here');
  },
}));
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
  it('buys a finished farm\'s leftovers where it is: no shift, no reset, and C3 stays on Curiosity', () => {
    inPlace = { K2: 30, R1: 10 };
    const pre = runBuildUpUntilC3(farm(), {} as never);
    expect(ran).toEqual(['K1 in place', 'I1 in place', 'K2 in place', 'R1 in place']);
    expect(pre.shifted).toEqual([]);
    expect(pre.elapsedSeconds).toBe(40);
    expect(pre.state.bankValue).toBe(1e40);
    expect(pre.state.population).toBe(1e10);
    expect(pre.stayOnCuriosity).toBe(true);
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
});
