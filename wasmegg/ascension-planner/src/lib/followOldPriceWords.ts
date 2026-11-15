/**
 * THE BETTER-ROUTE BOX OVER A FOLLOW PRICED BY ANOTHER VERSION (M13, 12 Nov 2026): the price saved with a followed route
 * ("yours: 313 TE, 37h 6m to spare") is not compared when another version of the planner worked it out: it disagreed with
 * My runs, which prices the same chain fresh by days. The box offers "Re-plan from this save" and says why instead.
 * Display only ("Words" file: out of the result code's inputs). DRAFT words.
 */
export function versionPriceWords(candidate: { endTE: number; end: number }, goal: 'fastest' | 'date', when: (t: number) => string): string {
  const got = goal === 'date' ? `gets ${candidate.endTE} TE` : `finishes ${when(candidate.end)}`;
  return `The route you follow was priced by another version of the planner, so its numbers can't be compared. The answer for this save ${got}.`;
}
