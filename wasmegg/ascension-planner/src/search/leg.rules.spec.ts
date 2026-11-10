/**
 * Leg 1's continue rule (search/rules.ts), with the simulator stubbed so each case is exact:
 * continue is taken outright under a week, compared up to six months (winning ties), and dropped
 * past six months; a deadline compares by TE instead of time.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchInputs } from './types';
import type { FirstAscension } from './firstAscension';

const DAY = 86400;
let contDays = 0;
let contEndTE = 200;
let fresh: { sale: number; days: number; endTE?: number; buildPhaseEnd?: number }[] = [];
/** Continue my build-up's leg in days, or null: no build-up variant survives (the default, so every
 *  rule above it is tested as it was before the build-up existed). */
let buildUpDays: number | null = null;
let buildUpEndTE = 200;
/** Whether the build-up's build buys anything (NO EMPTY BUILD-UP, search/leg.ts `buildUpBuild`): a C3 variant with a
 *  research purchase, or none. */
let buildUpBuys = true;
const calls = { c3: 0, buildUp: 0 };

vi.mock('@/auto/ascension', () => ({
  isPurchase: (a: { type: string }) => /^buy_/.test(a.type),
  runUntilShift: () => ({ actions: [], state: {}, elapsedSeconds: 0 }),
  deriveNextStartState: () => ({}),
  runContinueCurrent: () => ({
    actions: [],
    summary: { totalDurationSeconds: contDays * DAY, endTime: contDays * DAY, endTE: contEndTE },
  }),
  runAscensionFromC3Variant: (_b: unknown, _p: unknown, v: { saleCount: number }, _c: unknown, _s: unknown, id: string) => {
    if (id.endsWith('_buildup'))
      return {
        actions: [],
        summary: { totalDurationSeconds: buildUpDays! * DAY, endTime: buildUpDays! * DAY, endTE: buildUpEndTE, strategyLabel: '1-sale build' },
      };
    const f = fresh.find(x => x.sale === v.saleCount)!;
    return {
      actions: [],
      summary: { totalDurationSeconds: f.days * DAY, endTime: f.days * DAY, endTE: f.endTE ?? 200 },
    };
  },
}));
vi.mock('@/auto/buildUp', () => ({
  runBuildUpUntilC3: () => ({ actions: [], state: { buildUp: true }, elapsedSeconds: 0, shifted: [], stayOnCuriosity: true }),
}));
vi.mock('@/auto/shifts/c3', () => ({
  runC3Variants: (state: { buildUp?: boolean }) => {
    if (state?.buildUp) {
      calls.buildUp++;
      return buildUpDays === null
        ? []
        : [
            {
              saleCount: 1,
              attemptTier13Unlock: false,
              impossible: false,
              buildPhaseEnd: 0,
              result: { actions: buildUpBuys ? [{ type: 'buy_research' }] : [{ type: 'shift' }] },
            },
          ];
    }
    calls.c3++;
    return fresh.map(f => ({
      saleCount: f.sale,
      attemptTier13Unlock: false,
      impossible: false,
      buildPhaseEnd: f.buildPhaseEnd ?? 0,
    }));
  },
}));
// lib/planners since Joo's PR 731 (leg.ts imports compute from there).
vi.mock('lib/planners/engine/compute', () => ({ computeSnapshot: () => ({ elr: 1 }) }));
vi.mock('@/lib/artifacts', () => ({
  getArtifactLoadoutFromBackup: () => [],
  getOptimalEarningsSet: () => null,
  getOptimalELRSet: () => [],
}));
vi.mock('@/stores/autoPlanner', () => ({
  pickVariant: (
    variants: Record<string, { summary: { totalDurationSeconds: number; endTE: number } }>,
    _o: unknown,
    byEnd: boolean
  ) =>
    Object.values(variants).reduce((a, b) =>
      byEnd
        ? a.summary.endTE >= b.summary.endTE
          ? a
          : b
        : a.summary.totalDurationSeconds <= b.summary.totalDurationSeconds
          ? a
          : b
    ),
}));

const { runLeg } = await import('./leg');

/** Inputs under one first-ascension setting, or (a boolean) as inputs stored before it existed. */
const inputs = (first: FirstAscension | boolean = 'continue') =>
  ({
    baseState: { fuelTankAmounts: {}, eggsDelivered: {}, teEarned: {} },
    currentFarmState: { commonResearches: {}, eggType: 52 },
    context: { rawBackup: {} },
    ...(typeof first === 'boolean' ? { forceContinue: first } : { firstAscension: first }),
    planStart: 0,
  }) as unknown as SearchInputs;

const leg1 = (i = inputs(), endOverride?: number) => runLeg(i, {} as never, 0, 250, true, 181, 0, endOverride);

