/**
 * The words of the instant answer card (components/auto/InstantRoute.vue), in one place (Words, 12 Nov 2026; Jordan OKed the
 * card clean-up in notes/instant-proposal.md). The first group is today's words moved out of the component UNCHANGED (their
 * own step); the second group is the clean-up's new words.
 *
 * Times: pass them already written by the app's formatter (en-US "Nov 3 at 9:00 AM"; lib/timeStyleWords.ts), never here.
 * A *Words.ts file: wording only, never part of the result code hash.
 */

// ---- Today's words, moved unchanged ----

/** The saved-from sentence. `when`: the saved time as the app writes it; `planStart`: the plan start the dates use, if any. */
export function savedFromSentence(o: { when: string; planStart?: string | null }): string {
  const start = o.planStart ? ` (its dates are for a plan start of ${o.planStart})` : '';
  return `Saved from ${o.when}: same save, setup and filters, so nothing was worked out again${start}.`;
}

export const WORK_IT_OUT_AGAIN = 'Work it out again';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "Reached Nov 20 at 9:00 AM · 2 ascensions". */
export function reachedLine(o: { time: string; count: number }): string {
  return `Reached ${o.time} · ${plural(o.count, 'ascension')}`;
}

// ---- The clean-up's new words ----

/** 1. The saved-from line beside the heading; its "?" holds `savedFromSentence`, and "Work it out again" stays beside it. */
export const savedAnswerLabel = (when: string) => `Saved answer, ${when}`;

/** 2. The marker after the Reached time ("· quick estimate ?"); the "?" holds the night-buy note. */
export const QUICK_ESTIMATE_MARKER = 'quick estimate';

/**
 * 3. The merged route and reached line. A one-ascension route drops the chain ("Reached Nov 20 at 9:00 AM", the count is
 * one and the TE line above already says it):
 *   "Route 198 → 200 → 202 · reached Nov 20 at 9:00 AM · 3 ascensions"
 */
export function routeReachedLine(o: { chain: readonly (number | string)[]; time: string }): string {
  if (o.chain.length <= 1) return `Reached ${o.time}`;
  return `Route ${o.chain.join(' → ')} · reached ${o.time} · ${plural(o.chain.length, 'ascension')}`;
}

/** 4. The gear warning cut to its effect; today's reason text and Why list go behind a "?", unchanged. */
export const gearEffectLine = (days: number) => `Up to about ${plural(days, 'day')} later than shown.`;

/** 5. The main button while another route is followed (otherwise it stays "Follow this route"). */
export const FOLLOW_THIS_ROUTE_INSTEAD = 'Follow this route instead';

/**
 * 6. The better-route line in the Following bar (replaces the box; "Follow it" is gone, Keep mine stays). Each side: `te` as
 * "203 TE", `size` the spare or lateness as the app words it ("46h 14m"); `late` says it lands after the date.
 *   "The answer above is better: 203 TE, 46h 14m to spare (yours: 202 TE, 10h 46m)."
 */
export function betterAboveLine(o: {
  better: { te: string; size: string; late?: boolean };
  yours: { te: string; size: string; late?: boolean };
}): string {
  const tail = (s: { size: string; late?: boolean }) => (s.late ? `lands ${s.size} after the date` : s.size);
  return `The answer above is better: ${o.better.te}, ${o.better.late ? tail(o.better) : `${o.better.size} to spare`} (yours: ${o.yours.te}, ${tail(o.yours)}).`;
}

/**
 * 6b. The same line for Fastest, where each side is a finish time (the app's own writing of it, e.g. lib/eventWhen.ts
 * `dateAt`: "Sep 16, 2028 at 9:00 AM"):
 *   "The answer above is faster: Sep 16, 2028 at 9:00 AM (yours: Sep 24, 2028 at 9:00 AM)."
 * It says "faster", not "better", because the finish time is what is compared; it keeps the shape of `betterAboveLine`.
 */
export function fasterAboveLine(o: { better: string; yours: string }): string {
  return `The answer above is faster: ${o.better} (yours: ${o.yours}).`;
}

/**
 * 7. By a date, a new date picked while the answer on screen is still the old date's (QA, 13 Nov 2026): the old answer
 * goes, and this line stands where it was until the new one is in. DRAFT (Words).
 */
export const DATE_CHANGED_WORKING = 'Working out the answer for the new date';
