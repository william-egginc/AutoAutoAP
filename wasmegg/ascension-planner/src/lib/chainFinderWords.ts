/**
 * Chain Finder's own words (Jordan, 12 Nov 2026, pm): the tab is "Chain Finder" (chains, not routes, for this name only),
 * and its two goals sit on Joo-style switch, "Target TE | By a date". "Single run" is gone as a name: Joo's simulator screen is
 * the Auto Planner. The goals keep their full names elsewhere (Fastest to 490 TE, Highest TE by a date).
 *
 * A *Words.ts file: wording only, never part of the result code hash.
 */

/** The top tab, between Auto Planner and My runs. */
export const CHAIN_FINDER_TAB = 'Chain Finder';

/** The goal switch's two sides, left to right (Target TE = Fastest to N TE, By a date = Highest TE by a date), and its name for a screen reader. */
export const GOAL_SWITCH = {
  target: 'Target TE',
  byDate: 'By a date',
  label: 'Goal',
} as const;

/** The old name of Joo's simulator screen, kept only so a spec can pin that it no longer shows. */
export const SINGLE_RUN_RETIRED = 'Single run';

/** What "Simulate this plan" opens, in a sentence ("opens the route in the Auto Planner"). */
export const AUTO_PLANNER_IN_SENTENCE = 'the Auto Planner';
