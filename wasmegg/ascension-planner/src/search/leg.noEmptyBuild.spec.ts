/**
 * NO EMPTY BUILD-UP (spec-noemptybuild, 31 Oct 2026; Jordan's alt, aaap-tools notes/continue-order-2026-10-31.md). The
 * build-up always opens with C3's shift to Curiosity (auto/buildUp.ts), so one that buys nothing is continue with extra
 * shifts: on the alt 6 shifts and 38.59Q of soul eggs to Dec 13 against continue's 3 shifts and 17.82Q to Dec 12.
 * search/leg.ts `buildUpBuild` keeps only build-up variants whose build buys something, and `runLeg` never takes a
 * build-up that ends no sooner than continue (ties to continue). The stubbed rules are in leg.rules.spec.ts; Jordan's
 * own save in leg.noEmptyBuild.alt.save.spec.ts (opt-in).
 *
 * Real simulations of synthetic saves (src/test/syntheticSave.ts; no player data, fixed clock):
 * - the alt's shape (`nothingToBuyBackup`): on Kindness wearing its production set (checked worn, as
 *   leg.continueSet.spec.ts `wornAs` does), nothing left to buy, Kindness 1.5 days from its next TE and the others a
 *   little further. Before the fix: a 6-shift build-up was offered, and My runs' unfinished build (continue left out)
 *   took it. Now: no build-up at all, and A1 is continue with 3 shifts under every setting that builds up;
 * - the synthetic save as it is (a half-built Curiosity farm): its build-up buys and is far sooner than continue, so
 *   it is still taken.
 * About a minute of simulation.
 */
import '../../scripts/node-shims';

import { beforeAll, describe, expect, it } from 'vitest';
import { nothingToBuyBackup, NOTHING_TO_BUY_RATE, syntheticInputs } from '@/test/syntheticSave';
import { getArtifactLoadoutFromBackup } from '@/lib/artifacts';
import { computeSnapshot } from 'lib/planners/engine/compute';
import { isPurchase } from '@/auto/ascension';
import { buildUpTailParams, buildUpVariantForCheck, continueStateForCheck, runLeg } from './leg';
import type { EquippedArtifact } from '@/lib/artifacts/types';
import type { SearchInputs } from './types';

/** Four TE above the save's 190: Kindness (its next TE first, as on the alt), Curiosity, Integrity, Resilience. */
const GOAL = 194;
const ALT_SHAPE = { kindness: 1.5, curiosity: 1.6, integrity: 1.65, resilience: 1.7, humility: 1.74 };

/** leg.continueSet.spec.ts `wornAs` for the production set: the slots point at owned items the loader reads back, and
 *  the farm lays faster with them than bare (a fixture wearing nothing cannot pass silently). */
function wornProduction(inputs: SearchInputs): EquippedArtifact[] {
  const worn = getArtifactLoadoutFromBackup(inputs.context.rawBackup as any);
  expect(
    worn
      .map(a => a.artifactId)
      .filter(Boolean)
      .sort()
  ).toEqual(['interstellar-compass-4-1', 'quantum-metronome-4-3', 'tachyon-deflector-4-2']);
  const farm = continueStateForCheck(inputs, inputs.baseState)!;
  const elr = (set: EquippedArtifact[]) =>
    computeSnapshot({ ...farm, artifactLoadout: set }, inputs.context, { skipGrowth: true }).elr;
  expect(elr(worn)).toBeGreaterThan(elr(worn.map(() => ({ artifactId: null, stones: [] }))));
  return worn;
}

