/**
 * SHIFT NOW (spec-emptyshiftnow, 13 Nov 2026; Jordan's main at 2:51 PM, aaap-tools notes/research-day-13nov-answer.md
 * "Save 4"). He had just bought Wormhole Dampening 18->19, the last buy of the build-up's 1-sale variant, which shifts
 * at once. That variant then bought nothing, so NO EMPTY BUILD-UP (spec-noemptybuild) dropped it, and the only build-up
 * left was the 2-sale one: wait a week for the next sale, buy more, shift, ending 39 hours later than shifting now.
 *
 * search/leg.ts `buildUpBuild` now keeps the variant whose build buys nothing when it is "the sale's buying done"
 * (`isShiftNow`): the farm is already in C3 (no steps before it, no shift into it) and the variant's C3 takes no time,
 * while a longer variant still buys. `runLeg` takes it only when it is sooner than continue; otherwise everything is as
 * before. The alt's empty build-up (a Kindness farm shifted to Curiosity for nothing) and a farm with nothing at all to
 * buy stay dropped: leg.noEmptyBuild.spec.ts, leg.rules.spec.ts and the last block here.
 *
 * Real simulations of a synthetic save (src/test/syntheticSave.ts `saleBuysDoneBackup`, no player data, fixed clock).
 * About a minute of simulation.
 */
import '../../scripts/node-shims';

import { beforeAll, describe, expect, it } from 'vitest';
import { IN_SALE_START, saleBuysDoneBackup, syntheticInputs } from '@/test/syntheticSave';
import { getArtifactLoadoutFromBackup } from '@/lib/artifacts';
import { isResearchSaleActive } from 'lib/planners/events';
import { isPurchase, runAscensionFromC3Variant } from '@/auto/ascension';
import { buildUpBuildForCheck, buildUpTailParams, buildUpVariantForCheck, continueStateForCheck, runLeg } from './leg';
import type { SearchInputs } from './types';

const GOAL = 194;
const state = (inputs: SearchInputs) => JSON.parse(JSON.stringify(inputs.baseState));
const under = (base: SearchInputs, extra: Partial<SearchInputs>) => ({ ...base, ...extra }) as SearchInputs;
const SETTINGS = {
  Fastest: { firstAscension: 'auto' },
  'Continue my build-up': { firstAscension: 'buildup' },
  // My runs' unfinished build (composables/useNowPage.ts): the build carried on, continue left out.
  "My runs' unfinished build": { firstAscension: 'buildup', continueMaxSeconds: 0 },
} as const;

async function inSale(short?: number): Promise<SearchInputs> {
  const inputs = await syntheticInputs(() => saleBuysDoneBackup(short));
  return { ...inputs, planStart: IN_SALE_START };
}

describe("the sale's buying done, part-way through C3: the build-up shifts now", () => {
  let inputs: SearchInputs;
  beforeAll(async () => {
    inputs = await inSale();
  }, 600_000);

  it('is the fixture it means to be: on Curiosity, every vehicle bought, no set worn, planned inside a research sale', () => {
    const farm = continueStateForCheck(inputs, inputs.baseState)!;
    expect(farm.currentEgg).toBe('curiosity');
    expect(farm.researchLevels.autonomous_vehicles).toBe(5);
    expect(farm.vehicles.filter(v => v && v.vehicleId !== null)).toHaveLength(17);
    expect(getArtifactLoadoutFromBackup(inputs.context.rawBackup as any).filter(a => a.artifactId)).toEqual([]);
    expect(isResearchSaleActive(inputs.planStart)).toBe(true);
    expect(inputs.currentTE).toBe(190);
  });

  it('keeps the 1-sale variant that buys nothing and takes no time, beside the 2-sale one that waits and buys', () => {
    const b = buildUpBuildForCheck(inputs, state(inputs), inputs.planStart, inputs.currentTE)!;
    expect(b.buysNothing).toBeUndefined();
    const one = b.variants.find(v => v.saleCount === 1 && !v.attemptTier13Unlock)!;
    const two = b.variants.find(v => v.saleCount === 2 && !v.attemptTier13Unlock)!;
    expect(one).toBeDefined();
    expect(one.result.actions.some(isPurchase)).toBe(false);
    expect(one.result.elapsedSeconds).toBe(0);
    expect(two.result.actions.filter(isPurchase).length).toBeGreaterThan(0);
    expect(two.result.elapsedSeconds).toBeGreaterThan(6 * 86400);
    // The instant answer prices it too.
    expect(buildUpTailParams(inputs, inputs.planStart).length).toBe(b.variants.length);
  }, 600_000);

  for (const [name, extra] of Object.entries(SETTINGS))
    it(`${name}: shift to Humility now, the plan that ends sooner (than the 2-sale build and than continue)`, () => {
      const i = under(inputs, extra);
      const r = runLeg(i, state(i), i.planStart, GOAL, true, i.currentTE, 0)!;
      expect(r.key).toBe('buildup');
      expect(r.shifts[0].egg).toBe('humility');
      expect(r.shifts[0].at - i.planStart).toBeLessThan(60);
      expect(r.summary.endTime).toBeLessThan(r.firstLegEnds!.continue!);
      // The 2-sale build, the only build-up before this fix, ends a day or more later.
      const b = buildUpBuildForCheck(i, state(i), i.planStart, i.currentTE)!;
      const two = b.variants.find(v => v.saleCount === 2 && !v.attemptTier13Unlock)!;
      const twoEnd = runAscensionFromC3Variant(b.start, b.preC3, two, b.ctx, i.planStart, 'asc_0_check', GOAL).summary
        .endTime;
      expect(twoEnd - r.summary.endTime).toBeGreaterThan(86400);
    }, 600_000);
});

describe('the same farm with nothing left to buy at all: still no build-up (NO EMPTY BUILD-UP)', () => {
  let inputs: SearchInputs;
  beforeAll(async () => {
    inputs = await inSale(0);
  }, 600_000);

  it('no variant, no tails for the instant answer; A1 is continue under every setting that builds up', () => {
    const b = buildUpBuildForCheck(inputs, state(inputs), inputs.planStart, inputs.currentTE)!;
    expect(b.buysNothing).toBe(true);
    expect(b.variants).toEqual([]);
    expect(buildUpVariantForCheck(inputs, state(inputs), inputs.planStart, GOAL, 0, inputs.currentTE)).toBeNull();
    expect(buildUpTailParams(inputs, inputs.planStart)).toEqual([]);
    for (const extra of Object.values(SETTINGS)) {
      const i = under(inputs, extra);
      const r = runLeg(i, state(i), i.planStart, GOAL, true, i.currentTE, 0)!;
      expect(r.key).toBe('continue');
      expect(r.firstLegEnds?.buildup).toBeUndefined();
    }
  }, 600_000);
});