beforeEach(() => {
  calls.c3 = 0;
  calls.buildUp = 0;
  buildUpDays = null;
  buildUpEndTE = 200;
  buildUpBuys = true;
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

  it('under Fastest (auto), continue is just one more candidate and never pinned', () => {
    contDays = 5;
    fresh = [{ sale: 1, days: 3 }];
    expect(leg1(inputs('auto'))?.key).toBe('1-sale');
    contDays = 30;
    fresh = [{ sale: 1, days: 31 }];
    expect(leg1(inputs('auto'))?.key).toBe('continue');
    // A tie goes to the fresh start, as in Classic with nothing picked.
    fresh = [{ sale: 1, days: 30 }];
    expect(leg1(inputs('auto'))?.key).toBe('1-sale');
  });

  it('under Prestige now (fresh), never continues, even when continuing is far faster', () => {
    contDays = 1;
    fresh = [{ sale: 1, days: 90 }];
    expect(leg1(inputs('fresh'))?.key).toBe('1-sale');
    expect(calls.c3).toBe(1);
    contDays = 20;
    fresh = [{ sale: 1, days: 20, endTE: 205, buildPhaseEnd: 5 * DAY }];
    contEndTE = 230;
    expect(leg1(inputs('fresh'), 20 * DAY)?.key).toBe('1-sale');
  });

  it('reads inputs stored before the setting existed: forceContinue true is Continue Asc., false is Fastest', () => {
    contDays = 5;
    fresh = [{ sale: 1, days: 3 }];
    expect(leg1(inputs(true))?.key).toBe('continue');
    expect(leg1(inputs(false))?.key).toBe('1-sale');
    // Neither field (never written by any build) reads as the default, Fastest.
    const bare = { ...inputs('auto') } as unknown as Record<string, unknown>;
    delete bare.firstAscension;
    expect(leg1(bare as unknown as SearchInputs)?.key).toBe('1-sale');
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

describe('leg 1 records the option it did not take (rival)', () => {
  it('under Fastest, a fresh win records continue as the rival, and a continue win the best fresh build', () => {
    contDays = 50;
    fresh = [
      { sale: 1, days: 40 },
      { sale: 2, days: 35 },
    ];
    const f = leg1(inputs('auto'))!;
    expect(f.key).toBe('2-sale');
    expect(f.rival).toEqual({ key: 'continue', endTime: 50 * DAY });
    contDays = 30;
    const c = leg1(inputs('auto'))!;
    expect(c.key).toBe('continue');
    expect(c.rival).toEqual({ key: '2-sale', endTime: 35 * DAY });
  });

  it('keeps a continue dropped past six months as the rival, so the record says how far off it was', () => {
    contDays = 200;
    fresh = [{ sale: 1, days: 60 }];
    const r = leg1(inputs('auto'))!;
    expect(r.key).toBe('1-sale');
    expect(r.rival).toEqual({ key: 'continue', endTime: 200 * DAY });
  });

  it('has no rival when only one kind was simulated', () => {
    contDays = 5;
    fresh = [{ sale: 1, days: 3 }];
    // Continue Asc. inside a week: taken outright, no fresh build simulated.
    expect(leg1(inputs('continue'))!.rival).toBeUndefined();
    // Prestige now: continue never simulated.
    expect(leg1(inputs('fresh'))!.rival).toBeUndefined();
    // No farm in the save.
    const noFarm = { ...inputs('auto'), currentFarmState: null } as unknown as SearchInputs;
    expect(leg1(noFarm)!.rival).toBeUndefined();
    // Not leg 1.
    expect(runLeg(inputs('auto'), {} as never, 0, 250, false, 181, 1)!.rival).toBeUndefined();
  });
});

describe('leg 1: continue my build-up', () => {
  it('under Fastest, the build-up is one more candidate: taken only when strictly sooner than a fresh start', () => {
    contDays = 80;
    buildUpDays = 30;
    const b = leg1(inputs('auto'))!;
    expect(b.key).toBe('buildup');
    expect(b.rival).toEqual({ key: '2-sale', endTime: 35 * DAY });
    expect(b.firstLegEnds).toEqual({ continue: 80 * DAY, buildup: 30 * DAY, fresh: 35 * DAY });
    // A tie with the best fresh start goes to the fresh start.
    buildUpDays = 35;
    expect(leg1(inputs('auto'))!.key).toBe('2-sale');
    // Continue as the farm is still wins when it is sooner than both.
    contDays = 20;
    const c = leg1(inputs('auto'))!;
    expect(c.key).toBe('continue');
    expect(c.rival).toEqual({ key: '2-sale', endTime: 35 * DAY });
  });

  it('under Continue my build-up, takes the sooner of building on and continuing as it is, pricing no fresh start', () => {
    contDays = 80;
    buildUpDays = 50;
    fresh = [{ sale: 1, days: 10 }];
    const b = leg1(inputs('buildup'))!;
    expect(b.key).toBe('buildup');
    expect(b.rival).toEqual({ key: 'continue', endTime: 80 * DAY });
    expect(calls.c3).toBe(0);
    contDays = 40;
    expect(leg1(inputs('buildup'))!.key).toBe('continue');
    // A tie goes to continue (spec-noemptybuild: a build-up no sooner than continue is continue with extra shifts).
    contDays = 50;
    expect(leg1(inputs('buildup'))!.key).toBe('continue');
  });

  it('under Continue my build-up with neither possible, falls back to a fresh start', () => {
    contDays = 200; // past six months: not a candidate
    buildUpDays = null;
    expect(leg1(inputs('buildup'))!.key).toBe('2-sale');
  });

  it('under Finish without buying, is only recorded (for the note), never taken nor the rival', () => {
    contDays = 30;
    buildUpDays = 1;
    const c = leg1(inputs('continue'))!;
    expect(c.key).toBe('continue');
    expect(c.rival).toEqual({ key: '2-sale', endTime: 35 * DAY });
    expect(c.firstLegEnds).toEqual({ continue: 30 * DAY, buildup: 1 * DAY, fresh: 35 * DAY });
  });

  it('is never simulated under Prestige now, nor past leg 1', () => {
    contDays = 30;
    buildUpDays = 1;
    expect(leg1(inputs('fresh'))!.key).toBe('2-sale');
    runLeg(inputs('auto'), {} as never, 0, 250, false, 181, 1);
    expect(calls.buildUp).toBe(0);
  });

  it('works out the build-up once per run and plan start, whatever the checkpoint', () => {
    contDays = 80;
    buildUpDays = 30;
    const i = inputs('auto');
    runLeg(i, {} as never, 0, 250, true, 181, 0);
    runLeg(i, {} as never, 0, 260, true, 181, 0);
    expect(calls.buildUp).toBe(1);
    runLeg(i, {} as never, 3600, 250, true, 181, 0);
    expect(calls.buildUp).toBe(2);
  });

  it('by a deadline, compares the TE reached', () => {
    contDays = 20;
    contEndTE = 205;
    buildUpDays = 20;
    buildUpEndTE = 215;
    fresh = [{ sale: 1, days: 20, endTE: 210, buildPhaseEnd: 5 * DAY }];
    expect(leg1(inputs('auto'), 20 * DAY)!.key).toBe('buildup');
  });
});

describe('leg 1: no build-up that buys nothing or ends no sooner than continue (spec-noemptybuild)', () => {
  // Every fresh start slower than continue and the build-up, so only those two decide.
  beforeEach(() => {
    fresh = [{ sale: 2, days: 60 }];
  });

  it('a build-up whose build buys nothing is never offered: continue, under every setting that builds up', () => {
    contDays = 42;
    buildUpDays = 41; // even sooner (it cannot be, but the rule does not lean on the times)
    buildUpBuys = false;
    for (const first of ['auto', 'buildup'] as const) {
      const r = leg1(inputs(first))!;
      expect(r.key).toBe('continue');
      // Not an option, so neither the rival nor recorded.
      expect(r.firstLegEnds?.buildup).toBeUndefined();
      expect(r.rival?.key).not.toBe('buildup');
    }
  });

  it("with nothing to buy, My runs' unfinished build (continue left out) is continue, not the empty build-up", () => {
    contDays = 42;
    buildUpDays = 43;
    buildUpBuys = false;
    // A new inputs object each time: the build-up is worked out once per run (its inputs).
    const carryOn = () => ({ ...inputs('buildup'), continueMaxSeconds: 0 }) as SearchInputs;
    expect(leg1(carryOn())!.key).toBe('continue');
    // A build-up that buys something stays the build carried on there (pieha, 27 Oct 2026), as before.
    buildUpBuys = true;
    expect(leg1(carryOn())!.key).toBe('buildup');
    // Past six months continue is still no answer: a fresh start, as before.
    buildUpBuys = false;
    contDays = 200;
    expect(leg1(carryOn())!.key).toBe('2-sale');
  });

  it('a build-up that buys something and ends sooner than continue is still chosen', () => {
    contDays = 42;
    buildUpDays = 41;
    expect(leg1(inputs('auto'))!.key).toBe('buildup');
    expect(leg1(inputs('buildup'))!.key).toBe('buildup');
  });

  it('a tie with continue goes to continue; later than continue, continue', () => {
    contDays = 42;
    buildUpDays = 42;
    expect(leg1(inputs('auto'))!.key).toBe('continue');
    expect(leg1(inputs('buildup'))!.key).toBe('continue');
    buildUpDays = 43;
    const r = leg1(inputs('auto'))!;
    expect(r.key).toBe('continue');
    // A build-up that buys something is still a real option that lost: recorded.
    expect(r.firstLegEnds?.buildup).toBe(43 * DAY);
  });

  it('by a deadline, a build-up reaching no more TE than continue is not taken', () => {
    contDays = 20;
    contEndTE = 215;
    buildUpDays = 20;
    buildUpEndTE = 215;
    fresh = [{ sale: 1, days: 20, endTE: 210, buildPhaseEnd: 5 * DAY }];
    expect(leg1(inputs('auto'), 20 * DAY)!.key).toBe('continue');
    expect(leg1(inputs('buildup'), 20 * DAY)!.key).toBe('continue');
    buildUpEndTE = 216;
    expect(leg1(inputs('buildup'), 20 * DAY)!.key).toBe('buildup');
  });
});
