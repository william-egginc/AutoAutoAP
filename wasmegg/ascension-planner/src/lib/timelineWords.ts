/**
 * MY RUNS' ONE TIMELINE (Jordan, 17 Nov 2026: "merge 'full timeline' with the 'you are here'"). The button on each ascension's row in
 * You are here ("A2 ends · Prestige at 247 TE", and the goal row of the last ascension) that opens that ascension's shifts and dates
 * (components/myruns/EventsTable.vue). DRAFT (UI; Words to review). A *Words.ts file: wording only, out of the result code hash. Imports nothing.
 */

/** The button's words; `asc` is 1-based. "Show A2's shifts and dates" / "Hide A2's shifts and dates". */
export function ascDetailLabel(asc: number, open: boolean): string {
  return `${open ? 'Hide' : 'Show'} A${asc}'s shifts and dates`;
}

/** Said once under You are here (UX sweep R9, 18 Nov 2026), not under every opened ascension. DRAFT (Words to review). */
export const ASC_TIMES_NOTE =
  "Times from the instant answer are to the hour. It leaves out the first hours of a fresh ascension, before the swap to Humility. For every shift, run a search from Try next below.";

/** The closed fold that holds every ascension where there is no You are here list to open (not on virtue yet, or no events). */
export const ALL_ASC_LABEL = "Every ascension's shifts and dates";

/**
 * THE ASCENSION PICKER IN YOUR EGGS' "TO GOAL" (Jordan, 17 Nov 2026; components/myruns/YourEggs.vue). DRAFT (UI; Words to review).
 */
/** The group's name for a screen reader. */
export const ASC_PICK_GROUP = "Choose which ascension's eggs to show";
/** One button: "A1", the last one "A3 · goal" (`total` ascensions). */
export function ascPickLabel(asc: number, total: number): string {
  return asc === total ? `A${asc} · goal` : `A${asc}`;
}
/** Above the eggs for an earlier ascension, in place of the plan's goal line: where it ends. */
export function ascGoalLine(asc: number, te: number, when: string): string {
  return `A${asc} ends at ${te} TE, ${when}.`;
}
/** Under the picker (or alone) when some ascension has no per-egg times: the instant answer keeps no shifts for it. */
export const ASC_PICK_NOTE = "Some ascensions can't be shown here, because the instant answer doesn't keep their shifts. A search from Try next works them out.";
