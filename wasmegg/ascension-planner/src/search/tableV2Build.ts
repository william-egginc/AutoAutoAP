/**
 * A table version 2 build's extra numbers (search/tableV2.ts `BuildExtras`), read off the same
 * simulation `paramsOf` (search/tableBuild.ts) reads its own from. Nothing here changes a build: the
 * states are the ones `k3StateOf` walks through (H1, K3's shift, K3's vehicles), replayed on copies,
 * and only rates and instants are read from them. The generator (scripts/precompute.ts --generate
 * --v2) is the only caller; the page never simulates these.
 */
import { calculateArtifactModifiers } from '@/lib/artifacts';
import { computeRealisticELR } from '@/calculations/realisticELR';
import { computeSnapshot } from '@/engine/compute';
import { isPurchase } from '@/auto/ascension';
import { runH1 } from '@/auto/shifts/h1';
import { applyShiftAction } from '@/auto/shifts/helpers/actionHelpers';
import { runMaxVehiclesPlan } from '@/auto/shifts/helpers/vehicles';
import type { EngineState } from '@/engine/types';
import { EGG_ORDER, type BuildParams } from './precomputedLeg';
import type { buildAt } from './tableBuild';
import type { BuildExtras } from './tableV2';

type Build = ReturnType<typeof buildAt>;
type Variant = Build['variants'][number];

/** The rate (eggs per second) the farm in `state` lays the egg it is on while nobody buys anything:
 *  what auto/hold.ts `holdForPlayer` credits while a shift waits for the player. */
export function holdRate(state: EngineState, ctx: Build['ctx'], at: number): number {
  return computeSnapshot({ ...state, lastStepTime: at }, ctx, { skipGrowth: true }).elr;
}

/**
 * One variant's `BuildParams` and its extra numbers in one walk: tableBuild.ts `k3StateOf` and
 * `paramsOf` step for step (H1 is the costly part, an artifact-set search, so it is run once, not once
 * for each). The params are `paramsOf`'s to the bit: tableV2.spec.ts and the generator's --v2-check
 * hold it to that.
 */
export function paramsAndExtrasOf(build: Build, v: Variant, start: number): { params: BuildParams; extras: BuildExtras } {
  const ctx = build.ctx;
  let state = JSON.parse(JSON.stringify(v.result.endState)) as EngineState;
  let elapsed = build.preC3.elapsedSeconds + v.result.elapsedSeconds;
  // H1's shift: the farm is on C3's egg until then.
  const h1At = elapsed;
  const h1Rate = holdRate(state, ctx, elapsed);
  state.lastStepTime = elapsed;
  const h1 = runH1(state, ctx);
  state = h1.endState;
  elapsed += h1.elapsedSeconds;
  state.lastStepTime = elapsed;
  // K3's shift: the farm is on humility (H1's egg) until then.
  const k3At = elapsed;
  const k3Rate = holdRate(state, ctx, elapsed);
  // auto/ascension.ts: when K3 would buy nothing, H1 takes over the wait for the sale on humility
  // and K3 becomes a plain wait. The tail replay (and `tailTo`) model the usual case; flagged here.
  const humilityWait = !runMaxVehiclesPlan(state, ctx, Infinity).actions.some(isPurchase);
  const shifted = applyShiftAction(state, ctx, 'kindness');
  const vehicles = runMaxVehiclesPlan(shifted.state, ctx, Infinity);
  const k3 = vehicles.endState;
  const waitStart = elapsed + vehicles.elapsedSeconds;
  const elr = computeRealisticELR(
    k3.researchLevels,
    calculateArtifactModifiers(k3.artifactLoadout),
    ctx.epicResearchLevels,
    ctx.colleggtibleModifiers
  );
  const params: BuildParams = {
    sales: v.saleCount,
    tier13: !!v.attemptTier13Unlock,
    waitStart,
    saleEnd: v.buildPhaseEnd - start,
    peakELR: elr.effectiveRate,
    delivered: EGG_ORDER.map(e => k3.eggsDelivered[e] || 0),
  };
  const extras: BuildExtras = {
    layRate: elr.layRate,
    shipRate: elr.shippingRate,
    h1At,
    h1Rate,
    k3At,
    k3Rate,
    waitEgg: humilityWait ? EGG_ORDER.indexOf('humility') : EGG_ORDER.indexOf('kindness'),
  };
  return { params, extras };
}
