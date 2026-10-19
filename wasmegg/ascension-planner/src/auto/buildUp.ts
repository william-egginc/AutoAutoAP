/**
 * "Continue my build-up": the standard build (C1 .. R1, then C3 onwards) run from the farm in the
 * save, as it is part-way through an ascension, rather than from a fresh prestige.
 *
 * Every shift before C3 buys toward a target (research to max, every hab a Chicken Universe, every
 * vehicle slot a full hyperloop, silos within a budget), not a count, so anything the farm already
 * owns is simply not bought again. What does need care is the SHIFT itself: in the game a shift
 * resets the farm's chickens and cash (engine/apply/actions.ts), and the standard build only shifts
 * because it then spends time on that egg. So each step is first tried where the farm is, on the
 * egg it is on, without a shift:
 *   - when its purchases take no more than `IN_PLACE_SECONDS`, they are kept and the shift is
 *     dropped (no reset, no soul-egg cost: a player who already has the money just buys);
 *   - otherwise the step runs exactly as the standard build runs it, shift and all.
 * C1 (the opening research sweep) only runs on a farm that has not yet bought a hab or a vehicle;
 * past that the player has done it, and running it again would spend the farm's cash on research at
 * full price just before C3's sale-aware buying. C3 then starts as usual, but a farm already on
 * Curiosity stays on it (C3Params.stayOnCuriosity).
 *
 * The opening follows a fresh build's rounds (ascension.ts runC1K1I1Segment): K1, then I1 capped at
 * Joo's 4 hours (shifts/i1.ts); when that leaves the habs unmaxed, the build carries on with the
 * fresh build's rounds (C1, K1, I1) from round 2 until they are. Like a fresh build, C2 and K2 are
 * dropped when they would buy nothing.
 */
import type { Action } from '@/types/actions/meta';
import type { EngineState, SimulationContext, ShiftResult } from './types';
import { runC1 } from './shifts/c1';
import { runK1 } from './shifts/k1';
import { runI1, habsMaxed, I1_TIME_LIMIT_SECONDS } from './shifts/i1';
import { runC2, runR1LookaheadEarningsBuy } from './shifts/c2';
import { runK2 } from './shifts/k2';
import { runR1 } from './shifts/r1';
import { runVehiclesForTimeLimit, runMaxVehiclesPlan } from './shifts/helpers/vehicles';
import { runHabPurchasePlan } from './shifts/helpers/habs';
import { runSiloBudgetPlan } from './shifts/helpers/silos';
import { runBuyResearchLevelByLevel, runTierUnlockMilestone } from './shifts/helpers/milestones';
import { getResearchById, isTierUnlocked } from '@/calculations/commonResearch';
import { eggOfShift, holdForPlayer } from './hold';
import { isPurchase, runC1K1I1Segment, SKIP_WHEN_NO_PURCHASES, tagShiftName } from './ascension';

/** A step whose purchases, made in place, take no longer than this keeps them and drops its shift. */
export const IN_PLACE_SECONDS = 1800;

/** C2's research (shifts/c2.ts), the same ids and the same 4-hour clock, without its shift, ending
 *  with C2's own R1-lookahead earnings buy (step 4). */
const FLEET_RESEARCH_IDS = [
  'vehicle_reliablity',
  'excoskeletons',
  'traffic_management',
  'egg_loading_bots',
  'autonomous_vehicles',
];
const GRAVITON_COUPLING_ID = 'micro_coupling';
const C2_TIME_LIMIT_SECONDS = 14400;

function c2InPlace(startState: EngineState, context: SimulationContext): ShiftResult {
  let state = startState;
  let elapsedSeconds = 0;
  const actions: Action[] = [];
  const left = () => C2_TIME_LIMIT_SECONDS - elapsedSeconds;
  const take = (r: ShiftResult) => {
    state = r.endState;
    elapsedSeconds += r.elapsedSeconds;
    actions.push(...r.actions);
  };
  for (const id of FLEET_RESEARCH_IDS) take(runBuyResearchLevelByLevel(state, context, id, left()));
  const gc = getResearchById(GRAVITON_COUPLING_ID);
  if (gc) {
    const before = { state, elapsedSeconds, n: actions.length };
    const level0 = state.researchLevels[GRAVITON_COUPLING_ID] || 0;
    if (!isTierUnlocked(state.researchLevels, gc.tier)) take(runTierUnlockMilestone(state, context, gc.tier, left()));
    if (isTierUnlocked(state.researchLevels, gc.tier)) take(runBuyResearchLevelByLevel(state, context, GRAVITON_COUPLING_ID, left()));
    if ((state.researchLevels[GRAVITON_COUPLING_ID] || 0) <= level0) {
      state = before.state;
      elapsedSeconds = before.elapsedSeconds;
      actions.length = before.n;
    }
  }
  take(runR1LookaheadEarningsBuy(state, context, left()));
  return { actions, elapsedSeconds, endState: state };
}

