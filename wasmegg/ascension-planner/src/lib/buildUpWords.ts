/**
 * The Build-up tracker's research words (spec-rangewords, R7). Wording only: lib/resultCodeHash.ts leaves *Words.ts
 * files out of the result code hash, so an edit here keeps everyone's kept plans (lib/buildUpTracker.ts, which is in
 * the hash, imports these). Pure; its one import is the game's research data (for the max levels).
 *
 * RANGES IN THE MANUAL PLANNER'S FORM (allanfieldhouse): "Relativity Optimization (2 → 4)", from the level before the
 * first buy to the level after the last, as the Manual Planner's Curiosity summary writes a research range
 * (components/summaries/CuriositySummary.vue, Joo's: `${r.name} (` start ' -> ' final ')'). A single level is
 * "(0 → 1)". The one difference from it: the arrow, → (U+2192) where it writes ASCII '->', as the request asked; a
 * hyphen is also a place a browser may break a line, the arrow is not, so a range breaks only at its spaces. Trains,
 * silos, habs and car counts keep their own words ("slots 1-14", "#2-5"): the Manual Planner shows those per action
 * ("→ slot 3"), with no range form to follow.
 *
 * THE MAX LEVEL (spec-maxlevel, 6 Nov 2026, Jordan: "when it hits the max level just say max"): a range that ends on
 * the research's max level says so, "Enlightened Chickens (102 → max)". The max is the game's (lib/researches.json
 * `levels`), looked up by research id: the two Internal Hatchery Expansions share a name and not a max (15 and 30).
 * Only the level after the buy, and only AT the max: "(80 → 90)" of a 150-level research keeps its numbers. A
 * one-level research keeps "(0 → 1)": "Bigger Eggs (0 → max)" says no more and reads as if there were levels to buy
 * out. Without an id (or one the data doesn't know) the range keeps its numbers.
 *
 * Player-facing words here are final (Words, 8 Nov 2026;  ~/code/aaap-tools/notes/spec-rangewords.md,
 * ~/code/aaap-tools/notes/spec-maxlevel.md).
 */
import { allResearches } from 'lib';

/** The range arrow (final): U+2192. The Manual Planner's summary writes ' -> '. */
export const RANGE_ARROW = '→';

/** The word for a research's max level (final). */
export const MAX_LEVEL_WORD = 'max';

/** The fewest levels a research has for its max to read MAX_LEVEL_WORD: a one-level research keeps "1". */
const MAX_WORD_FROM_LEVELS = 2;

const MAX_LEVELS: ReadonlyMap<string, number> = new Map(
  (allResearches as readonly { id: string; levels: number }[]).map(r => [r.id, r.levels])
);

/** The game's max level for a research id (lib/researches.json `levels`); null for an id it doesn't know. */
export function researchMaxLevel(id: string | null | undefined): number | null {
  return (id && MAX_LEVELS.get(id)) || null;
}

/** A level as a range ends on it: MAX_LEVEL_WORD at the research's max (`max`, null when unknown), else the number. */
export function levelWords(level: number, max: number | null | undefined): string {
  return max != null && max >= MAX_WORD_FROM_LEVELS && level === max ? MAX_LEVEL_WORD : `${level}`;
}

/** "Relativity Optimization (2 → 4)": `before` the level before the first buy, `after` the level after the last.
 *  With the research's `id`, a range that ends on its max level reads "(102 → max)". */
export function researchRangeWords(name: string, before: number, after: number, id?: string | null): string {
  return `${name} (${before} ${RANGE_ARROW} ${levelWords(after, researchMaxLevel(id))})`;
}

/** The cheap sweep mark (final words): after a sweep name on a mixed line, or once at the end of an all-sweep line. */
export const CHEAP_SWEEP_MARK = ' (cheap sweep)';

/** Why the Build-up tracker gave up when its plan took longer than its overall cap (spec-stuck3; Jordan's OK, 7 Nov 2026):
 *  "The build-up list could not be worked out (it took over 8 minutes)." */
export function trackerCapReason(minutes: number): string {
  return `it took over ${minutes} minutes`;
}

/** The tracker's List / Compact toggle (spec-trackercompact, 8 Nov 2026; final words): the group's name and its two
 *  buttons. */
