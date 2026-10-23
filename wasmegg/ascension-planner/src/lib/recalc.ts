/**
 * Right now's "Run Fast" (was "Recalculate", which ran Check exactly until 23 Oct 2026): open the selected goal's
 * screen (Fastest, or By a date on Egg Day or its date) with the current save and the Stronger check panel on Fast,
 * ready to press Find. My runs still works nothing out itself, and Fast never starts by itself (price-route-v2).
 *
 *   App loads a fresh save first when the loaded one is `SAVE_AMBER_HOURS` (6) hours old or more, the same path as
 *   entering the Auto Planner; then opens the screen on Fast (`openFromMyRuns` with `fastOpen`). Pure.
 */
import { SAVE_AMBER_HOURS } from './saveFreshness';
import type { MyRunsOpen } from './myRunsDashboard';
import { NAMES, fastestName } from './siteNav';

/** The goal's words as `instantGoal` (search/instantSnapshot.ts) has them ("target 490", "date 1815753600"); kept
 *  here so lib stays free of search. */
export function askGoal(goal: { goal: 'fastest' | 'date'; target: number; deadline: number | null }): string {
  return goal.goal === 'date' && goal.deadline ? `date ${goal.deadline}` : `target ${goal.target}`;
}

/** Right now's request: the screen to open (on Fast) and the goal it is for. */
export interface RecalcRequest {
  open: MyRunsOpen;
  goal: string;
}

/** A screen's open with the Stronger check panel on Fast (Nearby routes, level quick). */
export function fastOpen(open: MyRunsOpen): MyRunsOpen {
  return { ...open, tab: 'nearby', level: 'quick', ...(open.auto === 'fastest' ? { depth: 'smart' as const } : {}) };
}

/** The button: "Run Fast", or "Run Fast again" when a Fast result already drives Right now. */
export function recalcButton(fastDrives: boolean): string {
  return fastDrives ? 'Run Fast again' : 'Run Fast';
}

/** The short line beside the button. */
export function recalcWords(open: MyRunsOpen): string {
  const screen = open.auto === 'by-date' ? NAMES.byDate : fastestName(open.target);
  return `Opens ${screen} with your save and Fast selected; it starts when you press Find`;
}

/** Load a fresh save first: the loaded one is 6 hours old or more (or its time isn't known). */
export function needsFreshSave(saveSeconds: number | null | undefined, nowSeconds: number): boolean {
  if (!saveSeconds || !(saveSeconds > 1e9)) return true;
  return nowSeconds - saveSeconds >= SAVE_AMBER_HOURS * 3600;
}
