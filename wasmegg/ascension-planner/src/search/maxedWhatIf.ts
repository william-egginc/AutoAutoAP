/**
 * "What if you had maxed gear?" (the user, 15 Oct): the player's instant answer found again on the
 * maxed table (search/priceOnTable.ts), said in one line against their own answer.
 */
import type { PricedOnTable } from './priceOnTable';
import type { SnapWhatIf } from './instantSnapshot';

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
  if (maxed.end === null) return `With maxed gear: no route to ${o.final} in the instant answer either.`;
  if (mine.end === null) return `With maxed gear: ${o.final} on ${o.show(maxed.end)}.`;
  const days = (mine.end - maxed.end) / 86400;
  const exEnd = o.exact?.end;
  const ex =
    typeof exEnd === 'number' && Number.isFinite(exEnd) && o.show(exEnd) !== o.show(mine.end) ? o.show(exEnd) : null;
  const note = ex !== null ? ` (instant answer: ${o.show(mine.end)}; exact on your account: ${ex})` : '';
  return days > SAME_DAYS
    ? `With maxed gear: ${o.final} on ${o.show(maxed.end)}, ${days.toFixed(1)} days sooner than with your gear${note}.`
    : `With maxed gear: ${o.final} on ${o.show(maxed.end)}, about the same as your gear${note}.`;
}

/** The maxed table's gear in letters, from its tables.json label without the trailing "maxed reference". */
export function maxedLetters(label: string | undefined): string {
  return (label ?? '').replace(/\s*·\s*maxed reference\s*$/, '').trim();
}

// ------------------------------------------------------------------- what the imperfect gear costs, in time

/**
 * WHAT THE IMPERFECT GEAR COSTS (25 Oct 2026, Jordan): My runs' gear block, beside "Missing for a perfect set", says in
 * TIME what maxed gear (every artifact T4 Legendary, every stone tier 4: the maxed table behind "What if you had maxed
 * gear?") would change, from the what-if kept with the goal's instant answer of this save:
 *   Fastest: the finish-date gap (the player's instant answer reaches the target at `mineEnd`, maxed gear at `end`).
 *   By a date: the time to reach the SAME TE (players weigh going to Humility for artifacts by it): the player's route
 *   reaches its TE at `mineEnd`, maxed gear's fastest route to that TE at `sameEnd`.
 * Null when there is nothing to say it from (no what-if kept, an older one without `sameEnd`, no finish). Pure.
 */
export interface PerfectSetGap {
  /** The TE both reach. */
  te: number;
  /** How much sooner maxed gear gets there, seconds (0 or less: no sooner). */
  seconds: number;
}

export function perfectSetGap(w: SnapWhatIf | null | undefined, goal: 'fastest' | 'date'): PerfectSetGap | null {
  if (!w || w.mineEnd == null || !(w.mineTE > 0)) return null;
  const maxedAt = goal === 'date' ? w.sameEnd : w.end;
  if (maxedAt == null || !Number.isFinite(maxedAt) || !Number.isFinite(w.mineEnd)) return null;
  return { te: w.mineTE, seconds: w.mineEnd - maxedAt };
}

/** Closer than this reads as "at about the same time". */
const SAME_SECONDS = 3600;

/** "With a perfect set you'd reach 490 TE about 3.2 days sooner (an estimate from the instant answer)." */
export function perfectSetWords(g: PerfectSetGap): string {
  const tail = ' (an estimate from the instant answer).';
  if (g.seconds < SAME_SECONDS) return `With a perfect set you'd reach ${g.te} TE at about the same time${tail}`;
  const h = g.seconds / 3600;
  const span =
    h < 24 ? `${Math.round(h)} ${Math.round(h) === 1 ? 'hour' : 'hours'}` : h / 24 < 10 ? `${(h / 24).toFixed(1)} days` : `${Math.round(h / 24)} days`;
  return `With a perfect set you'd reach ${g.te} TE about ${span} sooner${tail}`;
}
