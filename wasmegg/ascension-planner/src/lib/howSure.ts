/**
 * "How sure" on My runs' saved-answer tiles (spec myruns-now v3, section 4): High, Medium or Low with one reason
 * line, never a percentage (a real probability needs calibration data still being collected). First match wins:
 *
 *   Low     an older simulator; hours used differ from Your setup now; under LOW_SPARE_HOURS to spare (By a
 *           date); the save or the answer older than STALE_DAYS; the TE has moved since.
 *   High    Exhaustive complete; By a date with Check exactly confirming the instant answer's TE plus
 *           HIGH_SPARE_HOURS or more to spare and the runner-up more than HIGH_RUNNER_UP_DATE_HOURS behind,
 *           or a Fast-or-stronger search agreeing on the TE; Fastest with an Exact-or-stronger search agreeing
 *           and the runner-up more than HIGH_RUNNER_UP_FASTEST_HOURS behind.
 *   Medium  everything else. A table-only answer ("instant answer") is Medium at best on both goals (decided
 *           15 Oct 2026: on the alt's save the instant answer said 248, Check exactly put that route at 247),
 *           and Low past STALE_DAYS.
 *
 * Pure. Every threshold is a named constant here, and nowhere else.
 */

/** A save or answer older than this many days is Low (a table-only answer is Medium until then). */
export const STALE_DAYS = 14;
/** By a date: under this many hours to spare is Low. */
export const LOW_SPARE_HOURS = 2;
/** By a date: High needs at least this many hours to spare. */
export const HIGH_SPARE_HOURS = 6;
/** By a date: High needs the next-best route more than this many hours behind. */
export const HIGH_RUNNER_UP_DATE_HOURS = 2.4;
/** Fastest: High needs the next-best route more than this many hours behind (a day). */
export const HIGH_RUNNER_UP_FASTEST_HOURS = 24;

/** A runner-up gap under this many hours shows as "0.0 h": it is said as a tie instead (Jordan, 16 Oct). */
export const TIE_HOURS = 0.05;

export type SureLevel = 'high' | 'medium' | 'low';
/** A search's strength, weakest first ('quick' is Fast, 'normal' Exact, 'thorough' Very high). */
export type SearchLevel = 'light' | 'quick' | 'normal' | 'thorough' | 'exhaustive';
const RANK: Record<SearchLevel, number> = { light: 0, quick: 1, normal: 2, thorough: 3, exhaustive: 4 };
export const LEVEL_WORDS: Record<SearchLevel, string> = {
  light: 'Checked at once',
  quick: 'Fast',
  normal: 'Exact',
  thorough: 'Very high',
  exhaustive: 'Exhaustive',
};

export interface SureInput {
  goal: 'fastest' | 'date';
  /** How the answer shown was priced: the instant answer's table only, Check exactly, or a search. */
  how: 'instant' | 'check' | 'search';
  /** A search's level (how = 'search'). */
  level?: SearchLevel | null;
  /** An Exhaustive run that finished its space. */
  exhaustiveComplete?: boolean;
  /** By a date: Check exactly's TE is the instant answer's. */
  exactConfirmsTE?: boolean;
  /** The strongest search of the same save that agrees with the answer (same TE by the date; a finish within
   *  the hour for Fastest), or null. */
  agreeing?: SearchLevel | null;
  spareHours?: number | null;
  /** Hours the next-best route is behind; null: not known. */
  runnerUpHours?: number | null;
  /** The next-best route itself, when kept, and whether it is the same answer exactly (the same finish, TE
   *  and spare): a tie is then named. */
  runnerUpChain?: number[] | null;
  runnerUpSame?: boolean;
  /** The older of the save and the answer, in days. */
  ageDays: number;
  olderSimulator?: boolean;
  hoursChanged?: boolean;
  /** The loaded save's TE is not the one the answer started from. */
  teMoved?: boolean;
  /** By a date: the answer's TE, for the words. */
  te?: number | null;
}

export interface Sure {
  level: SureLevel;
  /** "Instant answer, 5 days old" (shown after "How sure: Medium"). */
  reason: string;
  /** The button beside it: Check exactly (By a date's instant answer) or a short Fast search (Fastest's). */
  action?: 'check' | 'fast';
}

function age(days: number): string {
  if (days < 1 / 24) return 'just now';
  if (days < 1) return `${Math.max(1, Math.round(days * 24))} h old`;
  const d = Math.floor(days);
  return `${d} day${d === 1 ? '' : 's'} old`;
}
const hours = (h: number) => (h >= 48 ? `${(h / 24).toFixed(1)} days` : `${h.toFixed(1)} h`);
/**
 * How far behind the next route is: "the next route is only 1.2 h behind"; under TIE_HOURS "another route ties
 * it"; the very same finish, TE and spare "another route ties it exactly (155 180 247)" (its route when kept).
 */
