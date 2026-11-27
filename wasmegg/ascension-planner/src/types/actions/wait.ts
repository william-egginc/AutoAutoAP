import type { VirtueEgg } from './virtue';
export type {
  WaitForTimePayload,
  WaitForFullHabsPayload,
  WaitForResearchSalePayload,
  WaitForResearchSaleEndPayload,
  WaitForEarningsBoostPayload,
  WaitForEarningsBoostEndPayload,
  WaitWithoutEarningsPayload,
} from 'lib/planners/types/actions/wait';

/**
 * Payload for waiting to accumulate Truth Eggs (TE).
 */
export interface WaitForTEPayload {
  egg: VirtueEgg; // Which virtue egg
  targetTE: number; // Target TE number (1-98)
  teGained: number; // How many TE gained in this action
  eggsToLay: number; // Eggs to lay to reach target
  timeSeconds: number; // Time required
  startEggsDelivered: number; // Eggs delivered before this action
  startTE: number; // TE thresholds passed before this action
  /** A wait for the player's hours before a shift (auto/hold.ts), not a planned TE wait. */
  heldForPlayer?: boolean;
}

export type { WaitForGemsPayload } from 'lib/planners/actions/currencyWait';