export const TRACKER_VIEW_LABEL = 'Show the build-up as';
export const TRACKER_VIEW_LIST = 'List';
export const TRACKER_VIEW_COMPACT = 'Compact';

/** Compact (spec-trackercompact; final words). A sale line as a chip: "sale starts 10:00 am", "sale ends 10:00 am". */
export function compactSaleWords(on: boolean, time: string): string {
  return `${on ? 'sale starts' : 'sale ends'}${time ? ` ${time}` : ''}`;
}
/** A day's check-ins and when: "4 check-ins · 8:00 am to 9:46 am", "1 check-in · 9:52 am". */
export function checkInSpanWords(n: number, first: string, last: string): string {
  const count = `${n} check-in${n === 1 ? '' : 's'}`;
  if (!first) return count;
  return `${count} · ${first === last ? first : `${first} to ${last}`}`;
}
/** The header's state: the next check-in when it is on this day. */
export const compactNextWords = (time: string): string => `next ${time}`;
export const COMPACT_ALL_DONE = 'all done';
/** Said after "›" for a screen reader: the header jumps to the day in List. */
export const COMPACT_JUMP = 'show this day in the list';
/** After a done chip / a done range, for a screen reader (the ✓ is hidden from it). */
export const COMPACT_DONE_SR = '(done)';
export const COMPACT_BOUGHT_SR = '(bought)';

/** Done work folded into one line that says what was bought (spec-trackercompact; final words). `ranges`: the research
 *  ranges; `others`: the other things done, in the lines' words without "buy". "bought A (1 → 2), B (3 → max); shift to
 *  Kindness"; with no research, the others alone. */
export function boughtWords(ranges: readonly string[], others: readonly string[]): string {
  return ranges.length ? `bought ${doneListWords(ranges, others)}` : doneListWords(ranges, others);
}
/** The same without "bought", after a lead that says it ("Bought 8:41 am to 9:01 am: A (1 → 2); shift to Kindness"). */
export function doneListWords(ranges: readonly string[], others: readonly string[]): string {
  return [ranges.join(', '), others.join(', ')].filter(Boolean).join('; ');
}
/** A done run's lead: "Bought 8:41 am to 9:01 am:", "Bought 10:00 am:". */
export function boughtRunLead(first: string, last: string): string {
  return `Bought ${!last || first === last ? first : `${first} to ${last}`}:`;
}
/** Compact's done run inside today, and the label of what is left. */
export const BOUGHT_SO_FAR = 'Bought so far:';
export const STILL_TO_BUY = 'Still to buy';
/** The group line over the older done days: "Earlier: 2 days, all done" (a done day can hold shifts, not only buys). */
export const earlierDoneWords = (n: number): string => `Earlier: ${n} day${n === 1 ? '' : 's'}, all done`;
/** The cap's button when an open day has more lines to do than it shows: "Show all 101 still to do". */
export const showAllToDoWords = (n: number): string => `Show all ${n} still to do`;
/** Said after a done day's line for a screen reader. */
export const DONE_DAY_SR = 'all done';

/**
 * Research tier unlocks (spec-tierunlock, 13 Nov 2026; DRAFT, Words). The tracker says where a tier opens: on the check-in
 * ("Tier 13 unlocks") and, while one is still ahead, in the header ("Tier 13 at 4:41 PM"). A label, not a control. Tiers
 * read as "13", "12 and 13", "2, 3 and 4".
 */
const tiersList = (tiers: readonly number[]): string =>
  tiers.length < 2 ? `${tiers[0]}` : `${tiers.slice(0, -1).join(', ')} and ${tiers[tiers.length - 1]}`;
/** On the check-in: "Tier 13 unlocks", "Tiers 12 and 13 unlock". */
export function tierUnlocksWords(tiers: readonly number[]): string {
  return tiers.length === 1 ? `Tier ${tiers[0]} unlocks` : `Tiers ${tiersList(tiers)} unlock`;
}
/** In the header, after the check-in count: "Tier 13 at 4:41 PM". `when` is the time as the tracker's lines write it. */
export function tierAheadWords(tiers: readonly number[], when: string): string {
  return `${tiers.length === 1 ? 'Tier' : 'Tiers'} ${tiersList(tiers)} at ${when}`;
}
