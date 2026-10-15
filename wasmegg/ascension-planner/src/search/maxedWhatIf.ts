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
  /** The player's own answer (their table, their gear). */
  mine: { end: number | null; te: number };
  maxed: PricedOnTable;
  show: (unix: number) => string;
}): string {
  const { mine, maxed } = o;
  if (o.deadline) {
    if (!maxed.route) return `With maxed gear: no route reaches a higher TE by ${o.show(o.deadline)} either.`;
    return maxed.te > mine.te
      ? `With maxed gear: TE ${maxed.te} by ${o.show(o.deadline)} instead of ${mine.te}.`
      : `With maxed gear: TE ${maxed.te} by ${o.show(o.deadline)}, the same as your gear.`;
  }
  if (maxed.end === null) return `With maxed gear: no route to ${o.final} in this search either.`;
  if (mine.end === null) return `With maxed gear: ${o.final} on ${o.show(maxed.end)}.`;
  const days = (mine.end - maxed.end) / 86400;
  return days > SAME_DAYS
    ? `With maxed gear: ${o.final} on ${o.show(maxed.end)}, ${days.toFixed(1)} d sooner than your gear.`
    : `With maxed gear: ${o.final} on ${o.show(maxed.end)}, about the same as your gear.`;
}

/** The maxed table's gear in letters, from its tables.json label without the trailing "maxed reference". */
export function maxedLetters(label: string | undefined): string {
  return (label ?? '').replace(/\s*·\s*maxed reference\s*$/, '').trim();
}
