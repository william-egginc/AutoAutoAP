/**
 * How long a fresh ascension's opening runs: from its start to the shift into C3 (C1, K1, I1, C2, K2 and R1 come
 * before it), with nothing held. The held opening (search/routeFinder.ts `heldOpeningStart`) needs it and the table
 * does not store it (a version 2 cell's held replay starts at H1), so this is a measured curve: a stopgap until the
 * table stores each build's opening shifts (notes/heldfix.md).
 *
 * MEASURED (24 Oct 2026): `runUntilShift(startStateAt(te), 'C3')` as search/tableBuild.ts `buildAt` runs it, on the
 * maxed table's own account (the alt save with `--reference`, as table-v2.bin was made) at every TE from 55 to 360
 * but one (TE 113 takes the longer of its neighbours), with main's own account in a few even TEs above 186 (the two
 * gave the same to the second on all 34 TEs both were run at). At four hours of the week: Monday 00:00 Pacific
 * (QUIET: every hour away from the sale tried gave the same to the minute), the weekly research sale starting an hour
 * in (STARTS), inside it (INSIDE: three hours tried, the same), and ending an hour in (ENDS). In tenths of an hour,
 * rounded up. Not monotone in TE: it jumps by hours where a build first affords a bigger hab or research, then
 * shrinks as the TE grows. Above 360 no route continues (routeFinder.ts USEFUL_STOP_MAX) and the opening was under an
 * hour and a quarter on every account measured (main, the alt and a weaker one, every 10 TE): 1.2 h.
 */
import { getNextSaleEnd, getNextSaleStart, isResearchSaleActive } from '@/lib/events';

