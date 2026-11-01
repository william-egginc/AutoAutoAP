/**
 * The Build-up tracker's research words (spec-rangewords, R7). Wording only: lib/resultCodeHash.ts leaves *Words.ts
 * files out of the result code hash, so an edit here keeps everyone's kept plans (lib/buildUpTracker.ts, which is in
 * the hash, imports these). Pure, no imports.
 *
 * RANGES IN THE MANUAL PLANNER'S FORM (allanfieldhouse): "Relativity Optimization (2 → 4)", from the level before the
 * first buy to the level after the last, as the Manual Planner's Curiosity summary writes a research range
 * (components/summaries/CuriositySummary.vue, Joo's: `${r.name} (` start ' -> ' final ')'). A single level is
 * "(0 → 1)". The one difference from it: the arrow, → (U+2192) where it writes ASCII '->', as the request asked; a
 * hyphen is also a place a browser may break a line, the arrow is not, so a range breaks only at its spaces. Trains,
 * silos, habs and car counts keep their own words ("slots 1-14", "#2-5"): the Manual Planner shows those per action
 * ("→ slot 3"), with no range form to follow.
 *
 * Player-facing words here are DRAFT (Words reviews them; ~/code/aaap-tools/notes/spec-rangewords.md).
 */

/** The range arrow (DRAFT): U+2192. The Manual Planner's summary writes ' -> '. */
export const RANGE_ARROW = '→';

/** "Relativity Optimization (2 → 4)": `before` the level before the first buy, `after` the level after the last. */
export function researchRangeWords(name: string, before: number, after: number): string {
  return `${name} (${before} ${RANGE_ARROW} ${after})`;
}

/** The cheap sweep mark (DRAFT words): after a sweep name on a mixed line, or once at the end of an all-sweep line. */
export const CHEAP_SWEEP_MARK = ' (cheap sweep)';
