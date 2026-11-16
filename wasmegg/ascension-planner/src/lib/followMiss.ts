/**
 * THE FOLLOWED ROUTE THAT NOW MISSES ITS DATE (Jordan, 16 Nov 2026; his exception to the 13 Nov rule that My runs gives
 * no better-route offer). A By a date goal is followed, and the finish Right now has for it (the one Next step and Next
 * shifts already work out from the newest save: the card's plan, or the finish of a priced history check) is later than
 * the goal's date. Pure: no engine, no new simulation. The card shows the line and a button (RightNowCard.vue,
 * lib/followMissWords.ts); the button is the card's `recalc` (By a date, same goal, Fast, latest save).
 */
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