const FROM = 55;
// prettier-ignore
const QUIET = [
  44, 44, 39, 61, 55, 48, 43, 39, 37, 34, 31, 29, 51, 47, 43, 31, 26, 25, 23, 21, 20, 19, 17, 16, 14, 16, 16, 16, 15, 14,
  16, 53, 49, 45, 43, 40, 37, 68, 63, 51, 46, 41, 37, 33, 30, 53, 48, 38, 34, 32, 28, 49, 42, 38, 35, 31, 26, 22, 22, 17,
  19, 66, 50, 39, 32, 27, 24, 22, 20, 21, 19, 17, 16, 15, 13, 14, 13, 12, 14, 13, 13, 12, 11, 11, 10, 10, 9, 12, 11, 10,
  10, 9, 9, 8, 47, 41, 37, 34, 31, 28, 26, 24, 21, 22, 20, 20, 19, 17, 15, 15, 15, 14, 13, 13, 12, 13, 11, 12, 11, 12,
  11, 10, 11, 10, 10, 10, 11, 11, 58, 45, 37, 31, 28, 25, 23, 21, 20, 18, 17, 16, 15, 14, 13, 12, 12, 11, 10, 9, 10, 46,
  42, 39, 35, 32, 29, 27, 24, 22, 23, 21, 20, 18, 17, 16, 15, 14, 13, 12, 12, 11, 11, 10, 10, 9, 8, 8, 7, 6, 6, 5,
  5, 5, 4, 4, 4, 3, 3, 3, 6, 6, 6, 6, 6, 6, 6, 6, 6, 5, 5, 6, 5, 5, 4, 4, 6, 49, 38, 33, 30, 27,
  25, 24, 22, 21, 19, 18, 16, 16, 48, 44, 41, 37, 35, 32, 29, 27, 25, 23, 21, 20, 19, 18, 16, 16, 15, 14, 12, 12, 12, 11,
  10, 9, 10, 9, 9, 8, 8, 8, 7, 7, 7, 7, 7, 6, 7, 6, 6, 6, 5, 6, 6, 6, 5, 5, 6, 6, 5, 5, 4, 5,
  6, 6, 6, 6, 5, 5, 5, 6, 5, 6, 5, 5, 5, 4, 4, 4, 3, 3, 3, 3, 2, 41, 14, 13, 11, 10, 9, 9, 8, 7,
  11, 10, 10, 9, 9, 9,
];
// prettier-ignore
const STARTS = [
  44, 42, 39, 51, 49, 43, 39, 36, 35, 33, 31, 29, 49, 45, 41, 30, 25, 25, 23, 21, 58, 54, 50, 46, 42, 41, 40, 37, 35, 33,
  33, 31, 30, 30, 30, 30, 60, 54, 51, 40, 37, 31, 30, 30, 30, 48, 40, 33, 30, 30, 30, 45, 37, 34, 64, 31, 26, 22, 22, 17,
  59, 47, 43, 39, 32, 27, 24, 22, 20, 21, 19, 17, 16, 15, 13, 14, 13, 12, 14, 13, 13, 12, 11, 11, 10, 48, 44, 39, 36, 33,
  31, 31, 31, 31, 31, 31, 31, 31, 31, 28, 26, 24, 21, 22, 20, 20, 19, 17, 15, 15, 15, 14, 13, 13, 12, 13, 11, 12, 11, 12,
  11, 10, 11, 10, 10, 10, 60, 50, 45, 41, 37, 31, 28, 25, 23, 21, 20, 18, 17, 16, 47, 43, 40, 36, 34, 32, 32, 32, 31, 31,
  31, 31, 31, 31, 29, 27, 24, 22, 23, 21, 20, 18, 17, 16, 15, 14, 13, 12, 12, 11, 11, 10, 10, 9, 8, 8, 7, 6, 6, 5,
  5, 5, 4, 4, 4, 3, 3, 3, 6, 6, 6, 6, 6, 6, 6, 6, 6, 5, 5, 6, 5, 5, 4, 4, 48, 42, 38, 33, 30, 27,
  25, 48, 45, 41, 38, 34, 34, 33, 33, 32, 32, 32, 32, 32, 29, 27, 25, 23, 21, 20, 19, 18, 16, 16, 15, 14, 12, 12, 12, 11,
  10, 9, 10, 9, 9, 8, 8, 8, 7, 7, 7, 7, 7, 6, 7, 6, 6, 6, 5, 6, 6, 6, 5, 5, 6, 6, 5, 5, 4, 4,
  5, 6, 6, 6, 5, 5, 5, 6, 5, 45, 41, 37, 35, 35, 34, 34, 34, 33, 33, 33, 32, 15, 14, 13, 11, 10, 9, 9, 8, 7,
  11, 10, 10, 9, 9, 9,
];
// prettier-ignore
const INSIDE = [
  31, 28, 36, 33, 54, 46, 43, 41, 37, 34, 31, 28, 32, 25, 22, 22, 21, 18, 58, 53, 49, 45, 42, 40, 38, 35, 33, 30, 29, 26,
  24, 59, 38, 32, 31, 28, 26, 58, 45, 38, 35, 33, 45, 36, 30, 26, 41, 28, 37, 31, 30, 25, 22, 20, 18, 17, 15, 14, 61, 61,
  45, 34, 28, 24, 22, 22, 20, 20, 18, 17, 16, 14, 13, 13, 12, 14, 13, 12, 12, 11, 10, 9, 9, 46, 42, 37, 34, 31, 28, 25,
  25, 23, 22, 20, 18, 19, 17, 16, 15, 14, 14, 13, 14, 13, 12, 13, 12, 11, 10, 11, 10, 10, 10, 10, 10, 10, 9, 10, 9, 9,
  10, 10, 10, 9, 9, 56, 40, 32, 28, 24, 22, 20, 19, 17, 16, 16, 15, 47, 43, 39, 36, 33, 30, 27, 25, 22, 23, 21, 20, 18,
  17, 16, 15, 14, 13, 13, 12, 12, 11, 10, 10, 9, 8, 7, 7, 6, 6, 5, 5, 4, 4, 4, 3, 3, 3, 3, 6, 6, 6, 6,
  6, 6, 6, 5, 6, 6, 6, 5, 5, 5, 4, 4, 5, 5, 5, 5, 5, 4, 6, 6, 5, 5, 5, 48, 31, 24, 52, 48, 43, 40,
  37, 34, 32, 29, 27, 25, 23, 22, 20, 18, 17, 17, 15, 14, 14, 13, 12, 11, 10, 11, 10, 9, 9, 9, 9, 8, 7, 8, 7, 7,
  6, 6, 7, 7, 6, 6, 6, 6, 6, 5, 5, 6, 6, 6, 5, 5, 6, 6, 5, 6, 5, 5, 5, 5, 5, 5, 5, 6, 5, 5,
  4, 4, 4, 3, 3, 3, 3, 2, 2, 39, 13, 12, 11, 10, 9, 8, 7, 11, 10, 10, 10, 9, 9, 8, 8, 8, 8, 7, 7, 7,
  7, 7, 7, 6, 7, 6,
];
// prettier-ignore
const ENDS = [
  44, 39, 44, 39, 59, 49, 44, 42, 38, 35, 32, 30, 32, 27, 24, 22, 20, 19, 19, 17, 16, 15, 14, 16, 16, 15, 15, 14, 16, 15,
  14, 88, 64, 56, 54, 46, 42, 72, 57, 49, 45, 41, 52, 42, 36, 35, 41, 34, 37, 31, 30, 26, 22, 21, 19, 17, 15, 14, 14, 14,
  13, 59, 44, 32, 25, 25, 23, 22, 20, 19, 16, 14, 13, 13, 12, 16, 14, 12, 12, 11, 10, 10, 9, 8, 10, 10, 9, 8, 7, 7,
  10, 9, 9, 44, 39, 37, 33, 30, 26, 24, 23, 20, 21, 18, 17, 18, 16, 14, 10, 14, 10, 10, 10, 10, 10, 10, 9, 10, 9, 9,
  10, 10, 10, 9, 9, 8, 8, 7, 44, 32, 24, 20, 19, 17, 16, 16, 15, 14, 13, 12, 11, 10, 9, 8, 8, 7, 9, 45, 41, 38,
  35, 32, 30, 27, 25, 24, 22, 21, 11, 10, 10, 9, 8, 8, 8, 8, 8, 7, 5, 4, 4, 4, 3, 3, 3, 3, 6, 6, 6, 6,
  6, 6, 6, 5, 6, 6, 6, 5, 5, 5, 4, 4, 5, 5, 5, 5, 5, 4, 6, 6, 5, 5, 5, 5, 5, 32, 25, 20, 18, 18,
  16, 15, 15, 14, 13, 12, 12, 45, 41, 38, 34, 32, 30, 27, 26, 24, 22, 11, 10, 11, 10, 9, 9, 9, 9, 8, 7, 8, 7, 7,
  6, 6, 7, 7, 6, 6, 6, 6, 6, 5, 5, 6, 6, 6, 5, 5, 6, 6, 5, 6, 5, 5, 5, 5, 5, 5, 5, 6, 5, 5,
  5, 5, 5, 4, 5, 5, 5, 5, 44, 41, 24, 22, 20, 10, 9, 8, 7, 17, 10, 10, 10, 9, 9, 8, 8, 8, 8, 7, 7, 7,
  7, 7, 7, 6, 7, 6,
];

