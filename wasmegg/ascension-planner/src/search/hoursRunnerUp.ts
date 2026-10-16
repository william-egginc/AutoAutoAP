/**
 * @module hoursRunnerUp
 * @description HOURS FIX B (the Tables chat, 16 Oct 2026). With the player's hours on ("Let me pick my
 * hours"), the exact simulator holds the SHIFTS inside each ascension until their hours; the instant answer's
 * tables are simulated at any hour and can't see that. That moves each route by 4-7 h, enough to flip a near
 * tie: the alt (Oct 10 save, Egg Day, 7 am to 11 pm) has the table's pick 161 198 224 248 at 10.4 h to spare
 * exactly, while the route the table ranked second, 161 198 218 248, has 16.8 h.
 *
 * So with hours on, Check exactly (InstantRoute.vue `runExact`) and Light at once (StrongerCheck.vue,
 * lightAtOnce.ts) also price each count's NEXT-BEST route, the first of the finder's other kept routes for that
 * count (routeFinder.ts `FoundRoutes.alternatives[k]`, By a date `dateAlternatives[k]`) that is not the row's
 * route, and the better of the two by the goal's measure leads the row. Cost: about one extra exact route per
 * count. With hours off nothing changes: only the row's route is priced.
 *
 * Pure: which routes to price, which wins, and the row's swap and note. The component owns the workers.
 */
import type { FoundRoutes, Route } from './routeFinder';
import { BETTER_BY_SECONDS } from './strongerCheck';

const key = (chain: readonly number[]) => chain.join(',');

/** The count's next-best route: the first of the finder's other kept routes (earliest first) that is not the
 *  row's route `pick` (the polish can have moved the pick onto one of them). Null when there is none. */
export function nextBest(pick: readonly number[], alternatives: readonly Route[] | undefined): Route | null {
  return (alternatives ?? []).find(r => r.chain.length > 0 && key(r.chain) !== key(pick)) ?? null;
}

/** The routes to price for one count: the row's route, and with hours on its next-best route too (once). */
export function routesToPrice(
  pick: readonly number[],
  alternative: readonly number[] | null | undefined,
  hoursOn: boolean
): number[][] {
  const out = [[...pick]];
  if (hoursOn && alternative?.length && key(alternative) !== key(pick)) out.push([...alternative]);
  return out;
}

/** An exact price, as far as the winner needs it: the unix second it ends and its TE then. */
export interface ExactEnd {
  end: number;
  endTE: number;
}

/** Why the runner-up won: sooner (Fastest), or by a date it makes the date when the pick misses, reaches
 *  more TE, or has more to spare. */
export type SecondWhy = 'sooner' | 'makes' | 'higher' | 'spare';

/** The goal a count's two exact prices are compared by. */
export type WinGoal = { kind: 'fastest' } | { kind: 'date'; deadline: number };

/**
 * The better of a count's two exact prices: 'alt' only when the runner-up is really better (Fastest: sooner by
 * over a minute; By a date: it makes the date and the pick doesn't, or a higher TE, or the same TE with more to
 * spare by over a minute), else 'pick' (ties stay with the table's pick). Null prices could not be priced.
 */
export function exactWinner(
  goal: WinGoal,
  pick: ExactEnd | null | undefined,
  alt: ExactEnd | null | undefined
): { winner: 'pick' | 'alt'; why?: SecondWhy } {
  if (!alt) return { winner: 'pick' };
  if (goal.kind === 'fastest') {
    if (!pick || alt.end < pick.end - BETTER_BY_SECONDS) return { winner: 'alt', why: 'sooner' };
    return { winner: 'pick' };
  }
  if (alt.end > goal.deadline) return { winner: 'pick' };
  if (!pick || pick.end > goal.deadline) return { winner: 'alt', why: 'makes' };
  if (alt.endTE > pick.endTE) return { winner: 'alt', why: 'higher' };
  if (alt.endTE === pick.endTE && alt.end < pick.end - BETTER_BY_SECONDS) return { winner: 'alt', why: 'spare' };
  return { winner: 'pick' };
}

