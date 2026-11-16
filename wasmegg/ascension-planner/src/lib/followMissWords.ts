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
