/**
 * LOW-TE GATE (temporary until Joo's PR 717 merges)
 *
 * Joo's low-TE opening (wasmegg-carpet/egg PR 717: c6a8e406 "cki cki start" and 85dd6af2 "unlock
 * T12 on C3"), used ONLY for the fresh builds that stall today. Every other build runs the current
 * opening, unchanged to the bit (auto/ascension.ts `runC1K1I1Segment`).
 *
 * THE GATE, decided per fresh build from that build's own start state (so a later ascension of the
 * same account, with more TE, goes back to the current opening):
 *   1. it starts below `LOW_TE_TABLE_FLOOR` (TE 120, the lowest start any deployed table covers), and
 *   2. the current opening (C1, then K1/I1 in the order it picks), run first as today, stalls: its I1
 *      takes longer than `LOW_TE_STALL_SECONDS` (4 hours, Joo's own I1 cap) to max the habs. Healthy
 *      builds sit on I1 under an hour (search/rules.ts INTEGRITY_WARN_SECONDS: the longest of ~25,000
 *      board legs was 54 minutes); the stalling ones sit for many hours to weeks.
 * Then the current opening is thrown away and the build runs Joo's rounds from the same start. Under
 * the cap Joo's first round would max the habs too, so the openings only really differ where the gate
 * switches. Every build at or above TE 120 runs exactly as before, so no table cell can change
 * (bitcheck-head.sh, 195/195), and the instant answer and Check exactly agree on every leg the tables
 * price (a low-TE leg is below every table: the instant answer has no answer there).
 *
 * JOO'S ROUNDS (`runLowTeRounds`). C1 (research, 30 min) -> K1 (vehicles, 30 min, dropped for the
 * round when it buys nothing) -> I1 (habs, capped at 4 h), repeated until an I1 ends with every slot
 * a Chicken Universe; round `MAX_OPENING_ROUNDS` runs its I1 uncapped, so the opening always ends
 * with max habs. Rounds after the first shift back to Curiosity and do not re-equip the earnings set.
 * After the opening, on this path only: C2 and K2 are dropped when they would buy nothing
 * (`SKIP_WHEN_NO_PURCHASES`), and C3 unlocks Tier 12 when C1/C2 never did (`lowTeTier12Step`).
 *
 * The path is marked on the build's state (`EngineState.lowTeOpening`, the number of rounds), so the
 * later shifts of the same ascension know it; a fresh ascension's state never carries it over
 * (`deriveNextStartState` starts from the save). Shift actions on this path are tagged with their
 * planner name (`ShiftPayload.autoShiftName`) as in Joo's branch, so the UI finds C3/K3 by name
 * when the opening has more than three shifts.
 */
import type { Action } from '@/types/actions/meta';
import type { EngineState, SimulationContext, ShiftResult } from './types';
import { runC1 } from './shifts/c1';
import { runK1 } from './shifts/k1';
import { applyShiftAction } from './shifts/helpers/actionHelpers';
import { runHabPurchasePlan } from './shifts/helpers/habs';
import { runSmartBuyForSeconds, runTierUnlockMilestone } from './shifts/helpers/milestones';
import { CHICKEN_UNIVERSE_ID } from '@/calculations/habPurchasePlan';
import { isTierUnlocked } from '@/calculations/commonResearch';
import { calculateEggsLaidDuringActions } from './engine/eggs';
import { eggOfShift, holdForPlayer } from './hold';

/** Joo's I1 cap (PR 717 i1.ts), and the gate's line: an I1 longer than this is a stall. */
export const I1_TIME_LIMIT_SECONDS = 4 * 3600;
export const LOW_TE_STALL_SECONDS = I1_TIME_LIMIT_SECONDS;

/** Backstop against looping forever on a farm whose earnings can't make hab progress. The final
 *  round's I1 runs uncapped, so the opening always ends with max habs. */
export const MAX_OPENING_ROUNDS = 10;

/** Shifts dropped from the plan (state, time and shift cost all discarded) when they'd buy nothing,
 *  on the low-TE path only: a multi-round opening can leave C2/K2 with nothing left to buy. */
export const SKIP_WHEN_NO_PURCHASES = new Set(['C2', 'K2']);

