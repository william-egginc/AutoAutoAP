/**
 * The price of a route the player follows (lib/follow.ts), read from what is saved: nothing is worked out here (My
 * runs never computes). In order:
 *
 *   0. (23 Oct 2026, the followed route keeps its timeline) For THIS save only: the instant answer's own route (the
 *      own key's snapshot, its lead or one of its rows: `planFromInstantChain`, times rounded) and the Fast, Exact or
 *      Custom result for the goal (the snapshot's `search`, the store's, the one kept in aap-search-plans:
 *      `results`), when the followed route is that route from the TE now. When both match, the one it was picked
 *      from leads (`prefer`: 'instant' for the instant answer's, else the result's).
 *   0b. An OLDER save's Fast, Exact or Custom result for the goal that is this route (an older snapshot's `search`, or
 *      one kept in aap-search-plans: `olderResults`), the newest first: its timeline, said to be priced on that save
 *      ("priced on your save of …, may have drifted"). An older save's INSTANT plan is never matched.
 *   1. Check exactly's prices kept in the instant answer snapshots (`exact`, every route a check priced: each count's
 *      row, the lead, the hours runner-ups, By a date's lower last stops, and a followed route "Price it" asked for):
 *      the loaded save's own key first, then the account's older snapshots of the same goal, ranked by the current
 *      answer rule (lib/currentAnswer.ts `pickGoalPlan`: this save, then this setup, then checked, then the goal's
 *      measure). The route is matched as each snapshot priced it: the stops above that save's TE.
 *   2. Check exactly's history (finish only, no timeline): the newest check of this goal whose route is the same from
 *      the TE now.
 *   3. Unpriced.
 *
 * Each result says where it came from, so Right now can say "priced on your save of …, may have drifted" for an older
 * save. Pure.
 */
import { SAME_DEADLINE_SECONDS } from '@/search/strongerCheck';
import { pickGoalPlan, type CardCandidate, type SetupCheck } from './currentAnswer';
import { followedFromNow, sameChain } from './follow';
import { planFromExactChain, planFromInstantChain, type NowPlan, type SnapLike } from './nowPlan';
import { planFromSearch, readSearch, type SnapSearch } from './searchPlan';
import type { SnapMeta } from '@/search/instantSnapshot';

/** A kept snapshot to look in. */
export interface FollowSnap {
  snap: SnapLike;
  /** The TE its routes start from (that save's TE); null when not known (the longest priced tail of the route is
   *  taken then). */
  startTE: number | null;
  /** Under the loaded save's own key (this save, this setup). */
  ownKey: boolean;
  check: SetupCheck;
}

/** A Fast, Exact or Custom result of THIS save for the goal (the store's, or the one kept beyond the snapshot). */
export interface FollowResult {
  found: SnapSearch;
  /** The save it was priced from (used when this save has no snapshot for the goal). */
  meta: SnapMeta | null;
  check: SetupCheck;
}

/** A Check exactly history entry (search/checkHistory.ts), the fields read. */
export interface FollowHistory {
  at: number;
  backupTime?: number;
  mode: 'fastest' | 'date';
  target?: number;
  deadline?: number;
  exact: { chain: number[]; end: number; endTE?: number } | null;
}

export type FollowPrice =
  | {
      priced: 'exact';
      /** 'this-save' and 'setup-changed' are the loaded save; 'older-save' an earlier one (`plan.meta.backupTime`). */
      source: 'this-save' | 'setup-changed' | 'older-save';
      plan: NowPlan;
      candidate: CardCandidate;
    }
  | {
      priced: 'finish';
      source: 'history';
      chain: number[];
      end: number;
      endTE: number | null;
      /** When the check ran, ms. */
      at: number;
      /** The save it was priced from, unix seconds; null when not known. */
      backupTime: number | null;
    }
  | { priced: 'none'; chain: number[] };

/** The route as a snapshot from `startTE` priced it: the stops above that TE (the target always kept). */
function asPricedFrom(chain: readonly number[], startTE: number): number[] {
  return followedFromNow(chain, startTE);
}

/** The longest tail of the route a snapshot priced (when its start TE isn't known). */
function longestPricedTail(snap: SnapLike, chain: readonly number[]): number[] | null {
  for (let i = 0; i < chain.length; i++) {
    const tail = chain.slice(i);
    if (snap.exact?.[tail.join(',')]) return tail;
  }
  return null;
}

/** The same route from the TE now: one is the other with stops already passed in front. */
function sameFromNow(a: readonly number[], b: readonly number[], currentTE: number): boolean {
  const x = followedFromNow(a, currentTE);
  const y = followedFromNow(b, currentTE);
  if (!x.length || !sameChain(x, y)) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return sameChain(short, long.slice(long.length - short.length));
}

