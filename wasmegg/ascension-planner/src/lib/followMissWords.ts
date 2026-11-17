/**
 * The followed route that now misses its date, on Right now (lib/followMiss.ts). Words' text (16 Nov 2026, notes/
 * words-long-search-always-and-misses-date-2026-11-16.md; Jordan OK'd): wording only (a *Words.ts file is out of the
 * result code hash). Times are the shared formatter's (12-hour, the player's zone).
 */
import type { FollowMiss } from './followMiss';
import { compactDuration } from './duration';

/** "This route now misses Egg Day. Worked out from your newest save, it finishes Jul 17, 2027 at 9:00 AM, 2d 17h after
 *  Egg Day starts (Jul 14, 2027 at 4:00 PM)." A chosen date: "...misses your date... after your date (...)".
 *  `at`: a moment as the player reads it (lib/eventWhen.ts `dateAt`); `eggDay`: the goal is Egg Day. */
export function followMissLine(m: FollowMiss, at: (unix: number) => string, eggDay: boolean): string {
  const gap = compactDuration(Math.max(60, m.lateSeconds));
  const what = eggDay ? 'Egg Day' : 'your date';
  const after = eggDay ? 'Egg Day starts' : 'your date';
  return `This route now misses ${what}. Worked out from your newest save, it finishes ${at(m.finish)}, ${gap} after ${after} (${at(m.deadline)}).`;
}
/** The button. */
export const FOLLOW_MISS_SEARCH = 'Look for a better route';
/** Under the button. */
export const FOLLOW_MISS_NOTE = 'Runs the same date search again on your newest save.';

/** DRAFT (Words writes the final text, spec-myruns-nobetter, 16 Nov 2026): the search found nothing faster. `when`: "just now"
 *  or the time it ran, as the player reads it. "Checked just now: your route is still the fastest. It finishes Jul 17,
 *  2027 at 9:00 AM, 2d 17h after Egg Day starts." */
export function followNoBetterLine(m: FollowMiss, at: (unix: number) => string, eggDay: boolean, when: string): string {
  const gap = compactDuration(Math.max(60, m.lateSeconds));
  const after = eggDay ? 'Egg Day starts' : 'your date';
  return `Checked ${when}: your route is still the fastest. It finishes ${at(m.finish)}, ${gap} after ${after}.`;
}

/**
 * NO ROUTE MAKES THE DATE (Words, 17 Nov 2026, for UI): on the newest save no route gets above the player's TE by the
 * date, a stronger case than a late finish. `date`: the date as the player reads it ("Jul 14, 2027"). Under 170 characters.
 * "No route can make Jul 14, 2027 now. On your newest save, none gets you above your current TE by then. Choose a later date."
 */
export function followCannotLine(date: string, eggDay: boolean): string {
  const what = eggDay ? 'Egg Day' : date;
  return `No route can make ${what} now. On your newest save, none gets you above your current TE by then. Choose a later date.`;
}
/** The next step, option 1 (the default; searching the same date again cannot help): open By a date to choose another. */
export const FOLLOW_CANNOT_LATER = 'Choose a later date';
export const FOLLOW_CANNOT_LATER_NOTE = 'Opens By a date, where you pick the date to search for.';
/** The next step, option 2, only if UI opens the same date's answer: */
export const FOLLOW_CANNOT_SEE = 'See By a date for this date';
/** The card shows the OLD followed route under a newer save. `when`: the save the route was worked out on, as the player
 *  reads it ("Nov 14, 2026 at 9:00 AM"). */
export function followOldPlanLabel(when: string): string {
  return `This is the route you follow, worked out on your save from ${when}. It was not checked against your newest save.`;
}
