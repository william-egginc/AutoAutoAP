/**
 * "What if you had maxed gear?" (the user, 15 Oct): the player's instant answer found again on the
 * maxed table (search/priceOnTable.ts), said in one line against their own answer.
 */
import type { PricedOnTable } from './priceOnTable';

/** Closer than this (days) reads as "about the same". */
const SAME_DAYS = 0.05;

export function maxedWhatIfText(o: {
  /** By a date: the deadline (unix seconds); absent for Fastest route. */
  deadline?: number | null;
  final: number;
  /** The player's own answer (their table, their gear): the instant answer. */
  mine: { end: number | null; te: number };
  /**
   * Check exactly's answer for the same goal on the player's account, once known: the TE by the date (By a
   * date) or when it reaches the target (Fastest). Said beside the instant answer when it differs (18 Oct
   * 2026: the line said "instead of 248" while Check exactly above it said 247). The comparison itself
   * stays instant against instant, table against table.
   */
  exact?: { end: number | null; te: number } | null;
  maxed: PricedOnTable;
  show: (unix: number) => string;
}): string {
  const { mine, maxed } = o;
  if (o.deadline) {
    if (!maxed.route) return `With maxed gear: no route reaches a higher TE by ${o.show(o.deadline)} either.`;
    const ex = o.exact && Number.isFinite(o.exact.te) && o.exact.te > 0 && o.exact.te !== mine.te ? o.exact.te : null;
    return maxed.te > mine.te
      ? ex !== null
        ? `With maxed gear: TE ${maxed.te} by ${o.show(o.deadline)} instead of ${mine.te} (instant answer; exact on your account: ${ex}).`
        : `With maxed gear: TE ${maxed.te} by ${o.show(o.deadline)} instead of ${mine.te}.`
      : `With maxed gear: TE ${maxed.te} by ${o.show(o.deadline)}, the same as your gear${
          ex !== null ? ` (instant answer; exact on your account: ${ex})` : ''
        }.`;
  }
  if (maxed.end === null) return `With maxed gear: no route to ${o.final} in this search either.`;
  if (mine.end === null) return `With maxed gear: ${o.final} on ${o.show(maxed.end)}.`;
  const days = (mine.end - maxed.end) / 86400;
  const exEnd = o.exact?.end;
  const ex =
    typeof exEnd === 'number' && Number.isFinite(exEnd) && o.show(exEnd) !== o.show(mine.end) ? o.show(exEnd) : null;
  const note = ex !== null ? ` (instant answer: ${o.show(mine.end)}; exact on your account: ${ex})` : '';
  return days > SAME_DAYS
    ? `With maxed gear: ${o.final} on ${o.show(maxed.end)}, ${days.toFixed(1)} d sooner than your gear${note}.`
    : `With maxed gear: ${o.final} on ${o.show(maxed.end)}, about the same as your gear${note}.`;
}

/** The maxed table's gear in letters, from its tables.json label without the trailing "maxed reference". */
export function maxedLetters(label: string | undefined): string {
  return (label ?? '').replace(/\s*·\s*maxed reference\s*$/, '').trim();
}
