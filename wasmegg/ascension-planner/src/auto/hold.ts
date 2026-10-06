/**
 * Waiting for the player's hours inside an ascension (Your setup: "Let me pick my hours").
 *
 * An egg shift is something the player does by hand, so it can only happen while they are around.
 * When a shift falls outside their hours it waits until they are back, and in the meantime the farm
 * keeps laying the egg it is on: the player is still on the virtue farm, just asleep, so those eggs
 * (and any TE thresholds they pass) count. That is the whole difference from "Time off from virtue",
 * where the player leaves the farm and nothing is credited (search/timeOff.ts, unchanged).
 *
 * The hook is `SimulationContext.holdUntil`. It is only ever set by the search (search/leg.ts
 * `legContext`) when the player has picked their hours, so the manual planner, Classic, the
 * precomputed tables and every run without hours never reach the code below.
 */
import type { Action } from '@/types/actions/meta';
import { createSimAction } from '@/types/actions/meta';
import type { VirtueEgg } from '@/types/actions/virtue';
import type { EngineState, SimulationContext } from './types';
import { computeSnapshot } from '../engine/compute';
import { applyAction } from '../engine/apply';
import { countTEThresholdsPassed } from '@/lib/truthEggs';
import { computeTEEarned } from './te-thresholds';

/** The egg a shift switches to, from its name (C1, K2, I1, R2, H1, ...). */
export function eggOfShift(name: string): VirtueEgg | null {
  switch (name.charAt(0)) {
    case 'C':
      return 'curiosity';
    case 'I':
      return 'integrity';
    case 'K':
      return 'kindness';
    case 'R':
      return 'resilience';
    case 'H':
      return 'humility';
    default:
      return null;
  }
}

export interface HoldResult {
  state: EngineState;
  elapsedSeconds: number;
  actions: Action[];
  /** Seconds waited for the player (0 when the shift could happen at once). */
  heldSeconds: number;
}

/**
 * Before a shift to `toEgg` at `startTime + elapsedSeconds`: if the player is not around, wait for
 * them, laying the current egg at the farm's current rate (eggs, TE, and the bank's earnings all
 * credited), and return the state and clock to run the shift from. A no-op without the hook, when
 * the shift does not change egg, or when the player is around.
 *
 * Inside the build phase the farm is credited at its rate at that moment and does not grow while
 * held (no purchases happen while the player is away; hatching is not modelled here), so a hold
 * there is, if anything, slightly under-credited.
 */
export function holdForPlayer(
  state: EngineState,
  context: SimulationContext,
  startTime: number,
  elapsedSeconds: number,
  toEgg: VirtueEgg | null
): HoldResult {
  const none = { state, elapsedSeconds, actions: [], heldSeconds: 0 };
  if (!context.holdUntil || !toEgg || state.currentEgg === toEgg) return none;
  const now = startTime + elapsedSeconds;
  const held = context.holdUntil(now) - now;
  if (!(held > 0)) return none;

  const egg = state.currentEgg as VirtueEgg;
  let current: EngineState = { ...state, lastStepTime: elapsedSeconds };
  const snap = computeSnapshot(current, context, { skipGrowth: true });
  const before = current.eggsDelivered[egg] || 0;
  const startTE = countTEThresholdsPassed(before);
  const earned = computeTEEarned(before, snap.elr, held);

  // Recorded as the TE wait it is (on the egg the farm is already on), the same way
  // te-wait.ts `runTEWaitShift` records and applies one, marked as a wait for the player.
  const wait = createSimAction('wait_for_te', {
    egg,
    targetTE: startTE + earned.teEarned,
    teGained: earned.teEarned,
    eggsToLay: earned.finalEggsDelivered - before,
    timeSeconds: held,
    startEggsDelivered: before,
    startTE,
    heldForPlayer: true,
  });
  current = applyAction(current, wait);
  current.lastStepTime = elapsedSeconds + held;
  current.bankValue += snap.offlineEarnings * held;
  current.eggsDelivered = { ...current.eggsDelivered, [egg]: earned.finalEggsDelivered };
  current.teEarned = { ...current.teEarned, [egg]: (current.teEarned[egg] || 0) + earned.teEarned };
  current.te += earned.teEarned;
  wait.endState = computeSnapshot(current, context, { skipGrowth: true });
  wait.totalTimeSeconds = held;
  wait.bankDelta = snap.offlineEarnings * held;

  return { state: current, elapsedSeconds: elapsedSeconds + held, actions: [wait], heldSeconds: held };
}

/** Seconds an ascension's actions spent waiting for the player (`holdForPlayer`'s waits). */
export function heldSecondsOf(actions: Action[]): number {
  let total = 0;
  for (const a of actions) {
    if (a.type === 'wait_for_te' && (a.payload as { heldForPlayer?: boolean }).heldForPlayer) {
      total += (a.payload as { timeSeconds: number }).timeSeconds;
    }
  }
  return total;
}
