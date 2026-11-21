/** The exact line under the instant answer (R10 option C, 21 Nov 2026): PLACEHOLDER words, all for Words. Wording only, never in the result hash.
 *  "Check exactly" is a retired player word, so none of these use it. No typed "…": the moving dots are drawn (Jordan, 1 Nov 2026). */
export const EXACT_START = 'Work this out exactly';
export const EXACT_WAITING = 'Waiting for your search to finish';
export const EXACT_RUNNING = 'Working out this route exactly';
export const exactProgress = (done: number, total: number): string => `${done} of ${total} ascensions`;
export const EXACT_LONG = 'This can take several minutes.';
export const EXACT_STOP = 'Stop';
export const EXACT_TAG = 'exact';
export const EXACT_TAG_HELP = 'Worked out ascension by ascension on your save, the way a search does it.';
export const exactWas = (when: string): string => `Quick estimate was ${when}`;
export const EXACT_SAME = 'Same as the quick estimate';
export const exactMisses = (gap: string): string => `Misses the date by about ${gap}`;
export const EXACT_STEPS_NOTE = 'The steps below are still quick estimates.';