/** Added to every value: a player's own eggs and gear move it a little. */
const MARGIN_HOURS = 0.1;
/** Above the curves (TE 360). */
const ABOVE_HOURS = 1.2;

function hoursAt(list: number[], te: number): number {
  const i = Math.floor(te) - FROM;
  if (i >= list.length) return ABOVE_HOURS;
  return list[Math.max(0, i)] / 10 + MARGIN_HOURS;
}

/**
 * Seconds from `start` within which a fresh ascension at TE `te` makes its egg shifts before C3 (an estimate from
 * above). Inside the sale: INSIDE when the sale outlasts every curve, else the longest of QUIET, INSIDE and ENDS.
 * Before it: QUIET, or the longest of QUIET, STARTS and INSIDE when the sale begins within that.
 */
export function openingSpan(te: number, start: number): number {
  const quiet = hoursAt(QUIET, te);
  const inside = hoursAt(INSIDE, te);
  if (isResearchSaleActive(start)) {
    const all = Math.max(quiet, inside, hoursAt(ENDS, te));
    return (getNextSaleEnd(start) > start + all * 3600 ? inside : all) * 3600;
  }
  const pre = Math.max(quiet, hoursAt(STARTS, te), inside);
  return (getNextSaleStart(start) < start + pre * 3600 ? pre : quiet) * 3600;
}
