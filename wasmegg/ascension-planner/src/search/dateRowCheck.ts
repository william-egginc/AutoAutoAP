/**
 * @module dateRowCheck
 * @description By a date's Check exactly, one count's row (InstantRoute.vue `runExact`): the row's route and, with
 * hours on, its next-best route are priced first (hoursRunnerUp.ts). When neither makes the date on the player's
 * account, this finds the route the row shows.
 *
 * NEARBY EARLY STOPS (Jordan's main, 22 Oct 2026; aaap-tools notes/jordan-310-vs-312.md). Check exactly used to lower
 * ONLY the last stop of a row that missed, keeping its early stops. On the main account (By Jul 14, 2027 10:00 am,
 * hours 7 am to 11 pm) the instant answer said 312-313 and Check exactly said 310, while the board's
 * 197 221 246 277 312 makes the date with about a day to spare: the row's early stops were the ones that lost
 * (on the Oct 18 save the 5-ascension row 197 222 247 285 313 misses by 4.5 days on the simulator, and so does
 * every 197 222 247 X 312 tried, X from 270 to 288).
 * So before any last stop is lowered, the same final TE is tried with:
 *  - the finder's other kept routes for the count (`dateAlternatives[k]`, the runner-up rows), up to
 *    `RUNNER_UPS`;
 *  - each early stop moved by 1 to `NEARBY_SPAN` TE either way, one stop at a time (as Nearby routes does).
 * The best that makes the date leads the row (highest TE, then the most to spare). When none does, the last stop
 * is lowered as before, from the early stops that came CLOSEST to the date (the row's own, unless a nearby one
 * ended sooner), so a lower final TE starts from the better early stops too.
 *
 * Cost: up to `RUNNER_UPS + 2 x NEARBY_SPAN x (ascensions - 1)` extra routes for a row (27 at 5 ascensions), in one
 * call dealt evenly over the workers (`NEARBY_DEAL`). The component runs it only
 * for a row that could beat or tie the best TE the check has so far, and at most `NEARBY_ROWS` rows a check.
 *
 * Pure apart from the `price` it is handed; the component owns the workers.
 */

import type { EvaluateOptions } from './pool';

/** How far each early stop is moved, either way (1, 2 and 3 TE). */
export const NEARBY_SPAN = 3;
/** The finder's other kept routes tried for a row, at most. */
export const RUNNER_UPS = 3;
/** Rows a check tries nearby early stops for, at most (the highest final TE first, then fewer ascensions). One
 *  keeps Check exactly under about twice its old time: on the main account the 5-ascension row's nearby routes
 *  cost 574 s against a whole check of 891 s before (Node, 4 workers). */
export const NEARBY_ROWS = 1;

const key = (chain: readonly number[]) => chain.join(',');

/**
 * How the pool deals the nearby routes: in depth-first order, a contiguous share per worker (routes that move the
 * same stop share their early legs), one route at a time, and a worker that runs out takes the busiest's last ones.
 * The pool's usual split cuts on whole prefixes, so the 18 of 24 routes that keep the first stop all went to ONE
 * worker: the main account's 5-ascension row took 1,400 s that way (Node, 4 workers, another job on the machine)
 * and 574 s dealt like this.
 */
export const NEARBY_DEAL: EvaluateOptions = {
  workerOf: (chains, workers) => chains.map((_, i) => Math.floor((i * workers) / chains.length)),
  piece: 1,
};

/** An exact price as far as the date needs it: the unix second it ends and its TE then. */
export interface DatePrice {
  end: number;
  endTE: number;
}

/** A route that is a valid route from `currentTE`: whole stops, strictly increasing, the first above the player. */
function valid(chain: readonly number[], currentTE: number): boolean {
  if (!chain.length || chain[0] <= Math.floor(currentTE)) return false;
  for (let i = 1; i < chain.length; i++) if (!(chain[i] > chain[i - 1])) return false;
  return chain.every(Number.isInteger);
}

/**
 * The routes to try for a row that misses, in order, without the row itself and without `skip` (routes already
 * priced): the finder's other kept routes for the count with the row's final TE (`RUNNER_UPS` of them), then each
 * early stop moved by 1, 2, ... `span` TE either way, one stop at a time (nearest first). The final TE never moves.
 */
export function nearbyRoutes(
  chain: readonly number[],
  currentTE: number,
  alternatives: readonly { chain: readonly number[] }[] | undefined,
  o: { span?: number; runnerUps?: number; skip?: readonly (readonly number[])[] } = {}
): number[][] {
  const span = o.span ?? NEARBY_SPAN;
  const final = chain[chain.length - 1];
  const seen = new Set<string>([key(chain), ...(o.skip ?? []).map(key)]);
  const out: number[][] = [];
  const add = (c: number[]) => {
    if (!valid(c, currentTE) || c[c.length - 1] !== final || seen.has(key(c))) return;
    seen.add(key(c));
    out.push(c);
  };
  let runnerUps = 0;
  for (const alt of alternatives ?? []) {
    if (runnerUps >= (o.runnerUps ?? RUNNER_UPS)) break;
    if (alt.chain.length !== chain.length) continue;
    const before = out.length;
    add([...alt.chain.slice(0, -1), final]);
    if (out.length > before) runnerUps++;
  }
  for (let d = 1; d <= span; d++)
    for (let i = 0; i < chain.length - 1; i++)
      for (const s of [d, -d]) {
        const c = [...chain];
        c[i] += s;
        add(c);
      }
  return out;
}

