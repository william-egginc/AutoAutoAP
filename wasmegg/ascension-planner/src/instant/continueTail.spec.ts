import { describe, expect, it } from 'vitest';
import { modifiersFromColleggtibleTiers } from 'lib/collegtibles';
import { runContinueCurrent } from '@/auto/ascension';
import { computeSnapshot } from '@/engine/compute';
import type { EngineState, SimulationContext } from '@/engine/types';
import { countTEThresholdsPassed } from '@/lib/truthEggs';
import type { CurrentFarmState } from '@/types';
import { catchUpSeconds, continueTail, hasVirtueFarm, siloSeconds, staleSaveNote } from './continueTail';
import { EGG_ORDER, sweepTails, tailTo } from './precomputedLeg';

describe('continue’s catch-up and the save’s age', () => {
  it('credits the time since the sync, never more than the silos hold', () => {
    const sync = 1_800_000_000;
    expect(catchUpSeconds(sync, sync + 3600, 7200)).toBe(3600);
    expect(catchUpSeconds(sync, sync + 86400, 7200)).toBe(7200);
    expect(catchUpSeconds(sync, sync - 10, 7200)).toBe(0);
    expect(catchUpSeconds(0, sync, 7200)).toBe(0);
  });

  it('silos hold more with more silos', () => {
    expect(siloSeconds(10, 0)).toBeGreaterThan(siloSeconds(1, 0));
    expect(siloSeconds(0, 0)).toBe(siloSeconds(1, 0));
  });

  it('says nothing for a fresh save, a line for an old one, and warns past the silos', () => {
    const sync = 1_800_000_000;
    expect(staleSaveNote(sync, sync + 600, 7200)).toBeNull();
    expect(staleSaveNote(sync, sync + 2 * 3600, 3 * 3600)).toMatch(/2 hours old: anything you bought/);
    expect(staleSaveNote(sync, sync + 5 * 86400, 3 * 3600)).toMatch(/5 days old, longer than your silos hold/);
    expect(staleSaveNote(null, sync, 1)).toBeNull();
  });

  it('a farm is in progress only on a virtue egg', () => {
    const farm = { eggType: 50 } as Parameters<typeof hasVirtueFarm>[0];
    expect(hasVirtueFarm(farm)).toBe(true);
    expect(hasVirtueFarm({ ...farm!, eggType: 1 })).toBe(false);
    expect(hasVirtueFarm(null)).toBe(false);
  });
});

// Leg 1 against Joo's own A1 "Continue Current" (auto/ascension.ts runContinueCurrent), set up the
// way his generator sets it up (auto/useAscensionGenerator.ts:412-451). On a test save (Oct 2026, TE
// 142, fresh and 12.85 h old) the two agreed to the minute at every target: 155 ends Nov 14 19:22
// UTC and 159 Nov 25 12:22 UTC on both. The 10.7-day gap first reported was the instant answer's
// route to 155 put beside his plan to 159.
describe('continue’s tail is Joo’s Continue Current', () => {
  const SYNC = 1_792_000_000;
  const EGGS = ['curiosity', 'integrity', 'humility', 'resilience', 'kindness'] as const;
  const delivered = { curiosity: 9e17, integrity: 6e17, humility: 2.3e18, resilience: 7.8e17, kindness: 1.3e18 };
  const farm: CurrentFarmState = {
    eggType: 51,
    cash: 1e30,
    numSilos: 8,
    commonResearches: { comfy_nests: 50, hab_capacity1: 8, leafsprings: 30, vehicle_reliablity: 2 },
    habs: [18, 18, 18, 18],
    vehicles: Array.from({ length: 17 }, () => ({ vehicleId: 11, trainLength: 10 })),
    population: 1.1e10,
    deliveredEggs: 6e17,
    lastStepTime: SYNC,
    cashEarned: 1e31,
    cashSpent: 9e30,
  };
  const base: EngineState = {
    currentEgg: 'curiosity',
    shiftCount: 40,
    te: 0,
    soulEggs: 1e25,
    bankValue: 0,
    habIds: [0, null, null, null],
    vehicles: [{ vehicleId: 0, trainLength: 1 }],
    researchLevels: {},
    siloCount: 1,
    tankLevel: 0,
    artifactLoadout: [],
    activeArtifactSet: 'elr',
    artifactSets: { earnings: null, elr: null },
    fuelTankAmounts: { curiosity: 0, integrity: 0, humility: 0, resilience: 0, kindness: 0 },
    eggsDelivered: { ...delivered },
    teEarned: Object.fromEntries(EGGS.map(e => [e, countTEThresholdsPassed(delivered[e])])) as EngineState['teEarned'],
    population: 1,
    lastStepTime: 0,
    activeSales: { research: false, hab: false, vehicle: false },
    earningsBoost: { active: false, multiplier: 1 },
  };
  base.te = EGGS.reduce((n, e) => n + base.teEarned[e], 0);
  const context: SimulationContext = {
    epicResearchLevels: { silo_capacity: 20 },
    colleggtibleModifiers: modifiersFromColleggtibleTiers({}),
    ascensionStartTime: 0,
    planStartOffset: 0,
    assumeDoubleEarnings: false,
    deferForEarningsMode: false,
  };

  /** His generator's continue state and run, verbatim but for the stores (useAscensionGenerator.ts:412-451). */
  function his(start: number, target: number): number {
    const state: EngineState = {
      ...JSON.parse(JSON.stringify(base)),
      currentEgg: 'integrity',
      vehicles: farm.vehicles,
      habIds: farm.habs,
      researchLevels: { ...farm.commonResearches },
      siloCount: farm.numSilos,
      artifactSets: { earnings: null, elr: [] },
      population: farm.population,
      lastStepTime: farm.lastStepTime,
      bankValue: farm.cash,
    };
    const ctx = { ...context, ascensionStartTime: start, planStartOffset: 0 };
    const elr = computeSnapshot(state, ctx, { skipGrowth: true }).elr;
    return runContinueCurrent(state, ctx, start, elr, target).summary.endTime;
  }

  for (const lagHours of [0, 6]) {
    it(`ends where his does, to the second, at every target (save ${lagHours} h old)`, () => {
      const start = SYNC + lagHours * 3600;
      const tail = continueTail({
        farm,
        backup: null,
        base,
        context,
        start,
        delivered: EGG_ORDER.map(e => delivered[e]),
      })!;
      expect(tail.peakELR).toBeGreaterThan(0);
      const from = base.te + 1;
      const sweep = sweepTails(tail, base.te + 12, 0, from);
      for (let target = from; target <= base.te + 12; target++) {
        const want = his(start, target);
        expect(start + tailTo(tail, target)!.seconds).toBeCloseTo(want, 0);
        expect(start + sweep.seconds[target - sweep.from]).toBeCloseTo(want, 0);
      }
    });
  }
});
