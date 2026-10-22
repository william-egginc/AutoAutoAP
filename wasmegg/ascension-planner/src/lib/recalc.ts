/**
 * Right now's "Recalculate" (16 Oct 2026): open the selected goal's screen (Fastest, or By a date on Egg Day or its
 * date) with the current save and run Check exactly there. My runs still works nothing out itself: it asks, and the
 * screen's instant answer (InstantRoute.vue) answers with its own Check exactly button's action.
 *
 *   1. App loads a fresh save first when the loaded one is `SAVE_AMBER_HOURS` (6) hours old or more, the same path as
 *      entering the Auto Planner; then opens the screen (`openFromMyRuns`) and sets `ui.exactAsk`.
 *   2. InstantRoute watches the ask and acts on it with `exactAskStep` below: only for its own goal, never under a
 *      running search, once its instant answer is in. Pure.
 */
import { SAVE_AMBER_HOURS } from './saveFreshness';
import type { MyRunsOpen } from './myRunsDashboard';
import { NAMES, fastestName } from './siteNav';

/** What the screen is asked for: its goal in the instant answer's own words (`instantGoal`: "target 490",
 *  "date 1815753600"), numbered so the same ask twice is two asks. */
export interface ExactAsk {
  goal: string;
  n: number;
  /** A route the player follows (lib/follow.ts, Right now's "Price it ›"): priced as one more route after the rows,
   *  so it lands in the snapshot's `exact` and Right now finds its times. */
  chain?: number[];
}

/** The goal's words as `instantGoal` (search/instantSnapshot.ts) has them; kept here so lib stays free of search. */
export function askGoal(goal: { goal: 'fastest' | 'date'; target: number; deadline: number | null }): string {
  return goal.goal === 'date' && goal.deadline ? `date ${goal.deadline}` : `target ${goal.target}`;
}

/** Right now's request: the screen to open and the goal to check there. */
export interface RecalcRequest {
  open: MyRunsOpen;
  goal: string;
  /** "Price it ›": the followed route to price as well. */
  chain?: number[];
}

/** The short line under the button. */
export function recalcWords(open: MyRunsOpen): string {
  const screen = open.auto === 'by-date' ? NAMES.byDate : fastestName(open.target);
  return `Opens ${screen} with your save and runs Check exactly`;
}

/** Load a fresh save first: the loaded one is 6 hours old or more (or its time isn't known). */
export function needsFreshSave(saveSeconds: number | null | undefined, nowSeconds: number): boolean {
  if (!saveSeconds || !(saveSeconds > 1e9)) return true;
  return nowSeconds - saveSeconds >= SAVE_AMBER_HOURS * 3600;
}

/**
 * What InstantRoute does with an ask, each time it or the screen's state changes:
 *   'none'   no ask, or another goal's (By a date's ask left for By a date)
 *   'drop'   a search is running (it has the cores and owns the setup), or the instant answer failed: the ask is
 *            cleared unanswered
 *   'wait'   the instant answer (or its background polish, which starts Check exactly by itself) isn't done
 *   'taken'  Check exactly is already running: cleared, nothing more to do
 *   'run'    clear it and press Check exactly
 */
export type ExactAskStep = 'none' | 'drop' | 'wait' | 'taken' | 'run';

export function exactAskStep(o: {
  ask: ExactAsk | null;
  /** The screen's own goal words (`instantGoal(props.deadline, store.finalTE)`). */
  goal: string;
  /** A search or By a date run (or a result being sent) is going. */
  searchRunning: boolean;
  status: 'idle' | 'loading' | 'error' | 'done';
  backgroundStatus: 'idle' | 'running' | 'done';
  exactStatus: 'idle' | 'running' | 'done' | 'error' | 'waiting';
  /** An answer to check is in. */
  hasResult: boolean;
}): ExactAskStep {
  if (!o.ask || o.ask.goal !== o.goal) return 'none';
  if (o.searchRunning || o.status === 'error') return 'drop';
  if (o.status !== 'done' || !o.hasResult || o.backgroundStatus === 'running') return 'wait';
  if (o.exactStatus === 'running') return 'taken';
  return 'run';
}
