/**
 * THE POINTER ON THE INSTANT CARD (wireframes/price-route-v2, Jordan 23 Oct 2026): the instant answer's numbers never
 * change by themselves; once a Fast, Exact or Custom search has a finished result for the same goal on this save, the
 * instant card gains one line, "Fast found 312 TE on your account. See it ↓" (By a date) or "Fast found Feb 8, 2028
 * at 9:10 am on your account. See it ↓" (Fastest), and nothing else on it changes. The link scrolls to the result.
 *
 * Pure: InstantRoute.vue reads the chain-search store and hands the finished result here.
 */

import type { LegSummary } from '@/search/types';
import { firstLegShifts, oneMoreTE, type FirstShift, type OneMoreTE } from '@/search/routeExtras';

/** A search's level as the panel names it (lib/searchOption.ts): Fast, Exact or Custom. */
export type FoundLevel = 'Fast' | 'Exact' | 'Custom';

/**
 * The level a finished result was found at. Fastest: the run's kind ('full' is Custom) and its effort
 * (quick Fast, normal or thorough Exact). By a date: `simple` runs are Fast or Exact by their level,
 * the others (boxes) Custom.
 */
export function foundLevel(o: { custom: boolean; effort: string | null | undefined }): FoundLevel {
  if (o.custom) return 'Custom';
  return o.effort === 'normal' || o.effort === 'thorough' || o.effort === 'balanced' ? 'Exact' : 'Fast';
}

/** A finished search result for the instant card's goal: where it ends and the TE it reaches. */
export interface FoundResult {
  level: FoundLevel;
  chain: number[];
  /** Unix second it reaches the target (Fastest) or its last stop (By a date). */
  end: number;
  endTE: number;
}

export interface Pointer {
  level: FoundLevel;
  /** The number in bold: "312 TE", or the finish date. */
  value: string;
  /** The whole sentence, without the link. */
  text: string;
}

/** The pointer line's words for a result, or null with none. */
export function pointerOf(
  goal: 'date' | 'fastest',
  found: FoundResult | null,
  show: (unix: number) => string
): Pointer | null {
  if (!found || !found.chain.length) return null;
  const value = goal === 'date' ? `${Math.floor(found.endTE)} TE` : show(found.end);
  return { level: found.level, value, text: `${found.level} found ${value} on your account.` };
}

/** The link after the sentence. */
export const POINTER_LINK = 'See it ↓';

/**
 * The one line under the instant answer (Jordan, 23 Oct 2026), in place of the longer disclaimers that said the same:
 * the instant answer is worked out ahead of time; for one priced on the player's account, a search below.
 */
export const INSTANT_ONE_LINE =
  'These are instant answers, worked out ahead of time. For an answer priced on your account (your hours, your current ascension, your gear), run Fast, Exact or Custom below.';

/**
 * HOOK, NOT WIRED (23 Oct 2026): "First ascension: 3 egg shifts, Thu Oct 22, 4 pm to Fri Oct 23, 2 am" and "One more
 * TE (314): …" left the instant card with Check exactly, since they need the simulator's first leg (its shifts) and
 * the route's last leg on the account. The engine branch (spec-instant2) will simulate the current ascension live
 * again; when it does, hand its result here and mount RouteExtras.vue under the green box with what comes back
 * (InstantRoute.vue marks the spot, "HOOK: First ascension"). The words are RouteExtras's own, the same as on the
 * Fastest and By a date result cards: this only checks the input and passes the same values on.
 */
export interface LiveFirstLeg {
  /** The instant answer's route the live leg belongs to. */
  chain: number[];
  /** The simulated legs: at least the first (the current ascension) with its shifts. */
  legs: LegSummary[];
  /** Unix second the route's last stop is reached (the instant answer's, until the whole route is simulated). */
  reachAt: number;
}

/** What RouteExtras shows for the live first leg: its props, and the shifts and one more TE it would word. */
export function firstAscensionFromLiveLeg(live: LiveFirstLeg | null): {
  props: { chain: number[]; legs: LegSummary[]; reachAt: number };
  shifts: FirstShift[];
  oneMore: OneMoreTE | null;
} | null {
  if (!live || !live.chain.length || !live.legs.length || !(live.reachAt > 0)) return null;
  return {
    props: { chain: [...live.chain], legs: live.legs, reachAt: live.reachAt },
    shifts: firstLegShifts(live.legs),
    oneMore: oneMoreTE({ chain: live.chain, legs: live.legs, reachAt: live.reachAt }),
  };
}