export function followPrice(o: {
  chain: readonly number[];
  goal: { goal: 'fastest' | 'date'; target: number; deadline: number | null };
  currentTE: number;
  /** The loaded save's time, unix seconds. */
  loadedSave: number;
  snaps: readonly FollowSnap[];
  history: readonly FollowHistory[];
  goalIndex?: number;
  goalKey?: string;
  /** This save's results for the goal beyond its snapshot's `search` (step 0). */
  results?: readonly FollowResult[];
  /** The account's results for the goal kept from OLDER saves (aap-search-plans; step 0b). */
  olderResults?: readonly FollowResult[];
  /** Which leads when the instant answer and a result are both this route: where the route was picked from. */
  prefer?: 'instant' | 'search';
}): FollowPrice {
  const { chain, goal } = o;
  const fromNow = followedFromNow(chain, o.currentTE);
  if (!chain.length || !fromNow.length) return { priced: 'none', chain: fromNow };

  const hits: CardCandidate[] = [];
  const hit = (plan: NowPlan, ownKey: boolean, check: SetupCheck) =>
    hits.push({ plan, goalIndex: o.goalIndex ?? 0, goalKey: o.goalKey, ownKey, check });
  // This save's results: the newest that is this route from the TE now.
  const results = (o.results ?? []).filter(r => sameChain(r.found.chain, fromNow)).sort((a, b) => b.found.at - a.found.at);
  const preferInstant = o.prefer === 'instant';
  let ownDone = false;
  for (const s of o.snaps) {
    const priced = s.startTE != null ? asPricedFrom(chain, s.startTE) : longestPricedTail(s.snap, chain);
    if (!priced || !priced.length) continue;
    // Check exactly's price (snapshots before 23 Oct 2026), from any kept snapshot of the goal.
    let plan = planFromExactChain(s.snap, priced, goal.goal, goal.deadline);
    if (!plan && s.ownKey) {
      // This save's own: the instant answer's route, and its newest result for the goal when it is this route.
      const common = { meta: s.snap.meta ?? null, whatIf: s.snap.whatIf ?? null };
      const inSnap = readSearch(s.snap.search);
      const found = [...(inSnap && sameChain(inSnap.chain, priced) ? [inSnap] : []), ...results.map(r => r.found)].sort((a, b) => b.at - a.at)[0];
      const search = found ? planFromSearch(found, goal.goal, goal.deadline, common) : null;
      const instant = planFromInstantChain(s.snap, priced, goal.goal, goal.deadline);
      plan = preferInstant ? (instant ?? search) : (search ?? instant);
    }
    if (!plan && !s.ownKey) {
      // An older save's (or another setup's) result for the goal, as that snapshot priced the route: never its instant plan.
      const inSnap = readSearch(s.snap.search);
      if (inSnap && sameChain(inSnap.chain, priced))
        plan = planFromSearch(inSnap, goal.goal, goal.deadline, { meta: s.snap.meta ?? null, whatIf: s.snap.whatIf ?? null });
    }
    if (!plan) continue;
    if (s.ownKey) ownDone = true;
    hit(plan, s.ownKey, s.check);
  }
  // No snapshot of this save for the goal (it lasts a day): its result kept beyond it.
  if (!ownDone && results.length) {
    const r = results[0];
    hit(planFromSearch(r.found, goal.goal, goal.deadline, { meta: r.meta, whatIf: null }), true, r.check);
  }
  // Results kept from older saves: the same route from the TE now (one is the other with stops passed in front).
  for (const r of o.olderResults ?? [])
    if (sameFromNow(r.found.chain, chain, o.currentTE))
      hit(planFromSearch(r.found, goal.goal, goal.deadline, { meta: r.meta, whatIf: null }), false, r.check);
  // The player's own pick: priced even when it lands after the date (the card marks it, lib/eggDayRule.ts).
  const pick = pickGoalPlan(hits, o.loadedSave, { anyTime: true });
  if (pick) return { priced: 'exact', source: pick.state, plan: pick.candidate.plan, candidate: pick.candidate };

  const sameGoal = (h: FollowHistory) =>
    goal.goal === 'fastest'
      ? h.mode === 'fastest' && h.target === goal.target
      : h.mode === 'date' && !!goal.deadline && typeof h.deadline === 'number' && Math.abs(h.deadline - goal.deadline) <= SAME_DEADLINE_SECONDS;
  const checked = o.history
    .filter(h => h.exact && Number.isFinite(h.exact.end) && sameGoal(h) && sameFromNow(h.exact.chain, chain, o.currentTE))
    .sort((a, b) => b.at - a.at)[0];
  if (checked?.exact)
    return {
      priced: 'finish',
      source: 'history',
      chain: [...checked.exact.chain],
      end: checked.exact.end,
      endTE: checked.exact.endTE ?? null,
      at: checked.at,
      backupTime: checked.backupTime ?? null,
    };
  return { priced: 'none', chain: fromNow };
}
