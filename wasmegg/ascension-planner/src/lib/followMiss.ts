/**
 * THE FOLLOWED ROUTE THAT NOW MISSES ITS DATE (Jordan, 16 Nov 2026; his exception to the 13 Nov rule that My Runs gives
 * no better-route offer). A By a date goal is followed, and the finish Right now has for it (the one Next step and Next
 * shifts already work out from the newest save: the card's plan, or the finish of a priced history check) is later than
 * the goal's date. Pure: no engine, no new simulation. The card shows the line and a button (RightNowCard.vue,
 * lib/followMissWords.ts); the button is the card's `recalc` (By a date, same goal, Fast, latest save).
 */
import { reactive } from 'vue';
import { finishesBefore } from './eggDayRule';
import { planInTime } from './currentAnswer';

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

// ----------------------------------------------------------------------------- the two verdicts and their flags
/**
 * THE FLAGS (orchestrator, 17 Nov 2026). "Best below the TE you follow" is ON: seen live on QA's two-save run (the later, habs-cut save; By a
 * date Nov 9 10:30: the 198 TE row, the followed 199 TE priced on the older save) once Reliability's second save-stamp fix (201f79cb1) landed.
 * "No route can make the date" stays OFF: its state (a save with no plan in time and none late for the date) cannot be reached with QA's
 * fixtures, so it has only specs, and a wrong "can't make it" is worse than no line. Turn it on once someone sees it live.
 */
export const FOLLOW_BELOW_ON = true;
export const FOLLOW_CANNOT_ON = false;

// ----------------------------------------------------------------------------- worked out on the loaded save
/**
 * When a goal was worked out ON THE LOADED SAVE, ms (0: not): the newest of a plan priced on it and an answer kept for it. (planGoals'
 * `lastAt` also counts an older save's plan when the loaded one has none, so it cannot say this.) Kept here, not in planGoals.ts, so the
 * result code hash does not move for a flag. Pure.
 */
export function workedOutHereAt(o: {
  goalKey: string;
  loadedSave: number;
  candidates: readonly { goalKey?: string; ownKey: boolean; plan: { calculatedAt: number; meta?: { backupTime?: number | null } | null } }[];
  answers: readonly { goalKey: string; calculatedAt: number; saveSeconds: number | null; ownKey?: boolean }[];
}): number {
  // THE loaded save, within a minute: not currentAnswer's isCurrentSave, which takes a save up to 2 h older as current (fix 21) and a
  // snapshot key's `ownKey`, which a newer save shares with the older one. QA's live run (17 Nov 2026): a save 30 min later counted, so
  // the old answer read as "worked out here" and the cannot line showed over a save with a 198 TE route.
  const same = (t: number | null | undefined): boolean => typeof t === 'number' && Math.abs(t - o.loadedSave) <= 60;
  const plans = o.candidates.filter(c => c.goalKey === o.goalKey && same(c.plan.meta?.backupTime)).map(c => c.plan.calculatedAt);
  const said = o.answers.filter(a => a.goalKey === o.goalKey && same(a.saveSeconds)).map(a => a.calculatedAt);
  return Math.max(0, ...plans, ...said);
}

/**
 * The plans priced ON the loaded save for a goal (the same one-minute rule as workedOutHereAt), read from the candidates and not from the
 * goal's pick: the pick ranks a save up to 2 h older as current and by TE, so with Reliability's save-stamp fix it is the OLDER save's 199 TE
 * plan while this save's own 198 TE plan sits in the candidates (live run, 17 Nov 2026). `count`: plans of this save, any time;
 * `bestInTime`: the highest TE among those that finish by the date, null when none does. Pure.
 */
export function plansOfThisSave(o: {
  goalKey: string;
  loadedSave: number;
  candidates: readonly { goalKey?: string; plan: Parameters<typeof planInTime>[0] & { endTE: number; meta?: { backupTime?: number | null } | null } }[];
}): { count: number; bestInTime: { endTE: number } | null } {
  const mine = o.candidates.filter(c => c.goalKey === o.goalKey && typeof c.plan.meta?.backupTime === 'number' && Math.abs(c.plan.meta.backupTime - o.loadedSave) <= 60);
  const inTime = mine.filter(c => planInTime(c.plan)).map(c => c.plan.endTE);
  return { count: mine.length, bestInTime: inTime.length ? { endTE: Math.max(...inTime) } : null };
}

// ----------------------------------------------------------------------------- no route makes the date
/**
 * (Jordan's 16 Nov rule, QA's live run, 17 Nov 2026) A followed By a date route, still priced on an OLDER save, while the loaded save's own
 * answer for that date has no plan in time and none even landing late: the date was worked out on this save and no route gets above the
 * TE by then ("No route gets above your TE by then"), so there is no priced finish to be late. Said anyway, and the way on is a later date
 * (searching the same date again cannot help). Pure; the flag is useNowPage's `cannotDate`.
 */
export function followCannotOf(o: {
  goal: 'fastest' | 'date' | null | undefined;
  deadline: number | null | undefined;
  /** The goal was checked on the loaded save (planGoals `lastAt` above 0). */
  checkedHere: boolean;
  /** This save has a plan in time (the goal's pick) or one landing late (`late`). */
  planInTime: boolean;
  lateKept: boolean;
  /** The followed route's price is an older save's (followPrice `older-save`). */
  pricedOnOlderSave: boolean;
}): boolean {
  if (o.goal !== 'date' || typeof o.deadline !== 'number' || !(o.deadline > 0)) return false;
  return o.checkedHere && !o.planInTime && !o.lateKept && o.pricedOnOlderSave;
}

// ----------------------------------------------------------------------------- the best here is below the TE followed
/**
 * (QA's live run, 17 Nov 2026) The followed By a date route is priced on an OLDER save and this save's own By a date answer for the
 * date (a plan in time, priced on this save) tops out BELOW the TE the route was followed for: 198 now against the 199 followed. Nothing
 * else fires (the followed route has no price here to be late), yet the player should hear it. Pure; the flag is useNowPage's `belowTE`.
 */
export function followBelowOf(o: {
  goal: 'fastest' | 'date' | null | undefined;
  deadline: number | null | undefined;
  pricedOnOlderSave: boolean;
  /** The TE the followed route reaches (its older price). */
  followedTE: number;
  /** This save's own best plan in time for the date, null when none. */
  bestHere: { endTE: number } | null;
}): { bestTE: number; followedTE: number } | null {
  if (o.goal !== 'date' || typeof o.deadline !== 'number' || !(o.deadline > 0) || !o.pricedOnOlderSave) return null;
  if (!o.bestHere || !Number.isFinite(o.bestHere.endTE) || !Number.isFinite(o.followedTE)) return null;
  return o.bestHere.endTE < o.followedTE ? { bestTE: o.bestHere.endTE, followedTE: o.followedTE } : null;
}

// ----------------------------------------------------------------------------- "Look for a better route" found nothing
/**
 * (spec-myruns-nobetter, Jordan, 16 Nov 2026) The button opens the goal's screen on Fast; the player runs it there and
 * comes back. When a search for that goal finished AFTER the press and is no faster than the followed route (a minute's
 * slack: the same route comes out to the second), My Runs says so instead of leaving the question open. Pure.
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
 *  (composables/useNowPage.ts), because the press leaves My Runs for the goal's screen. Keyed by lib/recalc.ts `askGoal`. */
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