export function behindWords(runner: number, i: Pick<SureInput, 'runnerUpChain' | 'runnerUpSame'> = {}): string {
  if (runner >= TIE_HOURS) return `the next route is only ${hours(runner)} behind`;
  if (runner === 0 && i.runnerUpSame) {
    const c = i.runnerUpChain;
    return `another route ties it exactly${c && c.length ? ` (${c.join(' ')})` : ''}`;
  }
  return 'another route ties it';
}
const atLeast = (l: SearchLevel | null | undefined, min: SearchLevel) => !!l && RANK[l] >= RANK[min];

export function howSure(i: SureInput): Sure {
  const what = i.how === 'instant' ? 'instant answer' : i.how === 'check' ? 'Check exactly' : `${LEVEL_WORDS[i.level ?? 'quick']} search`;
  // Low.
  if (i.olderSimulator) return { level: 'low', reason: 'priced by an older simulator' };
  if (i.hoursChanged) return { level: 'low', reason: 'priced before your hours changed' };
  if (i.goal === 'date' && typeof i.spareHours === 'number' && i.spareHours < LOW_SPARE_HOURS)
    return { level: 'low', reason: `only ${hours(Math.max(0, i.spareHours))} to spare` };
  if (i.ageDays > STALE_DAYS) return { level: 'low', reason: `${what}, ${age(i.ageDays)}` };
  if (i.teMoved) return { level: 'low', reason: 'your TE has moved since' };
  // High.
  if (i.how === 'search' && i.level === 'exhaustive' && i.exhaustiveComplete)
    return { level: 'high', reason: 'Exhaustive checked every route in its boxes' };
  if (i.agreeing === 'exhaustive') return { level: 'high', reason: 'a finished Exhaustive run agrees' };
  const runner = i.runnerUpHours;
  if (i.goal === 'date') {
    const spareOk = typeof i.spareHours === 'number' && i.spareHours >= HIGH_SPARE_HOURS;
    const runnerOk = runner != null && runner > HIGH_RUNNER_UP_DATE_HOURS;
    if (i.how !== 'instant' && i.exactConfirmsTE && spareOk && runnerOk)
      return {
        level: 'high',
        reason: `Check exactly confirms ${i.te ?? 'the'} TE, ${hours(i.spareHours!)} to spare, the next route ${
          runner === Infinity ? 'makes less TE' : `${hours(runner!)} behind`
        }`,
      };
    if (atLeast(i.agreeing, 'quick') || (i.how === 'search' && atLeast(i.level, 'quick')))
      return { level: 'high', reason: `a ${LEVEL_WORDS[(i.agreeing ?? i.level)!]} search agrees on ${i.te ?? 'the'} TE` };
  } else {
    const strong = atLeast(i.agreeing, 'normal') ? i.agreeing! : i.how === 'search' && atLeast(i.level, 'normal') ? i.level! : null;
    if (strong && runner != null && runner > HIGH_RUNNER_UP_FASTEST_HOURS)
      return { level: 'high', reason: `${strong === 'thorough' ? 'a' : 'an'} ${LEVEL_WORDS[strong]} search agrees; the next route is ${hours(runner)} behind` };
    if (strong)
      return {
        level: 'medium',
        reason:
          runner == null
            ? `${LEVEL_WORDS[strong]} search; how far behind the next route is wasn't kept`
            : `${LEVEL_WORDS[strong]} search; ${behindWords(runner, i)}`,
      };
  }
  // Medium.
  if (i.how === 'instant')
    return i.goal === 'fastest'
      ? { level: 'medium', reason: `instant answer, ${age(i.ageDays)}; a short search usually finds a sooner route`, action: 'fast' }
      : { level: 'medium', reason: `instant answer, ${age(i.ageDays)}`, action: 'check' };
  if (i.goal === 'fastest') return { level: 'medium', reason: `${what} done; a short search usually finds a sooner route`, action: 'fast' };
  if (i.how === 'check' && i.exactConfirmsTE === false) return { level: 'medium', reason: 'Check exactly done; it moved the instant answer’s TE' };
  if (typeof i.spareHours === 'number' && i.spareHours < HIGH_SPARE_HOURS)
    return { level: 'medium', reason: `${what} done; only ${hours(i.spareHours)} to spare` };
  if (runner != null && runner !== Infinity && runner <= HIGH_RUNNER_UP_DATE_HOURS)
    return { level: 'medium', reason: `${what} done; ${behindWords(runner, i)}` };
  return { level: 'medium', reason: `${what} done` };
}