/** Of `chains`, the one that makes the date with the highest TE, then the most to spare; null when none does. */
export function bestMaking(
  chains: readonly number[][],
  deadline: number,
  exactOf: (chain: number[]) => DatePrice | null | undefined
): number[] | null {
  let best: number[] | null = null;
  let bestE: DatePrice | null = null;
  for (const c of chains) {
    const e = exactOf(c);
    if (!e || e.end > deadline) continue;
    if (!bestE || e.endTE > bestE.endTE || (e.endTE === bestE.endTE && e.end < bestE.end)) {
      best = c;
      bestE = e;
    }
  }
  return best;
}

/** Of `chains`, the one that ends soonest (the closest to the date); `fallback` when none was priced. */
export function closestTo(
  chains: readonly number[][],
  fallback: readonly number[],
  exactOf: (chain: number[]) => DatePrice | null | undefined
): number[] {
  let best: number[] = [...fallback];
  let bestEnd = exactOf(best)?.end ?? Infinity;
  for (const c of chains) {
    const e = exactOf(c);
    if (e && e.end < bestEnd) {
      best = c;
      bestEnd = e.end;
    }
  }
  return best;
}

/**
 * Whether a row that misses is worth nearby early stops: its final TE could beat the best TE the check has so far
 * (`best`, null for none), or tie it with fewer ascensions (prefer fewer ascensions reads that).
 */
export function worthNearby(final: number, ascensions: number, best: { endTE: number; ascensions: number } | null): boolean {
  if (!best) return true;
  return final > best.endTE || (final === best.endTE && ascensions < best.ascensions);
}

/** What `settleDateRow` found for one row. */
export interface SettledRow {
  /** False: stopped (a newer check started). */
  ok: boolean;
  /** The route that makes the date for the row: the row's own, a nearby one, or one with a lower last stop.
   *  Null when nothing does (or only the runner-up does: `altMade`). */
  made: number[] | null;
  /** The hours runner-up, when it makes the date (the component's swap reads it). */
  altMade: number[] | null;
  /** Routes priced here beyond the row and its runner-up: nearby early stops, and lower last stops. */
  nearbyPriced: number;
  lowerPriced: number;
}

/**
 * One count's row, after the row's route (and with hours on its runner-up `alt`) were priced: the route that makes
 * the date. Neither makes it: with `nearby`, the nearby early stops first (`nearbyRoutes`, one `price(…, 'nearby')`
 * call); then, when none of those makes it either, lower last stops three at a time (`price(…, 'lower')`, which the
 * component keeps on one worker, sticky on the early stops) from the early stops that came closest.
 */
export async function settleDateRow(o: {
  chain: readonly number[];
  alt: readonly number[] | null;
  currentTE: number;
  deadline: number;
  /** The finder's other kept routes for the count (`dateAlternatives[k]`). */
  alternatives?: readonly { chain: readonly number[] }[];
  /** Try nearby early stops before lowering the last stop. */
  nearby: boolean;
  exactOf: (chain: number[]) => DatePrice | null | undefined;
  price: (chains: number[][], how: 'nearby' | 'lower') => Promise<boolean>;
  /** Progress, for the line under the check. */
  say?: (what: { kind: 'nearby'; routes: number } | { kind: 'lower'; stops: number[] }) => void;
}): Promise<SettledRow> {
  const chain = [...o.chain];
  const makes = (c: readonly number[] | null): number[] | null => {
    if (!c) return null;
    const e = o.exactOf([...c]);
    return e && e.end <= o.deadline ? [...c] : null;
  };
  let made = makes(chain);
  const altMade = makes(o.alt);
  const out = (ok: boolean): SettledRow => ({ ok, made, altMade, nearbyPriced, lowerPriced });
  let nearbyPriced = 0;
  let lowerPriced = 0;
  if (made || altMade) return out(true);

  let from = chain;
  if (o.nearby) {
    const tries = nearbyRoutes(chain, o.currentTE, o.alternatives, { skip: o.alt ? [o.alt] : [] });
    if (tries.length) {
      o.say?.({ kind: 'nearby', routes: tries.length });
      nearbyPriced = tries.length;
      if (!(await o.price(tries, 'nearby'))) return out(false);
      made = bestMaking(tries, o.deadline, o.exactOf);
      if (made) return out(true);
      from = closestTo(tries, chain, o.exactOf);
    }
  }
  // Lower last stops only when nothing at the row's TE makes it (a lower one reaches less TE).
  const prefix = from.slice(0, -1);
  const floor = prefix.length ? prefix[prefix.length - 1] : Math.floor(o.currentTE);
  for (let hi = from[from.length - 1] - 1; hi > floor && !made; hi -= 3) {
    const tries = [hi, hi - 1, hi - 2].filter(t => t > floor).map(t => [...prefix, t]);
    o.say?.({ kind: 'lower', stops: tries.map(c => c[c.length - 1]) });
    lowerPriced += tries.length;
    if (!(await o.price(tries, 'lower'))) return out(false);
    made = bestMaking(tries, o.deadline, o.exactOf);
  }
  return out(true);
}
