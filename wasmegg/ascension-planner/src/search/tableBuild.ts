/**
 * One build of the precomputed table (scripts/precompute.ts, the generator), shared with the page:
 * the page simulates one build of the player's own account to measure their real peak delivery rate
 * against the table's (components/auto/InstantRoute.vue), the way the table's own cells are made.
 */
import { getLocalTimestampInTimezone, PACIFIC_TIMEZONE } from '@/lib/events';
import { deriveNextStartState, runUntilShift } from '@/auto/ascension';
import { runC3Variants } from '@/auto/shifts/c3';
import { runH1 } from '@/auto/shifts/h1';
import { applyShiftAction } from '@/auto/shifts/helpers/actionHelpers';
import { runMaxVehiclesPlan } from '@/auto/shifts/helpers/vehicles';
import { countTEThresholdsPassed } from '@/lib/truthEggs';
import { calculateArtifactModifiers } from '@/lib/artifacts';
import { computeRealisticELR } from '@/calculations/realisticELR';
import { TIER_13_MIN_STARTING_TE } from './leg';
import { canonicalDelivered, EGG_ORDER, type BuildParams } from './precomputedLeg';
import type { EngineState } from '@/engine/types';
import type { SearchInputs } from './types';

/**
 * The week every table entry is simulated in: Monday 11 January 2027, 00:00 Pacific. Weeks are
 * alike for the build (the sale and the boost are weekly), so one week stands for all; this one is
 * clear of daylight saving changes for the three weeks a 3-sale build can take from its last hour.
 */
export const REFERENCE_WEEK = getLocalTimestampInTimezone('2027-01-11', '00:00', PACIFIC_TIMEZONE);

/**
 * The state a fresh ascension starts from at TE `te`, as if the last one had just ended there: the
 * account's permanent progress from the save, a reset farm, and `te` shared across the five eggs
 * the way the simulator shares a goal (cheapest next TE first, from nothing), each egg's delivered
 * count exactly on its threshold. Canonical on purpose: the table is keyed by TE, and the history
 * that got a player there is shown (by the board's legs) to barely matter.
 */
export function startStateAt(inputs: SearchInputs, te: number): EngineState {
  const delivered = canonicalDelivered(te);
  const base = JSON.parse(JSON.stringify(inputs.baseState)) as EngineState;
  return deriveNextStartState(
    {
      finalTE: Object.fromEntries(EGG_ORDER.map((e, i) => [e, countTEThresholdsPassed(delivered[i])])),
      endSoulEggs: base.soulEggs,
      endShiftCount: base.shiftCount,
      eggsDelivered: Object.fromEntries(EGG_ORDER.map((e, i) => [e, delivered[i]])),
    } as never,
    base
  );
}

/** One start's build: the shared C1..R1 run and every C3 variant still possible. */
export function buildAt(inputs: SearchInputs, state: EngineState, start: number, te: number) {
  const ctx = { ...inputs.context, ascensionStartTime: start, planStartOffset: 0 };
  const pre = runUntilShift(state, ctx, 'C3');
  const preC3 = { actions: pre.actions, state: pre.state, elapsedSeconds: pre.elapsedSeconds };
  const variants = runC3Variants(pre.state, ctx, 3, te < TIER_13_MIN_STARTING_TE).filter(v => !v.impossible);
  return { ctx, preC3, variants };
}

/**
 * A variant's build as `BuildParams`: H1 and K3's purchases replayed exactly as `runAscension` runs
 * them when it resumes a C3 variant at H1, stopping where K3's wait would begin.
 */
/** H1 and K3's purchases replayed (see `paramsOf`): the state K3's wait begins in, and when. */
export function k3StateOf(
  build: ReturnType<typeof buildAt>,
  v: ReturnType<typeof buildAt>['variants'][number]
): { k3: EngineState; waitStart: number } {
  const ctx = build.ctx;
  let state = JSON.parse(JSON.stringify(v.result.endState)) as EngineState;
  let elapsed = build.preC3.elapsedSeconds + v.result.elapsedSeconds;
  state.lastStepTime = elapsed;
  const h1 = runH1(state, ctx);
  state = h1.endState;
  elapsed += h1.elapsedSeconds;
  state.lastStepTime = elapsed;
  const shifted = applyShiftAction(state, ctx, 'kindness');
  const vehicles = runMaxVehiclesPlan(shifted.state, ctx, Infinity);
  return { k3: vehicles.endState, waitStart: elapsed + vehicles.elapsedSeconds };
}

export function paramsOf(
  build: ReturnType<typeof buildAt>,
  v: ReturnType<typeof buildAt>['variants'][number],
  start: number
): BuildParams {
  const ctx = build.ctx;
  const { k3, waitStart } = k3StateOf(build, v);
  const peakELR = computeRealisticELR(
    k3.researchLevels,
    calculateArtifactModifiers(k3.artifactLoadout),
    ctx.epicResearchLevels,
    ctx.colleggtibleModifiers
  ).effectiveRate;
  return {
    sales: v.saleCount,
    tier13: !!v.attemptTier13Unlock,
    waitStart,
    saleEnd: v.buildPhaseEnd - start,
    peakELR,
    delivered: EGG_ORDER.map(e => k3.eggsDelivered[e] || 0),
  };
}

/** Where the page measures a player's peak: a start in the upper middle at the reference week's
 *  first hour, where a build reaches its full research (the table's k3 build is made the same way). */
export const PEAK_TE = 400;

/** The highest peak delivery rate (eggs/s) of this account's builds from PEAK_TE at the reference
 *  week's first hour: the same cell the table holds, so the two compare like for like. */
export function buildPeak(inputs: SearchInputs, te = PEAK_TE, start = REFERENCE_WEEK): number {
  const build = buildAt(inputs, startStateAt(inputs, te), start, te);
  return Math.max(...build.variants.map(v => paramsOf(build, v, start).peakELR));
}
