/**
 * Wait for TE Action Executor
 *
 * Waits for Truth Eggs (TE) to accumulate by shipping eggs.
 * Cost is 0 (free action, just time-based).
 */

import type { ActionExecutor, ExecutorContext } from '../executor';
import type { WaitForTEPayload } from '@/types';
import { VIRTUE_EGG_NAMES } from '@/types';
import { formatDuration } from '@/lib/format';
import { isTEWaitReachable, teGainedOf } from '@/lib/truthEggs';

export const waitForTEExecutor: ActionExecutor<'wait_for_te'> = {
  execute(payload: WaitForTEPayload, context: ExecutorContext): number {
    const { egg, eggsToLay } = payload;

    // Add eggs delivered to accumulate TE
    context.addEggsDelivered(egg, eggsToLay);

    // Waiting for TE is free (time-based, not cost-based)
    return 0;
  },

  getDisplayName(payload: WaitForTEPayload): string {
    return `Wait for TE #${payload.targetTE} on ${VIRTUE_EGG_NAMES[payload.egg]}`;
  },

  getEffectDescription(payload: WaitForTEPayload): string {
    const fromStr = payload.startTE > 0 ? ` (from #${payload.startTE})` : '';
    // Bounded, so a saved action from before the input was validated reads sanely.
    const time = isTEWaitReachable(payload.timeSeconds) ? formatDuration(payload.timeSeconds) : 'not reachable';
    return `+${teGainedOf(payload)} TE${fromStr} — ${time}`;
  },
};
