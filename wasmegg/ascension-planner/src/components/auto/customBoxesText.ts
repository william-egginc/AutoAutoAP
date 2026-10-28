/**
 * Words beside Custom's Last stop box (DeadlinePanel.vue), split from one long clause into two sentences
 * (ux35-e, 28 Oct 2026). `range` is the panel's `lastRange` (the box read as lo-hi).
 */
export function lastStopHint(range: readonly [number, number]): string {
  return `Starts at ${range[0]}-${range[1]} and looks higher or lower if the answer is outside it. Found to the exact TE.`;
}
