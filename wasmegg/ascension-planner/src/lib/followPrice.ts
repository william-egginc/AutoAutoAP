/**
 * The price of a route the player follows (lib/follow.ts), read from what is saved: nothing is worked out here (My
 * runs never computes). In order:
 *
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
import { planFromExactChain, type NowPlan, type SnapLike } from './nowPlan';

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
}): FollowPrice {
  const { chain, goal } = o;
  const fromNow = followedFromNow(chain, o.currentTE);
  if (!chain.length || !fromNow.length) return { priced: 'none', chain: fromNow };

  const hits: CardCandidate[] = [];
  for (const s of o.snaps) {
    const priced = s.startTE != null ? asPricedFrom(chain, s.startTE) : longestPricedTail(s.snap, chain);
    if (!priced || !priced.length) continue;
    const plan = planFromExactChain(s.snap, priced, goal.goal, goal.deadline);
    if (!plan) continue;
    hits.push({ plan, goalIndex: o.goalIndex ?? 0, goalKey: o.goalKey, ownKey: s.ownKey, check: s.check });
  }
  const pick = pickGoalPlan(hits, o.loadedSave);
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
