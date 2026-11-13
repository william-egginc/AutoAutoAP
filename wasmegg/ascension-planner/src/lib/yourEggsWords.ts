/**
 * YOUR EGGS' WORDS (My runs > "Your eggs · from your save", spec-myruns-fix2, 13 Nov 2026). Wording only: not a
 * result code hash input (src/lib/resultCodeHash.ts skips *Words.ts). lib/nextTeEgg.ts builds the lines from these.
 *
 * THE TWO VIEWS (Jordan, 13 Nov 2026):
 *   "next TE": if you switched to this egg now, how long until its next TE. Only that: no goal, no planned shift.
 *   "to goal": what the followed plan says: when it reaches its goal, and when it shifts to each egg. No "if you
 *     shift here" hypotheticals.
 * Every line on the card carries one of the kinds below (data-line in YourEggs.vue), and each view allows only its own
 * kinds (`EGG_VIEW_LINES`). Specs pin the views by these kinds and the phrases below, not by literal words.
 */
import type { EggsView } from './nextTeEgg';

/** The kind of each line on Your eggs. */
export const EGG_LINE = {
  /** next TE: the egg being laid, its next TE at the save's rate (lib/farmFacts.ts `nextTeLine`, without the goal). */
  nextAtSaveRate: 'next-save',
  /** next TE: an egg you aren't on, its next TE after a shift to it now. */
  nextAfterShift: 'next-after-shift',
  /** next TE: an egg with no after-shift time (at the TE cap, no data): how far it is to its next TE. */
  nextProgress: 'next-progress',
  /** next TE: the day and time of that next TE (from now; for an egg you aren't on, if you shift now). */
  nextClock: 'next-clock',
  /** to goal: the followed plan's goal, said once above the eggs (its TE and when). */
  goalPlan: 'goal-plan',
  /** to goal: when the plan shifts to this egg. */
  goalShift: 'goal-shift',
  /** to goal: the egg you are on, the plan shifting to it no more in its next shifts. */
  goalOnEgg: 'goal-on-egg',
  /** to goal: no shift to this egg in the plan's next shifts (a plan with no shift list for its final ascension). */
  goalNoShift: 'goal-no-shift',
  /** to goal: the egg reaches its goal (its TE at the plan's end) when its last stint on the plan ends
   *  (lib/eggGoalTimes.ts, spec-myruns-goal). */
  goalEggAt: 'goal-egg-at',
  /** to goal: the same, a late bound (Kindness waits for the sale's end; an egg last laid in a build not listed). */
  goalEggBy: 'goal-egg-by',
  /** to goal: the same, approximate (awake hours on: the threshold can come hours before the shift). */
  goalEggByAbout: 'goal-egg-by-about',
  /** to goal: no later stint on the plan; the egg is at its goal. */
  goalEggDone: 'goal-egg-done',
} as const;
export type EggLineKind = (typeof EGG_LINE)[keyof typeof EGG_LINE];

/** The kinds each view may show; nothing else. */
export const EGG_VIEW_LINES: Record<EggsView, readonly EggLineKind[]> = {
  next: [EGG_LINE.nextAtSaveRate, EGG_LINE.nextAfterShift, EGG_LINE.nextProgress, EGG_LINE.nextClock],
  goal: [
    EGG_LINE.goalPlan,
    EGG_LINE.goalShift,
    EGG_LINE.goalOnEgg,
    EGG_LINE.goalNoShift,
    EGG_LINE.goalEggAt,
    EGG_LINE.goalEggBy,
    EGG_LINE.goalEggByAbout,
    EGG_LINE.goalEggDone,
  ],
};

/** The goal's words: never in the "next TE" view. */
export const GOAL_WORDS = 'to goal';
/** An egg's time after a shift to it: never in the "to goal" view. */
export const AFTER_SHIFT_TAIL = 'after you shift here';
/** The clock line of an egg you aren't on: never in the "to goal" view. */
export const IF_SHIFT_NOW_TAIL = 'if you shift now';
/** Retired (28 Oct to 13 Nov 2026): an egg's next TE or goal timed from the plan's shift to it. Said nowhere now;
 *  specs keep it out of both views. */
export const PLANNED_SHIFT_TAIL = 'after your planned shift here';
/** The plan's shift to an egg: never in the "next TE" view. DRAFT (Words to review). */
export const PLAN_SHIFT_LEAD = 'plan shifts here';

// --- next TE ---

/** "next TE in ~2d 4h after you shift here" (unchanged wording, moved from lib/nextTeEgg.ts). */
export function afterShiftWords(about: string): string {
  return `next TE in ${about} ${AFTER_SHIFT_TAIL}`;
}
/** Over about 10 years (unchanged wording). */
export const AFTER_SHIFT_NOT_AT_THIS_RATE = `next TE ${AFTER_SHIFT_TAIL}: not at this rate (over 10 years)`;
/** The egg being laid: "next TE about Wed, Oct 30 at 11:00 AM" (unchanged wording). */
export function nextClockWords(when: string): string {
  return `next TE about ${when}`;
}
/** An egg you aren't on: "next TE about Wed, Oct 30 at 11:00 AM if you shift now" (unchanged wording). */
export function nextClockIfNowWords(when: string): string {
  return `next TE about ${when} ${IF_SHIFT_NOW_TAIL}`;
}

// --- to goal ---

/** The plan's goal, once above the eggs: "to goal: 412 TE Thu, Mar 4 at 9:00 AM, in ~5d 3h" (unchanged wording, the By a
 *  date line, now for any followed plan). */
export function goalPlanWords(endTE: number, when: string, inAbout: string): string {
  return `${GOAL_WORDS}: ${endTE} TE ${when}, in ~${inAbout}`;
}
/** DRAFT (Words to review): "plan shifts here on Sat, Dec 19 at 7:02 AM". */
export function goalShiftWords(when: string): string {
  return `${PLAN_SHIFT_LEAD} on ${when}`;
}
/** DRAFT (Words to review): the egg you are on, no shift back to it in the plan's next shifts. */
export const GOAL_ON_EGG_WORDS = "you're on this egg now";
/** DRAFT (Words to review): no shift to this egg in the plan's next shifts. */
export const GOAL_NO_SHIFT_WORDS = "not in the plan's next shifts";

/** How sure an egg's goal time is (lib/eggGoalTimes.ts): `at` the end of its last stint (the threshold crossed then);
 *  `by` a late bound; `byAbout` approximate (awake hours on). */
export type EggGoalBound = 'at' | 'by' | 'byAbout';
/** DRAFT (Words to review; spec-myruns-goal): one egg's goal on the followed plan. With its TE share (Exact plans):
 *  "42 TE on Sat, Mar 4 at 9:00 AM" / "42 TE by Sat, Mar 4 at 9:00 AM" / "42 TE by about Sat, Mar 4 at 9:00 AM";
 *  without (a table replay): "at its goal on …" / "at its goal by …" / "at its goal by about …". */
export function goalEggWords(te: number | null, when: string, bound: EggGoalBound): string {
  const lead = te != null ? `${te} TE` : 'at its goal';
  return bound === 'at' ? `${lead} on ${when}` : bound === 'by' ? `${lead} by ${when}` : `${lead} by about ${when}`;
}
/** DRAFT (Words to review; spec-myruns-goal): no later stint on the plan (the game expert's wording). */
export const GOAL_EGG_DONE_WORDS = 'done on this plan';
