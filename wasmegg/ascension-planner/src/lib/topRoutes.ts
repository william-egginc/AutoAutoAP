/**
 * MORE THAN THE SINGLE BEST (item 12, beta feedback 27 Oct 2026): the few best routes a search priced, and the best
 * for each number of ascensions, from what the run already kept (Fastest: the store's priced routes, `allEntries()`;
 * Highest TE by a date: the result's top routes and its best for each stop count). Nothing here searches or prices.
 *
 * Best is the goal's own order:
 *   Fastest to N TE      the earliest finish;
 *   Highest TE by a date the highest last stop, then the earliest it is reached (the most spare).
 * Ties keep the same rank ("1, 1, 3") and list fewer ascensions first, then the lower route, so the order never
 * depends on the order the routes came in. A route past the per-ascension detail cap has no legs but still has its
 * route and finish, so it ranks like any other (`hasLegs` only says whether its timings can be shown).
 */
import { compactDuration } from './duration';

export type TopGoal = 'fastest' | 'date';

/** One priced route, as both goals keep it. */
export interface PricedRoute {
  /** The stops, one per ascension; the last is the TE reached. */
  chain: readonly number[];
  /** When the last stop is reached, unix seconds. */
  finish: number;
  /** It still carries its per-ascension detail (legs); false past the cap. */
  hasLegs: boolean;
}

export interface RankedRoute extends PricedRoute {
  /** 1 for the best; tied routes share a rank. */
  rank: number;
  /** The single best: the first of the list (one route even when tied). */
  best: boolean;
  ascensions: number;
  /** The last stop. */
  te: number;
  /** Seconds after the best's finish (0 for the best, can be negative on By a date for a lower TE reached sooner). */
  behindSeconds: number;
  /** TE below the best's last stop (always 0 on Fastest, where every route ends at the target). */
  behindTE: number;
}

const usable = (r: PricedRoute) => r.chain.length > 0 && Number.isFinite(r.finish) && r.finish > 0;
const lastOf = (r: PricedRoute) => r.chain[r.chain.length - 1];

/** The goal's own order: negative when `a` is better. Equal (0) only for a true tie on what the goal measures. */
function primary(goal: TopGoal, a: PricedRoute, b: PricedRoute): number {
  if (goal === 'date') {
    const te = lastOf(b) - lastOf(a);
    if (te) return te;
  }
  return a.finish - b.finish;
}

/** The full order: the goal's, then fewer ascensions, then the lower route stop by stop. */
export function compareRoutes(goal: TopGoal, a: PricedRoute, b: PricedRoute): number {
  const p = primary(goal, a, b);
  if (p) return p;
  if (a.chain.length !== b.chain.length) return a.chain.length - b.chain.length;
  for (let i = 0; i < a.chain.length; i++) if (a.chain[i] !== b.chain[i]) return a.chain[i] - b.chain[i];
  return 0;
}

/** One entry per route (the better if a route came twice), the unusable dropped, best first. */
function sorted(routes: readonly PricedRoute[], goal: TopGoal): PricedRoute[] {
  const byKey = new Map<string, PricedRoute>();
  for (const r of routes) {
    if (!usable(r)) continue;
    const k = r.chain.join(',');
    const had = byKey.get(k);
    if (!had || compareRoutes(goal, r, had) < 0 || (r.hasLegs && !had.hasLegs && compareRoutes(goal, r, had) === 0)) {
      byKey.set(k, r);
    }
  }
  return [...byKey.values()].sort((a, b) => compareRoutes(goal, a, b));
}

function ranked(list: PricedRoute[], goal: TopGoal, best: PricedRoute, rankOf: (i: number) => number): RankedRoute[] {
  return list.map((r, i) => ({
    chain: r.chain,
    finish: r.finish,
    hasLegs: r.hasLegs,
    rank: rankOf(i),
    best: r === best,
    ascensions: r.chain.length,
    te: lastOf(r),
    behindSeconds: r.finish - best.finish,
    behindTE: goal === 'date' ? lastOf(best) - lastOf(r) : 0,
  }));
}

/** Competition ranks over a best-first list: a route tied with the one before it takes its rank. */
function ranksOf(list: PricedRoute[], goal: TopGoal): number[] {
  const out: number[] = [];
  list.forEach((r, i) => out.push(i > 0 && primary(goal, list[i - 1], r) === 0 ? out[i - 1] : i + 1));
  return out;
}

/** The best `n` routes, best first. Empty for no usable route. */
export function topN(routes: readonly PricedRoute[], goal: TopGoal, n = 5): RankedRoute[] {
  const all = sorted(routes, goal);
  if (!all.length || n <= 0) return [];
  const ranks = ranksOf(all, goal);
  return ranked(all.slice(0, n), goal, all[0], i => ranks[i]);
}

/** The best route for each number of ascensions, fewest ascensions first; `best` marks the overall best, and
 *  `rank` orders the counts by their best (1 = the count of the overall best). */
export function bestPerCount(routes: readonly PricedRoute[], goal: TopGoal): RankedRoute[] {
  const all = sorted(routes, goal);
  if (!all.length) return [];
  const perCount = new Map<number, PricedRoute>();
  for (const r of all) if (!perCount.has(r.chain.length)) perCount.set(r.chain.length, r);
  const bestFirst = [...perCount.values()];
  const ranks = ranksOf(bestFirst, goal);
  const rankOf = new Map(bestFirst.map((r, i) => [r, ranks[i]]));
  const byCount = [...bestFirst].sort((a, b) => a.chain.length - b.chain.length);
  return ranked(byCount, goal, all[0], i => rankOf.get(byCount[i])!);
}

/** What `topN` and `bestPerCount` need and nothing more: a store can keep this short list instead of every route. */
export function keptForTop(routes: readonly PricedRoute[], goal: TopGoal, n = 5): PricedRoute[] {
  const seen = new Set<string>();
  const out: PricedRoute[] = [];
  for (const r of [...topN(routes, goal, n), ...bestPerCount(routes, goal)]) {
    const k = r.chain.join(',');
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ chain: r.chain, finish: r.finish, hasLegs: r.hasLegs });
  }
  return out;
}

/** How far behind the best, in a few characters: "best", "+3h 12m", "same time"; By a date "2 TE lower" or
 *  "+5h later" for the same last stop reached later. */
export function behindLabel(goal: TopGoal, r: RankedRoute): string {
  if (r.best) return 'best';
  if (goal === 'date' && r.behindTE > 0) return `${r.behindTE} TE lower`;
  if (r.behindSeconds <= 0) return goal === 'date' ? 'same TE, same time' : 'same time';
  return goal === 'date' ? `+${compactDuration(r.behindSeconds)} later` : `+${compactDuration(r.behindSeconds)}`;
}
