/**
 * The default ascension-count range on Fastest and By a date (Jordan, 22 Oct 2026): from 3 to one more than the
 * instant answer's count, instead of fixed numbers.
 *
 * The count is the route the instant answer's box leads with: under "Prefer fewer ascensions" (search/preferFewer.ts)
 * the chosen route's, else the best. So a player who prefers fewer gets a range around the count they prefer, not
 * just the fastest.
 *
 * When the count is below 3 the range starts at the count itself, so it always holds that count (best 2: 2 to 3).
 * Without an instant answer (no table, a route below its range, still loading) the caller keeps its old fixed
 * default. Pure: no Vue, no stores.
 */

/** The low end of the range. */
export const RANGE_LOW = 3;

export interface AscRange {
  min: number;
  max: number;
}

/** The box's own bounds (Fastest's Limits box 2..12; By a date's 1..12). */
export interface AscBounds {
  floor: number;
  ceil: number;
}

/** By a date's Nearby routes: 1 to 12 ascensions (the instant answer's counts), and 1 to 5 without an instant
 *  answer (the suggested routes it always tried then). */
export const DATE_RANGE_BOUNDS: AscBounds = { floor: 1, ceil: 12 };
export const DATE_RANGE_FALLBACK: AscRange = { min: 1, max: 5 };

/** What the range reads of a Prefer fewer choice (search/preferFewer.ts PreferChoice). */
export interface CountChoice {
  state: 'off' | 'only' | 'none' | 'fewer';
  best: { ascensions: number };
  chosen: { ascensions: number };
}

/** The count the range follows: the chosen route's when Prefer fewer picked one, else the best's; null without one. */
export function followedCount(choice: CountChoice | null | undefined): number | null {
  if (!choice) return null;
  const n = choice.state === 'fewer' ? choice.chosen.ascensions : choice.best.ascensions;
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
}

/** The range for a count, held to the box's bounds; null without a usable count. */
export function rangeFromCount(count: number | null | undefined, bounds: AscBounds): AscRange | null {
  if (count === null || count === undefined || !Number.isFinite(count) || count < 1) return null;
  const n = Math.floor(count);
  const clamp = (v: number) => Math.min(bounds.ceil, Math.max(bounds.floor, v));
  const max = clamp(n + 1);
  const min = Math.min(max, clamp(Math.min(RANGE_LOW, n)));
  return { min, max };
}

/**
 * The range to use now: each end the player set stays (`own`, null for one they have not), the others take the
 * instant answer's range, or `fallback` without one. A followed end never crosses a set one.
 */
export function rangeNow(
  count: number | null | undefined,
  bounds: AscBounds,
  fallback: AscRange,
  own: { min: number | null; max: number | null }
): AscRange {
  const want = rangeFromCount(count, bounds) ?? fallback;
  let min = own.min ?? want.min;
  let max = own.max ?? want.max;
  if (min > max) {
    if (own.max === null) max = min;
    else if (own.min === null) min = max;
  }
  return { min, max };
}
