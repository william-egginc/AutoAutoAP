/**
 * MY RUNS' ONE TIMELINE (Jordan, 17 Nov 2026: "merge 'full timeline' with the 'you are here'"). The button on each ascension's row in
 * You are here ("A2 ends · Prestige at 247 TE", and the goal row of the last ascension) that opens that ascension's shifts and dates
 * (components/myruns/EventsTable.vue). DRAFT (UI; Words to review). A *Words.ts file: wording only, out of the result code hash. Imports nothing.
 */

/** The button's words; `asc` is 1-based. "Show A2's shifts and dates" / "Hide A2's shifts and dates". */
export function ascDetailLabel(asc: number, open: boolean): string {
  return `${open ? 'Hide' : 'Show'} A${asc}'s shifts and dates`;
}

/** The closed fold that holds every ascension where there is no You are here list to open (not on virtue yet, or no events). */
export const ALL_ASC_LABEL = "Every ascension's shifts and dates";
