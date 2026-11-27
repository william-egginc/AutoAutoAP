/**
 * The line under the instant answer that prices the player's route on the instant answers for the closest stronger
 * and weaker gear on the site (InstantRoute.vue `runBracket`, search/priceOnTable.ts).
 *
 * THE ORDERING BUG (23 Oct 2026): on Fastest the green box said Jan 29, 2029 while the line said "With your gear you'd
 * likely finish between Jan 3, 2029 … and Jan 13, 2029": sooner than the answer above it, the wrong way round. The two
 * were not priced alike (the bracket's legs were not held for the player's hours, its gear tables can come from an
 * older simulator) and, since the form G, the green box is often on the player's own gear already. So the line only
 * shows what can be true, and says what it compares:
 *   - 'maxed' (the green box is the maxed table, scaled to the player's delivery): weaker gear cannot beat it, so a
 *     side sooner than the answer (Fastest) or with more TE (By a date) is dropped;
 *   - 'yours' (the form G: the green box is on the player's gear): the answer must sit between the two sides (the
 *     stronger gear no later, the weaker no sooner); when it does not, the two estimates disagree and the line is
 *     not shown at all.
 * Pure: InstantRoute.vue hands in both sides and the answer on screen.
 */

/** One side of the bracket: when the route ends there and the TE it reaches, and the gear's name. */
export interface BracketSideIn {
  /** Unix second it reaches its last stop; null: no route on that table. */
  end: number | null;
  te: number;
  /** "the instant answer for fully maxed gear", "gear like 128.7 / 0.99". */
  name: string;
}

export interface BracketLineInput {
  goal: 'fastest' | 'date';
  /** The green box: what it was built on, when it ends (Fastest) and the TE it reaches (By a date). */
  answer: { basis: 'maxed' | 'yours'; end: number | null; te: number };
  /** The closest stronger gear's price (or the maxed table's), and the closest weaker's. */
  hi: BracketSideIn | null;
  lo: BracketSideIn | null;
  show: (unix: number) => string;
}

const REAL_DATE = 'Fast, Exact or Custom below gives your real date.';
const REAL_TE = 'Fast, Exact or Custom below gives your real TE.';

/** Which sides the line can say, after the ordering rules; null when nothing true is left. */
type BracketCase =
  | { basis: 'maxed'; hi: BracketSideIn | null; lo: BracketSideIn | null; withAnswer: boolean }
  | { basis: 'yours'; hi: BracketSideIn; lo: BracketSideIn | null };

function bracketCase(i: BracketLineInput): BracketCase | null {
  const has = (s: BracketSideIn | null): s is BracketSideIn => !!s && s.end !== null;
  let hi = has(i.hi) ? i.hi : null;
  let lo = has(i.lo) ? i.lo : null;
  const fastest = i.goal === 'fastest';
  const a = i.answer;
  const known = fastest ? a.end !== null : a.te > 0;
  // "Better than the answer": sooner on Fastest, more TE by a date.
  const beats = (s: BracketSideIn): boolean => (fastest ? s.end! < a.end! : s.te > a.te);
  const behind = (s: BracketSideIn): boolean => (fastest ? s.end! > a.end! : s.te < a.te);

  if (a.basis === 'maxed') {
    if (known) {
      if (hi && beats(hi)) hi = null;
      if (lo && beats(lo)) lo = null;
    }
    if (hi) return { basis: 'maxed', hi, lo, withAnswer: false };
    if (lo && known) return { basis: 'maxed', hi: null, lo, withAnswer: true };
    return null;
  }
  // The form G: the answer is already on the player's gear; the bracket is a second estimate of the same thing.
  if (!hi || !known) return null;
  if (behind(hi) || (lo && beats(lo))) return null;
  return { basis: 'yours', hi, lo };
}

/** The line's words, or '' when there is nothing true to say. */
export function bracketLine(i: BracketLineInput): string {
  const c = bracketCase(i);
  if (!c) return '';
  const fastest = i.goal === 'fastest';
  const a = i.answer;
  if (c.basis === 'maxed') {
    const { hi, lo } = c;
    const lead = fastest
      ? "The answer above is maxed gear's, at your delivery rate. With your gear you'd likely finish"
      : "The answer above is maxed gear's, at your delivery rate. With your gear you'd likely reach";
    if (fastest) {
      if (hi && lo) return `${lead} between ${i.show(hi.end!)} (on ${hi.name}) and ${i.show(lo.end!)} (on ${lo.name}); ${REAL_DATE}`;
      if (hi) return `${lead} no sooner than ${i.show(hi.end!)} (on ${hi.name}); ${REAL_DATE}`;
      return `${lead} between ${i.show(a.end!)} (the answer above) and ${i.show(lo!.end!)} (on ${lo!.name}); ${REAL_DATE}`;
    }
    if (hi && lo) return `${lead} between ${lo.te} TE (on ${lo.name}) and ${hi.te} TE (on ${hi.name}) by the date; ${REAL_TE}`;
    if (hi) return `${lead} at most ${hi.te} TE by the date (on ${hi.name}); ${REAL_TE}`;
    return `${lead} between ${lo!.te} TE (on ${lo!.name}) and ${a.te} TE (the answer above) by the date; ${REAL_TE}`;
  }
  const { hi, lo } = c;
  const lead = 'Priced on the instant answers for the gear closest to yours on this site, your route would';
  if (fastest)
    return lo
      ? `${lead} finish between ${i.show(hi.end!)} (on ${hi.name}) and ${i.show(lo.end!)} (on ${lo.name}); ${REAL_DATE}`
      : `${lead} finish no sooner than ${i.show(hi.end!)} (on ${hi.name}); ${REAL_DATE}`;
  return lo
    ? `${lead} reach between ${lo.te} TE (on ${lo.name}) and ${hi.te} TE (on ${hi.name}) by the date; ${REAL_TE}`
    : `${lead} reach at most ${hi.te} TE by the date (on ${hi.name}); ${REAL_TE}`;
}

/**
 * The same bound as one short sentence, for the one line under the answer (lib/answerCaveat.ts): the dates or TE
 * only, the gear names and what to run left to the full line under "Why?". '' exactly when `bracketLine` is.
 */
export function bracketHeadline(i: BracketLineInput): string {
  const c = bracketCase(i);
  if (!c) return '';
  const { hi, lo } = c;
  if (i.goal === 'fastest') {
    if (hi && lo) return `With your gear, likely between ${i.show(hi.end!)} and ${i.show(lo.end!)}.`;
    if (hi) return `With your gear, no sooner than ${i.show(hi.end!)}.`;
    return `With your gear, likely between ${i.show(i.answer.end!)} and ${i.show(lo!.end!)}.`;
  }
  if (hi && lo) return `With your gear, likely between ${lo.te} TE and ${hi.te} TE by the date.`;
  if (hi) return `With your gear, at most ${hi.te} TE by the date.`;
  return `With your gear, likely between ${lo!.te} TE and ${i.answer.te} TE by the date.`;
}
