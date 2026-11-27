/**
 * Every number of ascensions on the instant card (components/auto/InstantRoute.vue), rows that open on tap like Joo's
 * table (spec-slimcard; UX fluff review 5 Nov 2026, item 11): which rows are open. A row the player has not tapped is
 * open when it is the green box's row; a tap opens or closes that row only, so several may be open. The card keeps
 * the taps (count -> open) and starts afresh with each new answer.
 *
 * Only the card reads this: not a result code input (lib/resultCodeHash.ts follows imports from the result code only).
 */

/** Whether the row for `count` ascensions is open; `lit`: it is the green box's row. */
export function countRowOpen(taps: ReadonlyMap<number, boolean>, count: number, lit: boolean): boolean {
  return taps.get(count) ?? lit;
}

/** The taps after one more on the row for `count`: a new map, the old one unchanged. */
export function toggleCountRow(taps: ReadonlyMap<number, boolean>, count: number, lit: boolean): Map<number, boolean> {
  const next = new Map(taps);
  next.set(count, !countRowOpen(taps, count, lit));
  return next;
}
