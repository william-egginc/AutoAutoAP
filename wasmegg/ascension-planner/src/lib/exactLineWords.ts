/** The exact line under the instant answer (R10 option C, 21 Nov 2026): Words' draft (21 Nov 2026) over UI's placeholders; every string is one export so a second-route state (if Jordan adds one) is a new line here, not a rewrite. Wording only, never in the result hash.
 *  "Check exactly" is a retired player word, so none of these use it. No typed "…": the moving dots are drawn (Jordan, 1 Nov 2026). */
export const EXACT_START = 'Work this out exactly';
export const EXACT_WAITING = 'Waiting for your search to finish';
export const EXACT_RUNNING = 'Working out this route exactly';
export const exactProgress = (done: number, total: number): string => `${done} of ${total} ${total === 1 ? 'ascension' : 'ascensions'}`;
export const EXACT_LONG = 'This can take several minutes.';
export const EXACT_STOP = 'Stop';
export const EXACT_TAG = 'exact';
export const EXACT_TAG_HELP = 'Worked out ascension by ascension on your save, the way a search does it.';
export const exactWas = (when: string): string => `Quick estimate was ${when}`;
export const EXACT_SAME = 'Same as the quick estimate';
export const exactMisses = (gap: string): string => `Misses the date by about ${gap}`;
export const EXACT_STEPS_NOTE = 'The steps below are still quick estimates.';
/** Two routes (Jordan, 21 Nov 2026, option 1(a)): the box switched to the faster route, or offers it after Follow / Simulate. PLACEHOLDERS for Words. */
export const EXACT_FASTER = 'A faster route was found.';
export const EXACT_FASTER_OFFERED = 'A faster route was found. Nothing was switched because you already used this one.';
export const EXACT_FASTER_DATE = 'A route that makes the date with more to spare was found.';
export const EXACT_SHOW_FIRST = 'Show the first route instead';
export const EXACT_SHOW_FASTER = 'Show the faster route';
export const EXACT_COUNTS_NOTE = 'These are quick estimates. The route above was worked out exactly.';
