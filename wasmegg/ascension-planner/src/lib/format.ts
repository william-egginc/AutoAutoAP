/**
 * Formatting utility functions.
 * Pure functions for converting values to display strings.
 *
 * Most of them live in lib/planners/format.ts, shared with the other planner. formatAbsoluteTime stays here:
 * it goes through this planner's one clock (lib/clock.ts), in the browser's own format.
 */

import { formatNumber } from 'lib/planners/format';
import { formatMoment } from './clock';
import { compactDuration } from './duration';
export { formatPrice, secondsToDate, formatNumber, formatWithReference, formatFullNumber, formatMultiplier, formatDuration, formatPercent, parseNumber, parseDuration, formatUnixToDateInput, formatUnixToTimeInput } from 'lib/planners/format';

/**
 * Format a gem price.
 * If the cost is under 1,000, don't show any decimals.
 * If the cost is 1,000 or more, show with 3 decimal places.
 */
export function formatGemPrice(price: number): string {
  return formatNumber(price, price < 1000 ? 0 : 3);
}

/**
 * Format an absolute completion time based on a duration in seconds.
 *
 * @param seconds - Duration in seconds from the base timestamp
 * @param baseTimestamp - Base Unix timestamp in milliseconds (defaults to Date.now())
 * @param timeZone - Optional IANA timezone identifier
 * @returns Formatted absolute time string
 *
 * @example
 * formatAbsoluteTime(3600) // e.g., "Tue, Feb 24, 5:43 PM" (en-US)
 */
export function formatAbsoluteTime(seconds: number, baseTimestamp?: number, timeZone?: string): string {
  if (!isFinite(seconds)) return '∞';
  const start = baseTimestamp ?? Date.now();
  // `Math.round`, not a bare `new Date(...)` — see `secondsToDate`'s doc comment for why a
  // sub-millisecond float residue (routine after accumulating many purchases/waits) needs rounding
  // rather than truncation here, or a value a fraction of a second short of a whole second displays
  // as a full second (and, in an HH:MM-only view, a full minute) early.
  const date = new Date(Math.round(start + seconds * 1000));
  // Finite but past what a Date can hold (a wait of billions of days): '∞', not 'Invalid Date'.
  if (isNaN(date.getTime())) return '∞';
  // The one clock (lib/clock.ts), in the browser's own format like every other panel.
  return formatMoment(date.getTime(), { zone: timeZone, weekday: true, year: 'never' }) || '∞';
}

/** "1 chain", "2 chains" (counts get thousands separators). Pass `many` for an irregular plural. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/**
 * A gap between two finishes for a dense table (UX review, 25 Oct 2026: "+3302.72 days" promised a precision the
 * instant answer doesn't have), in the one compact duration (lib/duration, ux29-d): "40m", "17h", "3d 10h", "312d",
 * "9 years". Sign dropped (the caller says sooner/later). `locale` is kept for callers; the words are compact.
 */
export function roundedGap(seconds: number, _locale?: string): string {
  return compactDuration(Math.max(60, Math.abs(seconds)));
}

/**
 * A span in the answer's headline ("5d 12h to spare", "in 5.1 years"; the UX review of 26 Oct 2026, item 4: the
 * headline showed "5.50 days" and "1857.95 days"), in the one compact duration (lib/duration, ux29-d). Under a
 * minute reads "1m"; a negative span keeps its sign.
 */
export function headlineGap(seconds: number, _locale?: string): string {
  const sign = seconds < 0 ? '−' : '';
  return `${sign}${compactDuration(Math.max(60, Math.abs(seconds)))}`;
}