/** A count whose runner-up won: the table's pick it replaced, why, and the pick's exact end (null: it could
 *  not be priced). Kept with the answer's snapshot for the row's note. */
export interface SecondWin {
  pick: number[];
  winner: number[];
  why: SecondWhy;
  pickEnd: number | null;
}

/** `found` with each winning runner-up in its count's place (Fastest rows). The table's overall pick
 *  (`best`) stays, so "the instant answer ranked … first" still names the table's own. */
export function withWinners(found: FoundRoutes, wins: Record<number, { winner: Route }>): FoundRoutes {
  if (!Object.keys(wins).length) return found;
  return { ...found, byAscensions: found.byAscensions.map((r, k) => wins[k]?.winner ?? r) };
}

/** `found` with the table's picks back where a runner-up had replaced them (a check run again starts from the
 *  table's own routes). Only where the row still holds that runner-up. */
export function withPicks(found: FoundRoutes, wins: Record<number, { pick: Route; winner: Route }>): FoundRoutes {
  let changed = false;
  const byAscensions = found.byAscensions.map((r, k) => {
    const w = wins[k];
    if (r && w && key(r.chain) === key(w.winner.chain)) {
      changed = true;
      return w.pick;
    }
    return r;
  });
  return changed ? { ...found, byAscensions } : found;
}

/** The row's small note when the route the table ranked second leads it. `gap`: how much later the pick
 *  ends (Fastest) or how much less it has to spare (By a date, 'spare'), in the table's days, when known. */
export function secondNote(why: SecondWhy, pick: readonly number[], gap?: string): string {
  const route = pick.join(' ');
  const [what, tail] =
    why === 'sooner'
      ? ['finishes sooner', gap ? `its pick ${route} is ${gap} later` : `its pick was ${route}`]
      : why === 'makes'
        ? ['makes the date', `its pick ${route} misses it`]
        : why === 'higher'
          ? ['reaches more TE', `its pick was ${route}`]
          : ['has more to spare', gap ? `its pick ${route} has ${gap} less` : `its pick was ${route}`];
  return `A route the instant answer ranked second ${what} with your hours (${tail}).`;
}

/** A count whose runner-up won, with both Routes (the component swaps `winner` into the row). */
export interface RowWin {
  pick: Route;
  winner: Route;
  why: SecondWhy;
}

/**
 * Check exactly's pricing of some rows (InstantRoute.vue `runExact`): each row's route and, with hours on, its
 * next-best route (`nextBest` over `alternatives[k]`) in ONE `price` call (the pool deals them one per worker),
 * then each count's winner by `exactWinner` on what `exactOf` now gives. `price` is the component's own
 * (pool.evaluate into the Exact map); false when it was stopped. With hours off: one `price` call with the
 * rows' own routes, as before, and no wins.
 */
export async function priceWithRunnerUps(o: {
  goal: WinGoal;
  rows: readonly Route[];
  /** By count: the finder's other kept routes (Fastest `alternatives`, By a date `dateAlternatives`). */
  alternatives: readonly (readonly Route[] | undefined)[] | undefined;
  hoursOn: boolean;
  price: (chains: number[][]) => Promise<boolean>;
  exactOf: (chain: number[]) => ExactEnd | null | undefined;
}): Promise<{ ok: boolean; alts: Record<number, Route>; wins: Record<number, RowWin> }> {
  const alts: Record<number, Route> = {};
  const chains: number[][] = [];
  for (const r of o.rows) {
    const k = r.legs.length;
    const alt = o.hoursOn ? nextBest(r.chain, o.alternatives?.[k]) : null;
    if (alt) alts[k] = alt;
    chains.push(...routesToPrice(r.chain, alt?.chain ?? null, o.hoursOn));
  }
  const wins: Record<number, RowWin> = {};
  if (!(await o.price(chains))) return { ok: false, alts, wins };
  for (const r of o.rows) {
    const k = r.legs.length;
    const alt = alts[k];
    if (!alt) continue;
    const w = exactWinner(o.goal, o.exactOf(r.chain), o.exactOf(alt.chain));
    if (w.winner === 'alt') wins[k] = { pick: r, winner: alt, why: w.why! };
  }
  return { ok: true, alts, wins };
}
