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

/**
 * What the goal switch (GoalSwitch.vue) and the Auto Planner's intro read (spec-chainfinder, 12 Nov 2026), built from the
 * words above. Imports nothing from lib/siteNav.ts (which reads CHAIN_FINDER_TAB), so the two never load in a circle.
 */
export const CHAIN_FINDER_WORDS = {
  /** The switch's own name, read by a screen reader ("Goal, radio group"). */
  switchLabel: GOAL_SWITCH.label,
  /** The two sides, keyed by the screen they open. */
  goals: { fastest: GOAL_SWITCH.target, 'by-date': GOAL_SWITCH.byDate } as Record<'fastest' | 'by-date', string>,
  /** The dot on a side whose search is running (was on the old goal tabs, unchanged). */
  running: 'A search is running here',
  /** The Auto Planner's intro, under its heading (was Single run's, in App.vue). DRAFT for Words: the sentence is the old
   *  one with the names changed. */
  autoPlannerIntro: (fastest: string, byDate: string): string =>
    `The Auto Planner is Joo's original planner: type the TE you want to ascend at and it lays out every ascension from your start, with the weekly Research Sale and the Monday 2× earnings boost in it. To have the stops found for you, use ${CHAIN_FINDER_TAB} (${fastest} or ${byDate}).`,
};
