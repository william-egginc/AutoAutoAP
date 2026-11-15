/**
 * THE FOLLOWED ROUTE THAT LANDS AFTER THE DATE, BESIDE THE EGG DAY ROW (M13 item 3, 12 Nov 2026). The row's spare is worked
 * out on the instant answer's plan, the best route for the date; a route the player follows (an older planner's pick, or
 * another goal's) can be a different, slower one. Its finish is on the goal pill; this line puts it beside the row so the
 * two are not read as one route. Display only ("Words" file: out of the result code's inputs). DRAFT words.
 */
import type { GoalFollow } from './planGoals';

/** Within this the plan shown and the followed route are the same finish: one line says it. */
const SAME_FINISH_SECONDS = 3600;

/** "Your followed route lands about Jul 17, 2027, after Egg Day starts"; '' when there is nothing to add. `planEnd`: the
 *  plan shown's finish; `lateWords`: lib/eggDayRule.ts `lateMarker`. */
export function followedLateLine(
  f: GoalFollow | null | undefined,
  planEnd: number | null | undefined,
  dayWords: (unix: number) => string,
  lateWords: string
): string {
  if (!f?.late || f.end == null || !(f.times === 'estimate' || f.times === 'finish' || f.times === 'timeline')) return '';
  if (typeof planEnd === 'number' && Math.abs(f.end - planEnd) < SAME_FINISH_SECONDS) return '';
  return `Your followed route lands ${f.times === 'estimate' ? 'about ' : ''}${dayWords(f.end)}, ${lateWords}`;
}
