/**
 * Which simulator priced a board run, in plain words (the Leaderboard's "sim" chip, SimChip.vue).
 *
 * Board rows mix simulators: a run carries the stamp of the code that priced it (`simVersion`,
 * search/simVersion.ts SIM_VERSION, sent since 13 Oct 2026), and a run sent before that carries none.
 * Finish times from two simulators do not compare exactly, so every ranking shows which one a run came
 * from. The existing `sameBuild` guards (lib/leaderboardRank.ts) are untouched; this only labels.
 *
 * KNOWN_SIMS is the short list of stamps we know, with the day each began. A new stamp is one line here
 * (newest last); a stamp missing from it is still placed by the date it starts with.
 */

export interface KnownSim {
  /** The stamp exactly as runs carry it. */
  stamp: string;
  /** The day it began, YYYY-MM-DD. */
  date: string;
}

export const KNOWN_SIMS: KnownSim[] = [
  { stamp: '2026-10-13-lowte-gate', date: '2026-10-13' },
  { stamp: '2026-10-21-egg-beta2', date: '2026-10-21' },
];

/** current: this site's simulator; older / newer: another stamp, placed by its date; unknown: no stamp
 *  (sent before stamps began); other: a stamp with no date we can read. */
export type SimKind = 'current' | 'older' | 'newer' | 'unknown' | 'other';

export interface SimLabel {
  kind: SimKind;
  /** What the chip says. */
  words: string;
  /** The stamp itself, null when the run has none. */
  stamp: string | null;
  /** The chip's hover text, and what a tap shows under it. */
  title: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 13" for 2026-10-13. */
function shortDay(ymd: string): string {
  const [, m, d] = ymd.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

/** The first day runs carried a stamp: the earliest known one. */
export const FIRST_STAMP_DAY = shortDay([...KNOWN_SIMS].sort((a, b) => a.date.localeCompare(b.date))[0].date);

/** The day a stamp began: from the list, else the date it starts with, else null. */
export function simDate(stamp: string): string | null {
  const known = KNOWN_SIMS.find(k => k.stamp === stamp);
  if (known) return known.date;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(stamp);
  return m ? m[1] : null;
}

/** The label for a run stamped `rowStamp` on a site running `currentStamp`. */
export function simLabel(rowStamp: unknown, currentStamp: string): SimLabel {
  const stamp = typeof rowStamp === 'string' && rowStamp.trim() ? rowStamp.trim() : null;
  if (!stamp)
    return {
      kind: 'unknown',
      words: `unknown (before ${FIRST_STAMP_DAY})`,
      stamp: null,
      title: `No simulator stamp: sent before runs carried one (${FIRST_STAMP_DAY}), so which simulator priced it is unknown.`,
    };
  if (stamp === currentStamp)
    return { kind: 'current', words: 'current', stamp, title: `Simulator ${stamp}, the one this site runs.` };
  const day = simDate(stamp);
  const ours = simDate(currentStamp);
  if (!day || !ours)
    return {
      kind: 'other',
      words: 'other simulator',
      stamp,
      title: `Simulator ${stamp}, not the one this site runs (${currentStamp}).`,
    };
  const kind: SimKind = day > ours ? 'newer' : 'older';
  return {
    kind,
    words: `${kind} simulator`,
    stamp,
    title: `Simulator ${stamp}, ${kind} than the one this site runs (${currentStamp}). Finish times may differ a little.`,
  };
}