interface Step {
  name: 'K1' | 'I1' | 'C2' | 'K2' | 'R1';
  /** The standard build's shift, as fresh builds run it. */
  shift: (s: EngineState, c: SimulationContext) => ShiftResult;
  /** The same purchases on the egg the farm is on, without the shift. */
  inPlace: (s: EngineState, c: SimulationContext) => ShiftResult;
}

const STEPS: Step[] = [
  { name: 'K1', shift: (s, c) => runK1(s, c), inPlace: (s, c) => runVehiclesForTimeLimit(s, c, 1800) },
  { name: 'I1', shift: (s, c) => runI1(s, c, I1_TIME_LIMIT_SECONDS), inPlace: (s, c) => runHabPurchasePlan(s, c, Infinity) },
  { name: 'C2', shift: runC2, inPlace: c2InPlace },
  { name: 'K2', shift: runK2, inPlace: (s, c) => runMaxVehiclesPlan(s, c, Infinity) },
  { name: 'R1', shift: (s, c) => runR1(s, c), inPlace: (s, c) => runSiloBudgetPlan(s, c, 3600, 3600) },
];

/** True for a farm that has bought nothing but research yet: one starter hab, one starter vehicle. */
export function stillInC1(state: EngineState): boolean {
  const habs = (state.habIds ?? []).filter(h => h !== null && h !== undefined);
  const vehicles = (state.vehicles ?? []).filter(v => v && v.vehicleId !== null && v.vehicleId !== undefined);
  return habs.length <= 1 && (habs[0] ?? 0) === 0 && vehicles.length <= 1 && (vehicles[0]?.vehicleId ?? 0) === 0;
}

export interface BuildUpPre {
  actions: Action[];
  state: EngineState;
  elapsedSeconds: number;
  /** The steps whose shift was kept (the others were bought in place, or had nothing to buy). */
  shifted: string[];
  /** Whether C3 should start without a shift (the farm is on Curiosity by then). */
  stayOnCuriosity: boolean;
}

/**
 * The build-up up to C3, from the farm `start` (`lastStepTime` 0 at `context.ascensionStartTime`,
 * which is the plan start). The result plugs into `runC3Variants` and `runAscensionFromC3Variant`
 * exactly as `runUntilShift(.., 'C3')` does for a fresh build.
 */
export function runBuildUpUntilC3(start: EngineState, context: SimulationContext): BuildUpPre {
  let state = JSON.parse(JSON.stringify(start)) as EngineState;
  let elapsedSeconds = 0;
  const actions: Action[] = [];
  const shifted: string[] = [];
  const take = (r: ShiftResult) => {
    actions.push(...r.actions);
    state = r.endState;
    elapsedSeconds += r.elapsedSeconds;
  };

  if (stillInC1(state)) {
    state.lastStepTime = elapsedSeconds;
    take(runC1(state, context));
  }

  for (const step of STEPS) {
    state.lastStepTime = elapsedSeconds;
    const trial = step.inPlace(JSON.parse(JSON.stringify(state)) as EngineState, context);
    if (trial.elapsedSeconds <= IN_PLACE_SECONDS) {
      take(trial);
      continue;
    }
    // Where to go back to if the shift is dropped (C2/K2 that buy nothing, with their wait).
    const before = { state, elapsedSeconds, actions: actions.length };
    // The player's hours (auto/hold.ts): a real shift waits for them, as in a fresh build.
    const h = holdForPlayer(state, context, context.ascensionStartTime, elapsedSeconds, eggOfShift(step.name));
    if (h.heldSeconds) {
      actions.push(...h.actions);
      state = h.state;
      elapsedSeconds = h.elapsedSeconds;
    }
    state.lastStepTime = elapsedSeconds;
    const result = step.shift(state, context);
    if (SKIP_WHEN_NO_PURCHASES.has(step.name) && !result.actions.some(isPurchase)) {
      state = before.state;
      elapsedSeconds = before.elapsedSeconds;
      actions.length = before.actions;
      continue;
    }
    tagShiftName(result.actions, step.name);
    take(result);
    shifted.push(step.name);
    // An I1 that stopped at its 4-hour cap with the habs unmaxed: the fresh build's rounds from round 2.
    if (step.name === 'I1' && !habsMaxed(state)) {
      const rounds = runC1K1I1Segment(state, context, 2, elapsedSeconds);
      actions.push(...rounds.actions);
      state = rounds.endState;
      elapsedSeconds += rounds.elapsedSeconds;
    }
  }

  state.lastStepTime = elapsedSeconds;
  return { actions, state, elapsedSeconds, shifted, stayOnCuriosity: state.currentEgg === 'curiosity' };
}
