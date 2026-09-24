/**
 * Leg 1's continue rule (search/rules.ts), with the simulator stubbed so each case is exact:
 * continue is taken outright under a week, compared up to six months (winning ties), and dropped
 * past six months; a deadline compares by TE instead of time.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchInputs } from './types';

const DAY = 86400;
let contDays = 0;
let contEndTE = 200;
let fresh: { sale: number; days: number; endTE?: number; buildPhaseEnd?: number }[] = [];
const calls = { c3: 0 };

vi.mock('@/auto/ascension', () => ({
  runUntilShift: () => ({ actions: [], state: {}, elapsedSeconds: 0 }),
  deriveNextStartState: () => ({}),
  runContinueCurrent: () => ({ actions: [], summary: { totalDurationSeconds: contDays * DAY, endTE: contEndTE } }),
  runAscensionFromC3Variant: (_b: unknown, _p: unknown, v: { saleCount: number }) => {
    const f = fresh.find(x => x.sale === v.saleCount)!;
    return { actions: [], summary: { totalDurationSeconds: f.days * DAY, endTE: f.endTE ?? 200 } };
  },
}));
vi.mock('@/auto/shifts/c3', () => ({
  runC3Variants: () => {
    calls.c3++;
    return fresh.map(f => ({ saleCount: f.sale, attemptTier13Unlock: false, impossible: false, buildPhaseEnd: f.buildPhaseEnd ?? 0 }));
  },
}));
vi.mock('@/engine/compute', () => ({ computeSnapshot: () => ({ elr: 1 }) }));
vi.mock('@/lib/artifacts', () => ({
  getArtifactLoadoutFromBackup: () => [],
  getOptimalEarningsSet: () => null,
  getOptimalELRSet: () => [],
}));
vi.mock('@/stores/autoPlanner', () => ({
  pickVariant: (variants: Record<string, { summary: { totalDurationSeconds: number; endTE: number } }>, _o: unknown, byEnd: boolean) =>
    Object.values(variants).reduce((a, b) =>
      byEnd ? (a.summary.endTE >= b.summary.endTE ? a : b) : a.summary.totalDurationSeconds <= b.summary.totalDurationSeconds ? a : b
    ),
}));

const { runLeg } = await import('./leg');

const inputs = (forceContinue = true) =>
  ({
    baseState: { fuelTankAmounts: {}, eggsDelivered: {}, teEarned: {} },
    currentFarmState: { commonResearches: {}, eggType: 52 },
    context: { rawBackup: {} },
    forceContinue,
    planStart: 0,
  }) as unknown as SearchInputs;

const leg1 = (i = inputs(), endOverride?: number) => runLeg(i, {} as never, 0, 250, true, 181, 0, endOverride);

beforeEach(() => {
  calls.c3 = 0;
  contEndTE = 200;
  fresh = [
    { sale: 1, days: 40 },
    { sale: 2, days: 35 },
    { sale: 3, days: 38 },
  ];
});

describe('leg 1 continue rule', () => {
  it('takes continue outright under a week, without pricing the fresh starts', () => {
    contDays = 5;
    fresh = [{ sale: 1, days: 3 }];
    expect(leg1()?.key).toBe('continue');
    expect(calls.c3).toBe(0);
  });

  it('keeps continue between a week and six months unless a fresh start is strictly faster', () => {
    contDays = 35;
    expect(leg1()?.key).toBe('continue'); // a tie goes to continue
    contDays = 34;
    expect(leg1()?.key).toBe('continue');
    contDays = 36;
    expect(leg1()?.key).toBe('2-sale');
  });

  it('does not offer continue at all past six months', () => {
    contDays = 200;
    fresh = [{ sale: 1, days: 400 }];
    expect(leg1()?.key).toBe('1-sale');
  });

  it('without force-continue, continue is just one more candidate and never pinned', () => {
    contDays = 5;
    fresh = [{ sale: 1, days: 3 }];
    expect(leg1(inputs(false))?.key).toBe('1-sale');
    contDays = 30;
    fresh = [{ sale: 1, days: 31 }];
    expect(leg1(inputs(false))?.key).toBe('continue');
  });

  it('by a deadline, compares TE reached, and drops variants whose build ends after it', () => {
    contDays = 20;
    contEndTE = 210;
    fresh = [
      { sale: 1, days: 20, endTE: 212, buildPhaseEnd: 5 * DAY },
      { sale: 3, days: 20, endTE: 230, buildPhaseEnd: 30 * DAY },
    ];
    expect(leg1(inputs(), 20 * DAY)?.key).toBe('1-sale'); // 3-sale cannot finish its build in time
    contEndTE = 212;
    expect(leg1(inputs(), 20 * DAY)?.key).toBe('continue'); // a tie in TE goes to continue
  });
});
