/**
 * "THE ASCENSION TO 218 TE COULD NOT BE SIMULATED" (spec-buildfail, 30 Oct 2026, Jordan mid build-up on egg-beta).
 * A minute after the prestige to 197 TE, on Curiosity, following 197 218 247 285 313 with hours 7 am to 1 am, My runs
 * simulates the ascension he is in (composables/useCurrentSim.ts: the chain evaluator on the one-stop route [218],
 * the build carried on, `continueMaxSeconds` 0) and it came back empty: Next shifts fell back to the instant answer's
 * estimates and the build-up tracker had no plan.
 *
 * Why: the bare farm lays next to nothing, so continuing it as it is (search/leg.ts `buildContinueVariant`) runs its
 * TE waits for longer than any calendar holds; the shift hold (auto/hold.ts, the hours' `holdUntil`) then asked
 * search/availability.ts `nextAvailable` for a moment past the last date Intl can format, which threw RangeError
 * "Invalid time value", and the throw took the whole leg with it (search/chain.ts `safeLeg`), the build carried on
 * included. The synthetic save (src/test/syntheticSave.ts `justPrestigedBackup`, no player data) is that state.
 *
 * The same on the real save, read in place: followSim.justPrestiged.save.spec.ts.
 */
import '../../scripts/node-shims';

import { beforeAll, describe, expect, it } from 'vitest';
import { justPrestigedBackup, syntheticInputs } from '@/test/syntheticSave';
import { createChainEvaluator } from '@/search/chain';
import { nextAvailable } from '@/search/availability';
import { buildUpPlanFromSegments, simLegFromSegments } from './followSim';
import type { LegSummary, SearchInputs } from '@/search/types';

const HOURS = { days: [0, 1, 2, 3, 4, 5, 6], fromHour: 7, toHour: 1, timezone: 'America/Denver' };

describe('nextAvailable past the last date', () => {
  it('a moment no calendar holds waits for nothing (no throw)', () => {
    for (const t of [8.7e12, 1e20, Infinity, NaN]) expect(() => nextAvailable(t, HOURS)).not.toThrow();
    expect(nextAvailable(1e20, HOURS)).toBe(1e20);
    expect(nextAvailable(Infinity, HOURS)).toBe(Infinity);
  });
});

describe('the ascension you are in, a minute after the prestige (synthetic save)', () => {
  let inputs: SearchInputs;
  let legs: LegSummary[] | null;

  beforeAll(async () => {
    const i = await syntheticInputs(justPrestigedBackup);
    // As useNowPage.ts `simRequest` builds it: the build carried on, no milestones, the hours with shifts held.
    inputs = { ...i, final: 313, availability: HOURS, deferShifts: true, firstAscension: 'buildup', continueMaxSeconds: 0, milestones: [] };
    expect(inputs.currentTE).toBe(197);
    legs = createChainEvaluator(inputs).evaluate([218], { keepPurchases: true })?.legs ?? null;
  }, 1_800_000);

  it('is simulated: one leg to 218 TE, from the plan start', () => {
    const leg = simLegFromSegments(legs, { timeOff: inputs.timeOff, currentTE: inputs.currentTE, planStart: inputs.planStart });
    expect(leg).not.toBeNull();
    expect(leg!.endTE).toBe(218);
    expect(leg!.startTime).toBe(inputs.planStart);
    expect(leg!.shifts.length).toBeGreaterThan(0);
  });

  it('carries the build-up plan for the tracker', () => {
    const plan = buildUpPlanFromSegments(legs, { accountKey: 'acct-synthetic', siloSeconds: 3600 });
    expect(plan).not.toBeNull();
    expect(plan!.actions.length).toBeGreaterThan(0);
    expect(plan!.actions[0].t).toBeGreaterThanOrEqual(inputs.planStart);
  });
});
