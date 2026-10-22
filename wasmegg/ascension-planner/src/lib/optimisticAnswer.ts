/**
 * "May be optimistic for your gear" (Jordan, 22 Oct 2026). In the board check of 21 Oct (aaap-tools notes
 * board-vs-instant-2026-10-21), 18 of 84 runs had an instant answer read from the maxed account's, scaled to the
 * player's weaker delivery rate, and on all 18 it priced the player's own route sooner than the run found: by 91 to
 * 4,448 hours on Fastest, 94 to 532 hours at the last stop on By a date. Said on the instant answer only when it was
 * read that way and the rate is under OPTIMISTIC_SCALE: never for the player's own, nor for a gear combination's (built on
 * their gear) unless the route starts above its own rows, where it reads the maxed answer scaled too.
 *
 * Pure: no Vue, no stores.
 */

/** Below this delivery scale a scaled maxed answer is said to be optimistic. */
export const OPTIMISTIC_SCALE = 0.95;

/** Which instant answer the card read: the player's own, a gear combination's, or the maxed one scaled. */
export type AnswerTable = 'own' | 'gear' | 'maxed';

export const OPTIMISTIC_TEXT = 'This answer may be optimistic for your gear: Check exactly gives the real number.';

/**
 * The label shows: the maxed answer, scaled to a delivery rate under OPTIMISTIC_SCALE. A gear combination's answer
 * counts too when the route starts above its own rows (`gearScaled`: from there it reads the maxed answer scaled to
 * the player's rate, the composite's own scale); the player's own answer never.
 */
export function optimisticForGear(table: AnswerTable, scale: number | null | undefined, gearScaled = false): boolean {
  if (table === 'own' || (table === 'gear' && !gearScaled)) return false;
  return typeof scale === 'number' && Number.isFinite(scale) && scale < OPTIMISTIC_SCALE;
}

/** A gear combination's answer for a route starting at `startTE` reads only the maxed rows: above `gearTo`, the last
 *  TE of the gear table's own rows (the header's; the split, 340, less one when it has none). */
export function gearReadsMaxed(startTE: number, gearTo: number | null | undefined, split = 340): boolean {
  const top = typeof gearTo === 'number' && Number.isFinite(gearTo) ? Math.max(gearTo, split - 1) : split - 1;
  return Math.floor(startTE) > top;
}
