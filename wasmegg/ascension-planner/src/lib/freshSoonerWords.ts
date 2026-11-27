/**
 * The words of "starting fresh would be sooner" (lib/freshSooner.ts; spec-r7verify, 1 Nov 2026).
 * Wording only (lib/resultCodeHash.ts `isWordingOnly`): a change here never recomputes a kept result.
 */
import { dateAt } from './eventWhen';
import { compactDuration } from './duration';
import type { FreshSooner } from './freshSooner';

/** The button on the line. */
export const SWITCH_TO_FASTEST = 'Switch to Soonest';
/** The button that takes the override back. */
export const UNDO_FASTEST = 'Undo';

/** "Starting fresh would end this ascension 6d 12h sooner: Dec 27 at 8:31 PM instead of Jan 2, 2027 at 8:58 PM." Dates
 *  in the zone given, the shared formatter (lib/eventWhen.ts `dateAt`). */
export function freshSoonerLine(f: FreshSooner, nowSeconds: number, zone: string): string {
  return `Starting fresh would end this ascension ${compactDuration(f.seconds)} sooner: ${dateAt(f.freshEnd, nowSeconds, zone)} instead of ${dateAt(f.legEnd, nowSeconds, zone)}.`;
}

/** While the override holds. */
export const FASTEST_FOLLOWED_LINE = 'Following Soonest for this ascension only. Your Setup is unchanged.';
