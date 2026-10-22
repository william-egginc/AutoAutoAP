/**
 * "May be optimistic for your gear" (Jordan, 22 Oct 2026). In the board check of 21 Oct (aaap-tools notes
 * board-vs-instant-2026-10-21), 18 of 84 runs had an instant answer read from the maxed account's, scaled to the
 * player's weaker delivery rate, and on all 18 it priced the player's own route sooner than the run found: by 91 to
 * 4,448 hours on Fastest, 94 to 532 hours at the last stop on By a date. Said on the instant answer only when it was
 * read that way and the rate is under OPTIMISTIC_SCALE: never for the player's own or a gear combination's (built on
 * their gear already).
 *
 * Pure: no Vue, no stores.
 */

/** Below this delivery scale a scaled maxed answer is said to be optimistic. */
export const OPTIMISTIC_SCALE = 0.95;

/** Which instant answer the card read: the player's own, a gear combination's, or the maxed one scaled. */
export type AnswerTable = 'own' | 'gear' | 'maxed';

export const OPTIMISTIC_TEXT = 'This answer may be optimistic for your gear: Check exactly gives the real number.';

/** The label shows: the maxed answer, scaled to a delivery rate under OPTIMISTIC_SCALE. */
export function optimisticForGear(table: AnswerTable, scale: number | null | undefined): boolean {
  return table === 'maxed' && typeof scale === 'number' && Number.isFinite(scale) && scale < OPTIMISTIC_SCALE;
}
