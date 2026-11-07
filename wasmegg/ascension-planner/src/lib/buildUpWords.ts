/**
 * The Build-up tracker's research words (spec-rangewords, R7). Wording only: lib/resultCodeHash.ts leaves *Words.ts
 * files out of the result code hash, so an edit here keeps everyone's kept plans (lib/buildUpTracker.ts, which is in
 * the hash, imports these). Pure; its one import is the game's research data (for the max levels).
 *
 * RANGES IN THE MANUAL PLANNER'S FORM (allanfieldhouse): "Relativity Optimization (2 → 4)", from the level before the
 * first buy to the level after the last, as the Manual Planner's Curiosity summary writes a research range
 * (components/summaries/CuriositySummary.vue, Joo's: `${r.name} (` start ' -> ' final ')'). A single level is
 * "(0 → 1)". The one difference from it: the arrow, → (U+2192) where it writes ASCII '->', as the request asked; a
 * hyphen is also a place a browser may break a line, the arrow is not, so a range breaks only at its spaces. Trains,
 * silos, habs and car counts keep their own words ("slots 1-14", "#2-5"): the Manual Planner shows those per action
 * ("→ slot 3"), with no range form to follow.
 *
 * THE MAX LEVEL (spec-maxlevel, 6 Nov 2026, Jordan: "when it hits the max level just say max"): a range that ends on
 * the research's max level says so, "Enlightened Chickens (102 → max)". The max is the game's (lib/researches.json
 * `levels`), looked up by research id: the two Internal Hatchery Expansions share a name and not a max (15 and 30).
 * Only the level after the buy, and only AT the max: "(80 → 90)" of a 150-level research keeps its numbers. A
 * one-level research keeps "(0 → 1)": "Bigger Eggs (0 → max)" says no more and reads as if there were levels to buy
 * out. Without an id (or one the data doesn't know) the range keeps its numbers.
 *
 * Player-facing words here are DRAFT (Words reviews them; ~/code/aaap-tools/notes/spec-rangewords.md,
 * ~/code/aaap-tools/notes/spec-maxlevel.md).
 */
import { allResearches } from 'lib';

/** The range arrow (DRAFT): U+2192. The Manual Planner's summary writes ' -> '. */
export const RANGE_ARROW = '→';

/** The word for a research's max level (DRAFT). */
export const MAX_LEVEL_WORD = 'max';

/** The fewest levels a research has for its max to read MAX_LEVEL_WORD: a one-level research keeps "1". */
const MAX_WORD_FROM_LEVELS = 2;

const MAX_LEVELS: ReadonlyMap<string, number> = new Map(
  (allResearches as readonly { id: string; levels: number }[]).map(r => [r.id, r.levels])
);

/** The game's max level for a research id (lib/researches.json `levels`); null for an id it doesn't know. */
export function researchMaxLevel(id: string | null | undefined): number | null {
  return (id && MAX_LEVELS.get(id)) || null;
}

/** A level as a range ends on it: MAX_LEVEL_WORD at the research's max (`max`, null when unknown), else the number. */
export function levelWords(level: number, max: number | null | undefined): string {
  return max != null && max >= MAX_WORD_FROM_LEVELS && level === max ? MAX_LEVEL_WORD : `${level}`;
}

/** "Relativity Optimization (2 → 4)": `before` the level before the first buy, `after` the level after the last.
 *  With the research's `id`, a range that ends on its max level reads "(102 → max)". */
export function researchRangeWords(name: string, before: number, after: number, id?: string | null): string {
  return `${name} (${before} ${RANGE_ARROW} ${levelWords(after, researchMaxLevel(id))})`;
}

/** The cheap sweep mark (DRAFT words): after a sweep name on a mixed line, or once at the end of an all-sweep line. */
export const CHEAP_SWEEP_MARK = ' (cheap sweep)';

/** Why the Build-up tracker gave up when its plan took longer than its overall cap (spec-stuck3; Jordan's OK, 7 Nov 2026):
 *  "The build-up list could not be worked out (it took over 8 minutes)." */
export function trackerCapReason(minutes: number): string {
  return `it took over ${minutes} minutes`;
}