/** Graviton Coupling's tier, which C3 unlocks on the low-TE path when C1/C2 never did. */
const TIER_12 = 12;
/** C3's own step-1a sweep threshold (shifts/c3.ts OPENING_SMART_BUY_THRESHOLD_SECONDS). */
const C3_SWEEP_THRESHOLD_SECONDS = 10;

export function habsMaxed(state: EngineState): boolean {
  return state.habIds.every(id => id === CHICKEN_UNIVERSE_ID);
}

export function isPurchase(action: Action): boolean {
  return (
    action.type === 'buy_research' ||
    action.type === 'buy_vehicle' ||
    action.type === 'buy_train_car' ||
    action.type === 'buy_hab' ||
    action.type === 'buy_silo'
  );
}

/** Whether this state is on the low-TE path (set by `runLowTeRounds`). */
export function onLowTePath(state: EngineState): boolean {
  return !!state.lowTeOpening;
}

/** Labels the shift action that starts this shift (if any) with its planner name. */
export function tagShiftName(actions: Action[], name: string): void {
  const shiftAction = actions.find(a => a.type === 'shift');
  if (shiftAction?.type === 'shift') shiftAction.payload.autoShiftName = name;
}

/** Joo's I1: shift to Integrity, then the best habs reachable within `timeLimit`. */
export function runI1Capped(startState: EngineState, context: SimulationContext, timeLimit: number): ShiftResult {
  const { state, action: shiftAction } = applyShiftAction(startState, context, 'integrity');
  const plan = runHabPurchasePlan(state, context, timeLimit);
  return { actions: [shiftAction, ...plan.actions], elapsedSeconds: plan.elapsedSeconds, endState: plan.endState };
}

/**
 * The lowest start TE any deployed precomputed table covers (public/precompute/tables.json `from`:
 * 120, 138, 146 and 186 on 13 Oct). A build that starts at or above it keeps the current opening even
 * when it stalls: the tables' cells were built with that opening, and the all-common gear table's own
 * cells from TE 120 up stall on I1 (Clothed TE ~183), so switching there would change deployed cells.
 * Lower this together with the tables when they are regenerated with Joo's opening.
 */
export const LOW_TE_TABLE_FLOOR = 120;

/** Could this build take the low-TE opening at all (before its I1 is known)? Only below the floor. */
export function lowTeCandidate(context: SimulationContext, startState: EngineState): boolean {
  if (context.lowTeOpening === 'never') return false;
  if (context.lowTeOpening === 'force') return true;
  return startState.te < LOW_TE_TABLE_FLOOR;
}

/**
 * Should this candidate build take the low-TE opening? `i1Seconds`: how long the current opening's I1
 * took. `context.lowTeOpening` forces either way (tests and probes only; absent everywhere else).
 */
export function wantsLowTeOpening(context: SimulationContext, i1Seconds: number): boolean {
  if (context.lowTeOpening === 'never') return false;
  if (context.lowTeOpening === 'force') return true;
  return i1Seconds > LOW_TE_STALL_SECONDS;
}

export interface OpeningRun {
  actions: Action[];
  state: EngineState;
  elapsedSeconds: number;
  shiftTimings: { name: string; ms: number }[];
  /** Rounds run (the last one's I1 maxed the habs, or was round `MAX_OPENING_ROUNDS`). */
  rounds: number;
}

/**
 * Joo's rounds (PR 717 ascension.ts `runC1K1I1Segment`), with our "Let me pick my hours" holds
 * (auto/hold.ts) before each C1, K1 and I1, from `startState` at `startElapsedSeconds` into the
 * ascension. `firstRound`: 1 for a fresh build (its C1 equips the earnings set); "continue my
 * build-up" passes 2 to carry on after its own capped I1 (auto/buildUp.ts). Marks the end state's
 * `lowTeOpening` with the round count.
 */
