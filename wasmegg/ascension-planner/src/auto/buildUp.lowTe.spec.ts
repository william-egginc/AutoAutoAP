/**
 * LOW-TE GATE (temporary until Joo's PR 717 merges): "Continue my build-up" on the low-TE path
 * (auto/buildUp.ts, auto/lowTeOpening.ts), every shift stubbed as in buildUp.spec.ts. Below TE 120,
 * an I1 shift that would stall past 4 hours is capped and followed by Joo's rounds, and then C2/K2
 * are dropped when they buy nothing. At or above TE 120, or when I1 does not stall, nothing changes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EngineState, ShiftResult } from './types';

let i1Seconds = 99999;
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
vi.mock('./shifts/i1', () => ({ runI1: (s: EngineState) => result('I1 shift', s, i1Seconds, 'integrity') }));
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
vi.mock('./lowTeOpening', async () => {
  const real = await vi.importActual<typeof import('./lowTeOpening')>('./lowTeOpening');
  return {
    ...real,
    runI1Capped: (s: EngineState, _c: unknown, cap: number) => result(`I1 capped ${cap}`, s, cap, 'integrity'),
    runLowTeRounds: (s: EngineState, elapsed: number, _c: unknown, first: number) => {
      ran.push(`rounds from ${first}`);
      return {
        actions: [{ type: 'shift', payload: { toEgg: 'integrity' } }],
        state: { ...s, habIds: [18, 18, 18, 18], lowTeOpening: 3 },
        elapsedSeconds: elapsed + 9 * 3600,
        shiftTimings: [],
        rounds: 3,
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
  i1Seconds = 99999;
  c2Buys = false;
  ran.length = 0;
});

describe('continue my build-up on the low-TE path', () => {
  it('caps a stalling I1 at 4 hours, carries on with the rounds from round 2, and drops a C2 that buys nothing', () => {
    const pre = runBuildUpUntilC3(farm(), {} as never);
    expect(ran).toContain('I1 capped 14400');
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

  it('runs as before when I1 does not stall', () => {
    i1Seconds = 3 * 3600;
    const pre = runBuildUpUntilC3(farm(), {} as never);
    expect(ran).not.toContain('I1 capped 14400');
    expect(pre.state.lowTeOpening).toBeUndefined();
    expect(pre.shifted).toEqual(['K1', 'I1', 'C2', 'K2', 'R1']);
  });

  it('runs as before at or above TE 120, even when I1 stalls', () => {
    const pre = runBuildUpUntilC3(farm({ te: 120 }), {} as never);
    expect(ran).not.toContain('I1 capped 14400');
    expect(pre.state.lowTeOpening).toBeUndefined();
    expect(pre.shifted).toEqual(['K1', 'I1', 'C2', 'K2', 'R1']);
  });
});
