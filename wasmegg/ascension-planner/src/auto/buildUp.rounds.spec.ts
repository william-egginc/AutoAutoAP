/**
 * "Continue my build-up" with Joo's opening rounds (auto/buildUp.ts, ascension.ts runC1K1I1Segment),
 * every shift stubbed as in buildUp.spec.ts. An I1 shift is capped at Joo's 4 hours; when that leaves
 * the habs unmaxed the build carries on with the rounds from round 2. C2/K2 are dropped when they buy
 * nothing, at any TE.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EngineState, ShiftResult } from './types';

let i1Seconds = 99999;
let c2Buys = false;
const ran: string[] = [];
const CU = 18;
const CAP = 4 * 3600;

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
  I1_TIME_LIMIT_SECONDS: 4 * 3600,
  habsMaxed: (s: EngineState) => s.habIds.every(id => id === 18),
  // Stops at its cap with the habs unmaxed when it would need longer.
  runI1: (s: EngineState, _c: unknown, cap: number) => {
    const r = result(`I1 shift cap ${cap}`, s, Math.min(i1Seconds, cap), 'integrity', true);
    if (i1Seconds <= cap) r.endState.habIds = [CU, CU, CU, CU];
    return r;
  },
}));
vi.mock('./shifts/c2', () => ({
  runC2: (s: EngineState) => result('C2 shift', s, 14400, 'curiosity', c2Buys),
  runR1LookaheadEarningsBuy: (s: EngineState) => ({ actions: [], elapsedSeconds: 0, endState: s }),
}));
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
vi.mock('./ascension', () => ({
  SKIP_WHEN_NO_PURCHASES: new Set(['C2', 'K2']),
  isPurchase: (a: { type: string }) => a.type.startsWith('buy_'),
  tagShiftName: (actions: { type: string; payload: Record<string, unknown> }[], name: string) => {
    const s = actions.find(a => a.type === 'shift');
    if (s) s.payload.autoShiftName = name;
  },
  runC1K1I1Segment: (s: EngineState, _c: unknown, first: number, elapsed: number) => {
    ran.push(`rounds from ${first} at ${elapsed}`);
    return {
      actions: [{ type: 'shift', payload: { toEgg: 'integrity' } }],
      endState: { ...s, habIds: [CU, CU, CU, CU] },
      elapsedSeconds: 9 * 3600,
      shiftTimings: [],
      rounds: 3,
    };
  },
}));

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

describe('continue my build-up with the opening rounds', () => {
  it('caps I1 at 4 hours, carries on with the rounds from round 2, and drops a C2 that buys nothing', () => {
    const pre = runBuildUpUntilC3(farm(), {} as never);
    expect(ran).toContain(`I1 shift cap ${CAP}`);
    // K1 shift 1800 s, then I1 at its cap: the rounds start where I1 stopped.
    expect(ran).toContain(`rounds from 2 at ${1800 + CAP}`);
    expect(pre.state.habIds).toEqual([CU, CU, CU, CU]);
    expect(pre.shifted).toEqual(['K1', 'I1', 'K2', 'R1']);
    expect(ran).toContain('C2 shift'); // simulated, then dropped
    expect(pre.elapsedSeconds).toBe(1800 + CAP + 9 * 3600 + 99999 + 3600);
  });

  it('keeps a C2 that buys something', () => {
    c2Buys = true;
    const pre = runBuildUpUntilC3(farm(), {} as never);
    expect(pre.shifted).toEqual(['K1', 'I1', 'C2', 'K2', 'R1']);
  });

  it('runs no rounds when I1 maxes the habs inside its cap, at any TE', () => {
    i1Seconds = 3 * 3600;
    for (const te of [93, 300]) {
      ran.length = 0;
      const pre = runBuildUpUntilC3(farm({ te }), {} as never);
      expect(ran.some(r => r.startsWith('rounds'))).toBe(false);
      expect(pre.shifted).toEqual(['K1', 'I1', 'K2', 'R1']);
    }
  });

  it('names its shifts, as a fresh build does', () => {
    c2Buys = true;
    const pre = runBuildUpUntilC3(farm({ te: 300 }), {} as never);
    const names = pre.actions
      .filter(a => a.type === 'shift')
      .map(a => (a.payload as { autoShiftName?: string }).autoShiftName);
    // The rounds' own shifts are named inside runC1K1I1Segment (stubbed here, unnamed).
    expect(names).toEqual(['K1', 'I1', undefined, 'C2', 'K2', 'R1']);
  });
});