export function runLowTeRounds(
  startState: EngineState,
  startElapsedSeconds: number,
  context: SimulationContext,
  firstRound = 1
): OpeningRun {
  const actions: Action[] = [];
  const shiftTimings: { name: string; ms: number }[] = [];
  let state = startState;
  let elapsedSeconds = startElapsedSeconds;

  const push = (name: string, round: number, result: ShiftResult, ms: number) => {
    tagShiftName(result.actions, name);
    const eggsLaid = calculateEggsLaidDuringActions(result.actions, state, context);
    if (result.actions.length > 0) Object.assign(result.actions[0].payload, { eggsLaid });
    actions.push(...result.actions);
    state = result.endState;
    elapsedSeconds += result.elapsedSeconds;
    shiftTimings.push({ name: round > 1 ? `${name} (round ${round})` : name, ms });
  };
  /** The wait for the player before a shift, as a pending change: applied by `keep`, or dropped
   *  together with a shift that is dropped. */
  const holdFor = (name: string) =>
    holdForPlayer(state, context, context.ascensionStartTime, elapsedSeconds, eggOfShift(name));
  const keep = (h: ReturnType<typeof holdFor>) => {
    if (!h.heldSeconds) return;
    actions.push(...h.actions);
    state = h.state;
    elapsedSeconds = h.elapsedSeconds;
  };
  const timed = (fn: () => ShiftResult) => {
    const t0 = performance.now();
    const r = fn();
    return { r, ms: performance.now() - t0 };
  };

  // C1 itself never shifts (it assumes the ascension's starting egg), so later rounds, which begin on
  // Integrity, prepend the shift back to Curiosity, plus any research-sale toggle. Only the first
  // round equips the earnings set; later rounds are already wearing it.
  const runC1Round = (s: EngineState, isFirstRound: boolean): ShiftResult => {
    if (s.currentEgg === 'curiosity') return runC1(s, context, undefined, undefined, isFirstRound);
    const shifted = applyShiftAction(s, context, 'curiosity');
    const c1 = runC1(shifted.state, context, undefined, undefined, isFirstRound);
    const leading = shifted.saleToggleAction ? [shifted.action, shifted.saleToggleAction] : [shifted.action];
    return { ...c1, actions: [...leading, ...c1.actions] };
  };

  let round = firstRound;
  for (; ; round++) {
    const isFinalRound = round >= MAX_OPENING_ROUNDS;

    // A fresh build's first C1 is already on Curiosity: no shift, so no wait (as today's C1).
    keep(holdFor('C1'));
    state.lastStepTime = elapsedSeconds;
    const c1 = timed(() => runC1Round(state, round === 1));
    push('C1', round, c1.r, c1.ms);

    // K1 is simulated first and kept only when it buys something, together with its wait.
    {
      const h = holdFor('K1');
      const from = h.heldSeconds ? h.state : { ...state };
      from.lastStepTime = h.heldSeconds ? h.elapsedSeconds : elapsedSeconds;
      const k1 = timed(() => runK1(from, context));
      if (k1.r.actions.some(isPurchase)) {
        keep(h);
        push('K1', round, k1.r, k1.ms);
      }
    }

    keep(holdFor('I1'));
    state.lastStepTime = elapsedSeconds;
    const i1 = timed(() => runI1Capped(state, context, isFinalRound ? Infinity : I1_TIME_LIMIT_SECONDS));
    push('I1', round, i1.r, i1.ms);

    if (habsMaxed(state) || isFinalRound) break;
  }
  state.lowTeOpening = round;
  return { actions, state, elapsedSeconds, shiftTimings, rounds: round };
}

/**
 * C3's step 1b on the low-TE path (PR 717 85dd6af2): if Tier 12 isn't unlocked when C3 starts, try
 * the tier-unlock chain within what's left of the build window, then repeat C3's opening sweep for the
 * newly available research. Null when it does not apply or the unlock can't finish (rolled back in
 * full, as Joo's checkpoint does). Never runs off the low-TE path.
 */
export function lowTeTier12Step(
  state: EngineState,
  context: SimulationContext,
  timeLimit: number,
  roiDeadline: number
): ShiftResult | null {
  if (!onLowTePath(state) || isTierUnlocked(state.researchLevels, TIER_12)) return null;
  const unlock = runTierUnlockMilestone(state, context, TIER_12, timeLimit, roiDeadline, true);
  if (!isTierUnlocked(unlock.endState.researchLevels, TIER_12)) return null;
  const sweep = runSmartBuyForSeconds(
    unlock.endState,
    context,
    C3_SWEEP_THRESHOLD_SECONDS,
    Math.max(0, timeLimit - unlock.elapsedSeconds)
  );
  return {
    actions: [...unlock.actions, ...sweep.actions],
    elapsedSeconds: unlock.elapsedSeconds + sweep.elapsedSeconds,
    endState: sweep.endState,
  };
}
