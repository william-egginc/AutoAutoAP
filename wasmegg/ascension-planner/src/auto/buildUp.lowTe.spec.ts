/**
 * "Continue my build-up" when its I1 can't max the habs (auto/buildUp.ts), every shift stubbed as in
 * buildUp.spec.ts: the I1 shift (capped at 4 hours, shifts/i1.ts) is followed by PR 717's rounds from
 * round 2 (ascension.ts `continueOpeningRounds`), at any TE; and C2/K2/R1 are dropped when they buy
 * nothing, as in a fresh build. An I1 that maxes the habs is followed by no rounds.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EngineState, ShiftResult } from './types';

let i1Maxes = false;
let c2Buys = false;
const ran: string[] = [];

const result = (name: string, s: EngineState, seconds: number, egg?: string, buys = false): ShiftResult => {
  ran.push(name);
  return {
    actions: [
      ...(egg ? [{ type: 'shift', payload: { toEgg: egg } }] : []),
      ...(buys ? [{ type: 'buy_research', payload: {} }] : []),
    ] as never[],
    elapsedSeconds: seconds,
    endState: { ...s, ...(egg ? { currentEgg: egg, bankValue: 0, population: 1 } : {}) } as EngineState,
  };
};

vi.mock('./shifts/c1', () => ({ runC1: (s: EngineState) => result('C1', s, 1800) }));
vi.mock('./shifts/k1', () => ({ runK1: (s: EngineState) => result('K1 shift', s, 1800, 'kindness', true) }));
vi.mock('./shifts/i1', () => ({
  runI1: (s: EngineState) => {
    const r = result('I1 shift', s, 4 * 3600, 'integrity', true);
    return i1Maxes ? { ...r, endState: { ...r.endState, habIds: [18, 18, 18, 18] } } : r;
  },
  habsMaxed: (s: EngineState) => s.habIds.every(id => id === 18),
  I1_TIME_LIMIT_SECONDS: 4 * 3600,
}));
vi.mock('./shifts/c2', () => ({ runC2: (s: EngineState) => result('C2 shift', s, 14400, 'curiosity', c2Buys) }));
vi.mock('./shifts/k2', () => ({ runK2: (s: EngineState) => result('K2 shift', s, 99999, 'kindness', true) }));
vi.mock('./shifts/r1', () => ({ runR1: (s: EngineState) => result('R1 shift', s, 3600, 'resilience', true) }));
vi.mock('./shifts/helpers/vehicles', () => ({
  runVehiclesForTimeLimit: (s: EngineState) => result('K1 in place', s, 99999),
  runMaxVehiclesPlan: (s: EngineState) => result('K2 in place', s, 99999),
}));
vi.mock('./shifts/helpers/habs', () => ({
  runHabPurchasePlan: (s: EngineState) => result('I1 in place', s, 99999),
}));
vi.mock('./shifts/helpers/silos', () => ({
  runSiloBudgetPlan: (s: EngineState) => result('R1 in place', s, 99999),
}));
vi.mock('./shifts/helpers/milestones', () => ({
  runBuyResearchLevelByLevel: (s: EngineState) => ({ actions: [], elapsedSeconds: 99999, endState: s }),
  runTierUnlockMilestone: (s: EngineState) => ({ actions: [], elapsedSeconds: 0, endState: s }),
  runSmartBuyForSeconds: (s: EngineState) => ({ actions: [], elapsedSeconds: 0, endState: s }),
}));
vi.mock('@/calculations/commonResearch', () => ({ getResearchById: () => null, isTierUnlocked: () => true }));
vi.mock('./hold', () => ({
  eggOfShift: () => null,
  holdForPlayer: (s: EngineState, _c: unknown, _t: number, e: number) => ({
    heldSeconds: 0,
    actions: [],
    state: s,
    elapsedSeconds: e,
  }),
}));
vi.mock('./ascension', async () => {
  const real = await vi.importActual<typeof import('./ascension')>('./ascension');
  return {
    ...real,
    continueOpeningRounds: (base: { actions: never[]; elapsedSeconds: number; endState: EngineState }, _c: unknown, first: number) => {
      ran.push(`rounds from ${first}`);
      return {
        actions: [...base.actions, { type: 'shift', payload: { toEgg: 'integrity' } }],
        endState: { ...base.endState, habIds: [18, 18, 18, 18], lowTeOpening: 3 },
        elapsedSeconds: base.elapsedSeconds + 9 * 3600,
        shiftTimings: [],
      };
    },
  };
});

const { runBuildUpUntilC3 } = await import('./buildUp');

const farm = (o: Partial<EngineState> = {}): EngineState =>
  ({
    currentEgg: 'kindness',
    habIds: [5, 5, null, null],
    vehicles: [{ vehicleId: 3, trainLength: 1 }],
    bankValue: 0,
    population: 1e3,
    lastStepTime: 0,
    researchLevels: {},
    te: 93,
    ...o,
  }) as EngineState;

beforeEach(() => {
  i1Maxes = false;
  c2Buys = false;
  ran.length = 0;
});

describe("continue my build-up when I1 can't max the habs", () => {
  it('carries on with the rounds from round 2 after the capped I1, and drops a C2 that buys nothing', () => {
    const pre = runBuildUpUntilC3(farm(), {} as never);
    expect(ran).toContain('I1 shift');
    expect(ran).toContain('rounds from 2');
    expect(pre.state.lowTeOpening).toBe(3);
    expect(pre.shifted).toEqual(['K1', 'I1', 'K2', 'R1']);
    expect(ran).toContain('C2 shift'); // simulated, then dropped
  });

  it('keeps a C2 that buys something', () => {
    c2Buys = true;
    const pre = runBuildUpUntilC3(farm(), {} as never);
    expect(pre.shifted).toEqual(['K1', 'I1', 'C2', 'K2', 'R1']);
  });

  it('runs no rounds when the I1 maxes the habs', () => {
    i1Maxes = true;
    const pre = runBuildUpUntilC3(farm(), {} as never);
    expect(ran).not.toContain('rounds from 2');
    expect(pre.state.lowTeOpening).toBeUndefined();
  });

  it('works the same at any TE (no TE 120 gate any more)', () => {
    const pre = runBuildUpUntilC3(farm({ te: 300 }), {} as never);
    expect(ran).toContain('rounds from 2');
    expect(pre.state.lowTeOpening).toBe(3);
  });
});
