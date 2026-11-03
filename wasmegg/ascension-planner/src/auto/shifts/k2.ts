import type { EngineState, SimulationContext, ShiftResult } from '../types';
import { applyShiftIfNeeded } from './helpers/actionHelpers';
import { runMaxVehiclesPlan } from './helpers/vehicles';

/**
 * K2's time budget. Uncapped, K2 waited as long as Hyperloops take. Measured on the reference week
 * (sim3 notes, after the Bust Unions fix): under 0.01 h on maxed and own gear at TE 60-400, 7.7 h on
 * weak common gear at TE 60, 6.9 h with no virtue artifacts at TE 120, and 1.15 million hours
 * (~130 years) at TE 60. A 6 h cap cut weak common gear's K2 short and its vehicles then cost K3
 * more: TE 60's wait start went from 2,368 h to 4,426 h. 8 h keeps every measured realistic K2
 * whole and stops only the runaway one. I1's budget is 4 h. K3 stays uncapped.
 */
export const K2_TIME_LIMIT_SECONDS = 8 * 3600;

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
