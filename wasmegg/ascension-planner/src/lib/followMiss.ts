/**
 * THE FOLLOWED ROUTE THAT NOW MISSES ITS DATE (Jordan, 16 Nov 2026; his exception to the 13 Nov rule that My runs gives
 * no better-route offer). A By a date goal is followed, and the finish Right now has for it (the one Next step and Next
 * shifts already work out from the newest save: the card's plan, or the finish of a priced history check) is later than
 * the goal's date. Pure: no engine, no new simulation. The card shows the line and a button (RightNowCard.vue,
 * lib/followMissWords.ts); the button is the card's `recalc` (By a date, same goal, Fast, latest save).
 */
import { reactive } from 'vue';
import { finishesBefore } from './eggDayRule';

export interface FollowMiss {
  /** When the followed route lands, unix seconds. */
  finish: number;
  /** The goal's date, unix seconds. */
  deadline: number;
  /** How long after the date, seconds (always above 0). */
  lateSeconds: number;
}

/** The miss, or null: not a By a date goal, no date, no finish yet, or the route is in time (at the date counts). */
export function followMissOf(o: {
  goal: 'fastest' | 'date' | null | undefined;
  deadline: number | null | undefined;
  finish: number | null | undefined;
}): FollowMiss | null {
  if (o.goal !== 'date') return null;
  const { deadline, finish } = o;
  if (typeof deadline !== 'number' || !Number.isFinite(deadline) || deadline <= 0) return null;
  if (typeof finish !== 'number' || !Number.isFinite(finish)) return null;
  if (finishesBefore(finish, deadline)) return null;
  return { finish, deadline, lateSeconds: finish - deadline };
}

// ----------------------------------------------------------------------------- "Look for a better route" found nothing
/**
 * (spec-myruns-nobetter, Jordan, 16 Nov 2026) The button opens the goal's screen on Fast; the player runs it there and
 * comes back. When a search for that goal finished AFTER the press and is no faster than the followed route (a minute's
 * slack: the same route comes out to the second), My runs says so instead of leaving the question open. Pure.
 */
const SAME_ROUTE_SLACK_S = 60;

export function followLookNothingBetter(o: {
  /** When the button was pressed for this goal, ms; null when it was not. */
  askedAt: number | null;
  /** The newest search result for the goal on this save (Right now's `driving.search`), its finish in unix seconds. */
  search: { level: string; at: number; end: number } | null;
  miss: FollowMiss | null;
}): boolean {
  if (o.askedAt == null || !o.search || !o.miss) return false;
  if (!(o.search.at > o.askedAt)) return false;
  return o.search.end >= o.miss.finish - SAME_ROUTE_SLACK_S;
}

/** Which goals the button was pressed for, and when (ms), for this visit: module state, like the goal picked
 *  (composables/useNowPage.ts), because the press leaves My runs for the goal's screen. Keyed by lib/recalc.ts `askGoal`. */
const asked = reactive<Record<string, number>>({});
export const followLook = {
  ask(goal: string, at: number): void {
    asked[goal] = at;
  },
  askedAt(goal: string): number | null {
    return asked[goal] ?? null;
  },
  reset(): void {
    for (const k of Object.keys(asked)) delete asked[k];
  },
};