const state = (inputs: SearchInputs) => JSON.parse(JSON.stringify(inputs.baseState));
const leg = (inputs: SearchInputs) => runLeg(inputs, state(inputs), inputs.planStart, GOAL, true, inputs.currentTE, 0);
/** The same save under one first-ascension setting (a new inputs object: the build-up is worked out once per run). */
const under = (base: SearchInputs, extra: Partial<SearchInputs>) => ({ ...base, ...extra }) as SearchInputs;
const SETTINGS = {
  Fastest: { firstAscension: 'auto' },
  'Continue my build-up': { firstAscension: 'buildup' },
  // My runs' unfinished build (composables/useNowPage.ts `carryOn`): the build carried on, continue left out.
  "My runs' unfinished build": { firstAscension: 'buildup', continueMaxSeconds: 0 },
} as const;

describe("the alt's shape: on Kindness, nothing left to buy", () => {
  let inputs: SearchInputs;
  beforeAll(async () => {
    inputs = await syntheticInputs(() => nothingToBuyBackup(ALT_SHAPE));
  }, 600_000);

  it('is the fixture it means to be: production set worn, on Kindness, its next TE first, at the measured rate', () => {
    wornProduction(inputs);
    const farm = continueStateForCheck(inputs, inputs.baseState)!;
    expect(farm.currentEgg).toBe('kindness');
    expect(computeSnapshot(farm, inputs.context, { skipGrowth: true }).elr).toBeCloseTo(NOTHING_TO_BUY_RATE, -3);
    expect(inputs.currentTE).toBe(190);
  });

  it('offers no build-up: no variant, no tails for the instant answer', () => {
    expect(buildUpVariantForCheck(inputs, state(inputs), inputs.planStart, GOAL, 0, inputs.currentTE)).toBeNull();
    expect(buildUpTailParams(inputs, inputs.planStart)).toEqual([]);
  }, 600_000);

  for (const [name, extra] of Object.entries(SETTINGS))
    it(`${name}: A1 is continue, 3 shifts, Kindness first, no egg left and come back to`, () => {
      const r = leg(under(inputs, extra))!;
      expect(r.key).toBe('continue');
      expect(r.shifts.map(s => `${s.fromEgg}->${s.egg}`)).toEqual([
        'kindness->curiosity',
        'curiosity->integrity',
        'integrity->resilience',
      ]);
      // Kindness laid to its next TE before it is left (1.5 days at its rate).
      expect(r.shifts[0].at - inputs.planStart).toBeGreaterThan(86400);
      expect(r.firstLegEnds?.buildup).toBeUndefined();
      expect(r.rival?.key).not.toBe('buildup');
    }, 600_000);

  it("My runs' Build-up tracker list for it buys nothing (lib/buildUpTracker.ts reads that as no build-up)", () => {
    const r = runLeg(under(inputs, SETTINGS["My runs' unfinished build"]), state(inputs), inputs.planStart, GOAL, true, inputs.currentTE, 0, undefined, {
      keepPurchases: true,
    })!;
    expect(r.key).toBe('continue');
    const kinds = new Set(r.buildUp!.actions.map(a => a.kind));
    for (const k of ['research', 'vehicle', 'trainCar', 'hab', 'silo']) expect(kinds.has(k as never)).toBe(false);
  }, 600_000);
});

describe('a build-up that buys and is sooner than continue is still taken (the synthetic save as it is)', () => {
  let inputs: SearchInputs;
  beforeAll(async () => {
    inputs = await syntheticInputs();
  }, 600_000);

  it('Continue my build-up and the unfinished build take it; it buys, and ends before continue', () => {
    const b = buildUpVariantForCheck(inputs, state(inputs), inputs.planStart, 192, 0, inputs.currentTE)!;
    expect(b).not.toBeNull();
    expect(b.actions.some(isPurchase)).toBe(true);
    for (const extra of [SETTINGS['Continue my build-up'], SETTINGS["My runs' unfinished build"]]) {
      const r = runLeg(under(inputs, extra), state(inputs), inputs.planStart, 192, true, inputs.currentTE, 0)!;
      expect(r.key).toBe('buildup');
      expect(r.summary.endTime).toBeLessThan(r.firstLegEnds!.continue!);
    }
  }, 600_000);
});
