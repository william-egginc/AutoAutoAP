/**
 * AWAKE HOURS FOR PURCHASE WAITS (spec-awakebuys, 9 Nov 2026; aaap-tools notes/awake-buys-design-2026-11-09.md).
 *
 * With the player's hours (`context.holdUntil`, set only by search/leg.ts legContext) a wait that would END while the
 * player is away is stretched to the next moment they are around, the farm laying meanwhile, so the purchase that follows
 * happens inside their hours. Both wait helpers do it: `advanceTimeFlat` (vehicles, habs, silos) and
 * `advanceTimeWithBoundaries` (C3, milestones). Policy (Jordan, 9 Nov 2026: keep the sale-end cap): a wait that ends inside a
 * research sale is not stretched past the sale's end (the player stays up for the last sale buys). Without `holdUntil`
 * nothing changes (tables, the manual planner and every run without hours).
 *
 * These FAIL before the change: the waits end where they always did, away from the hours.
 */
import { describe, expect, test } from 'vitest';
import { modifiersFromColleggtibleTiers } from 'lib/collegtibles';
import type { EngineState, SimulationContext } from '../../types';
import type { Action } from '@/types/actions/meta';
import { advanceTimeFlat, advanceTimeWithBoundaries } from './advanceTime';
import { getNextSaleEnd, getNextSaleStart } from 'lib/planners/events';

function fakeState(overrides: Partial<EngineState> = {}): EngineState {
  return {
    currentEgg: 'curiosity',
    shiftCount: 0,
    te: 0,
    soulEggs: 0,
    bankValue: 0,
    habIds: [0, null, null, null],
    vehicles: [{ vehicleId: 0, trainLength: 1 }],
    researchLevels: {},
    siloCount: 2,
    tankLevel: 0,
    artifactLoadout: [],
    activeArtifactSet: null,
    artifactSets: { earnings: null, elr: null },
    fuelTankAmounts: {} as EngineState['fuelTankAmounts'],
    eggsDelivered: {} as EngineState['eggsDelivered'],
    teEarned: {} as EngineState['teEarned'],
    population: 1e18,
    lastStepTime: 0,
    activeSales: { research: false, hab: false, vehicle: false },
    earningsBoost: { active: false, multiplier: 1 },
    ...overrides,
  };
}

function fakeContext(overrides: Partial<SimulationContext> = {}): SimulationContext {
  return {
    epicResearchLevels: {},
    colleggtibleModifiers: modifiersFromColleggtibleTiers({}),
    ascensionStartTime: 0,
    planStartOffset: 0,
    assumeDoubleEarnings: false,
    deferForEarningsMode: false,
    ...overrides,
  };
}

// A Tuesday, clear of any sale (Friday to Saturday) and any Monday boost.
const anchor = Date.UTC(2024, 0, 2, 3, 0, 0) / 1000;
const wakes = anchor + 4 * 3600;
/** The player is away until `wakes`. */
const away = (t: number) => (t < wakes ? wakes : t);

describe('advanceTimeFlat with the player away', () => {
  test('a wait ending while the player is away runs to the moment they are back', () => {
    const r = advanceTimeFlat(fakeState(), [], 0, fakeContext({ ascensionStartTime: anchor, holdUntil: away }), 600);
    expect(r.elapsedSeconds).toBe(4 * 3600);
    expect(r.currentState.lastStepTime).toBe(4 * 3600);
  });

  test('credits the farm for the whole stretch (the bank grows with the longer wait)', () => {
    const plain = advanceTimeFlat(fakeState(), [], 0, fakeContext({ ascensionStartTime: anchor }), 600);
    const held = advanceTimeFlat(fakeState(), [], 0, fakeContext({ ascensionStartTime: anchor, holdUntil: away }), 600);
    expect(held.currentState.bankValue!).toBeCloseTo(plain.currentState.bankValue! * ((4 * 3600) / 600), 0);
  });

  test('a wait ending while the player is around is unchanged', () => {
    const ctx = fakeContext({ ascensionStartTime: wakes + 3600, holdUntil: away });
    const r = advanceTimeFlat(fakeState(), [], 0, ctx, 600);
    expect(r.elapsedSeconds).toBe(600);
  });

  test('without the hook nothing changes (tables, the manual planner, runs without hours)', () => {
    const r = advanceTimeFlat(fakeState(), [], 0, fakeContext({ ascensionStartTime: anchor }), 600);
    expect(r.elapsedSeconds).toBe(600);
  });
});

describe('advanceTimeWithBoundaries with the player away', () => {
  test('a wait ending while the player is away runs to the moment they are back', () => {
    const actions: Action[] = [];
    const ctx = fakeContext({ ascensionStartTime: anchor, holdUntil: away });
    const r = advanceTimeWithBoundaries(fakeState(), actions, 0, ctx, anchor, 600);
    expect(r.elapsedSeconds).toBe(4 * 3600);
  });

  test('without the hook nothing changes', () => {
    const r = advanceTimeWithBoundaries(fakeState(), [], 0, fakeContext({ ascensionStartTime: anchor }), anchor, 600);
    expect(r.elapsedSeconds).toBe(600);
  });
});

describe('the sale-end cap', () => {
  const saleStart = getNextSaleStart(anchor);
  const saleEnd = getNextSaleEnd(saleStart + 60);
  // Away until well after the sale ends.
  const awayPastSale = (t: number) => (t < saleEnd + 6 * 3600 ? saleEnd + 6 * 3600 : t);

  test('a wait ending inside a research sale is stretched only up to the sale end (the buys stay at the sale price)', () => {
    const start = saleEnd - 900;
    const state = fakeState({ activeSales: { research: true, hab: false, vehicle: false } });
    const ctx = fakeContext({ ascensionStartTime: start, holdUntil: awayPastSale });
    const flat = advanceTimeFlat(state, [], 0, ctx, 300);
    expect(flat.elapsedSeconds).toBe(900);
    const bounded = advanceTimeWithBoundaries(state, [], 0, ctx, start, 300);
    expect(bounded.elapsedSeconds).toBe(900);
  });

  test('the wake-up inside the sale is honoured (the cap only binds when the player is back after the sale ends)', () => {
    const start = saleEnd - 8 * 3600;
    const wakeInSale = saleEnd - 2 * 3600;
    const state = fakeState({ activeSales: { research: true, hab: false, vehicle: false } });
    const ctx = fakeContext({ ascensionStartTime: start, holdUntil: (t: number) => (t < wakeInSale ? wakeInSale : t) });
    const r = advanceTimeFlat(state, [], 0, ctx, 600);
    expect(r.elapsedSeconds).toBe(6 * 3600);
  });
});
