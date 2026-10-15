/**
 * The search limits follow the instant answer (Jordan, 14 Oct 2026; Allan on Discord: Fast ran inside
 * 5-8 while the instant answer's best was 4, so it never looked at 4).
 *
 * Until the player sets a limit, it sits two either side of the instant answer's fastest route's
 * ascension count (counted as the route's length, the final target included, as the Limits box counts).
 * A limit the player set (or a carried-on run put back, or a link wrote on purpose) is never moved.
 */

/** The Limits box's own bounds: "Fewest ascensions" min 2, "Most ascensions" max 12. */
export const LIMIT_FLOOR = 2;
export const LIMIT_CEIL = 12;
/** How far either side of the instant answer's count the limits reach. */
export const LIMIT_SPREAD = 2;
/** The limits before any instant answer (the old fixed defaults). */
export const DEFAULT_LIMITS: Limits = { min: 5, max: 8 };

export interface Limits {
  min: number;
  max: number;
}
export interface LimitsTouched {
  min: boolean;
  max: boolean;
}

/** The limits the instant answer's best count asks for, or null without a usable count. */
export function limitsFromBest(best: number | null | undefined): Limits | null {
  if (best === null || best === undefined || !Number.isFinite(best) || best < 1) return null;
  const n = Math.floor(best);
  const max = Math.min(LIMIT_CEIL, Math.max(LIMIT_FLOOR, n + LIMIT_SPREAD));
  const min = Math.min(max, Math.max(LIMIT_FLOOR, n - LIMIT_SPREAD));
  return { min, max };
}

/**
 * The limits to show now: each field the player has not set takes the instant answer's; a set one
 * stays. A follower that would cross a set field is held to it (min never above max). Nothing moves
 * without a best count, or while a search is going or being carried on (`idle` false).
 */
export function followLimits(
  current: Limits,
  best: number | null | undefined,
  touched: LimitsTouched,
  idle: boolean
): Limits {
  const want = limitsFromBest(best);
  if (!idle || !want) return current;
  let min = touched.min ? current.min : want.min;
  let max = touched.max ? current.max : want.max;
  if (min > max) {
    if (!touched.max) max = min;
    else if (!touched.min) min = max;
  }
  return { min, max };
}

/** Which fields follow the instant answer right now (for the grey hint). */
export function followingFields(
  current: Limits,
  best: number | null | undefined,
  touched: LimitsTouched
): LimitsTouched {
  const want = limitsFromBest(best);
  if (!want) return { min: false, max: false };
  return {
    min: !touched.min && current.min === want.min,
    max: !touched.max && current.max === want.max,
  };
}

/** The grey hint beside the limit inputs: '' when neither follows. */
export function limitsHint(following: LimitsTouched): string {
  if (following.min && following.max) return '(from the instant answer)';
  if (following.min) return '(fewest from the instant answer)';
  if (following.max) return '(most from the instant answer)';
  return '';
}

/**
 * By a date's Exhaustive box count: the instant answer's best route's ascensions, held to the box's
 * own 1..`maxAsc`; null without one.
 */
export function boxCountFromBest(best: number | null | undefined, maxAsc = 8): number | null {
  if (best === null || best === undefined || !Number.isFinite(best) || best < 1) return null;
  return Math.max(1, Math.min(maxAsc, Math.floor(best)));
}

/** The carry-on box's line when the run's own limits differ from the box's now: '' otherwise. */
export function carryOnLimitsNote(kept: Limits | null, current: Limits): string {
  if (!kept || (kept.min === current.min && kept.max === current.max)) return '';
  return `It searches under its own limits, ${kept.min} to ${kept.max} ascensions, as it started (the Limits box reads ${current.min} to ${current.max} now).`;
}
