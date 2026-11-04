import type { EngineState, SimulationContext, ShiftResult } from '../types';
import { applyShiftIfNeeded } from './helpers/actionHelpers';
import { runMaxVehiclesPlan } from './helpers/vehicles';

/**
 * K2's time budget. Uncapped, K2 waited as long as Hyperloops take. Measured on the reference week
 * (sim3 notes, after the Bust Unions fix): under 0.01 h on maxed and own gear at TE 60-400, 7.7 h on
 * weak common gear at TE 60, 6.9 h with no virtue artifacts at TE 120, and 1.15 million hours
 * (~130 years) at TE 60. A 6 h cap cut weak common gear's K2 short and its vehicles then cost K3
 * more: TE 60's wait start went from 2,368 h to 4,426 h, and 8 h still cost TE 60 h50 +314 h
 * (a cap stops at the first step that would pass it). 24 h matched uncapped on every realistic cell
 * measured and stops only the runaway one (sim3 notes). I1's budget is 4 h. K3 stays uncapped.
 */
export const K2_TIME_LIMIT_SECONDS = 24 * 3600;

/**
 * K2 Shift Strategy:
 * 1. Shift to Kindness.
 * 2. Max all vehicle slots with best vehicles (Hyperloops, ID 11).
 * 3. Max train lengths.
 * Within K2_TIME_LIMIT_SECONDS: purchases past it are dropped.
 */
export function runK2(startState: EngineState, context: SimulationContext): ShiftResult {
  const { state, actions: shiftActions } = applyShiftIfNeeded(startState, context, 'kindness');
  const plan = runMaxVehiclesPlan(state, context, K2_TIME_LIMIT_SECONDS);

  return {
    actions: [...shiftActions, ...plan.actions],
    elapsedSeconds: plan.elapsedSeconds,
    endState: plan.endState,
  };
}
