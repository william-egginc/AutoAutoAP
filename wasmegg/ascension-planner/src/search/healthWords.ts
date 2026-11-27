/**
 * The words of leg 1's build-up note (search/health.ts `buildUpNote`), moved here unchanged so they can be reworded
 * without moving the result code hash (UX fluff review 2, 5 Nov 2026, item C3: a *Words.ts file is wording only,
 * lib/resultCodeHash.ts `isWordingOnly`). health.ts still decides WHEN the note shows and with which numbers.
 */
const PICK_IT = 'Pick "Continue my build-up" or "Fastest" in Setup to use it.';

/** `key`: the first leg's variant; `by`: "157.2 days" or "a long way"; `freshBy`: the days sooner than the fresh start
 *  ("3.1"), or null when the build-up doesn't beat it by a day. */
export function buildUpNoteWords(key: string, by: string, freshBy: string | null): string {
  return key === 'continue'
    ? `Your build isn't finished: carrying on your build-up would end ascension 1 ${by} sooner than finishing without buying, which is what this plan does. ${PICK_IT}`
    : key === 'buildup'
      ? // A clause in the cards' First ascension line since 5 Nov 2026 (UX fluff review 2, item C3; good news, not a
        // warning). DRAFT (Words). Was "Ascension 1 carries on your build-up: that ends it … sooner than finishing your
        // farm as it is, without buying anything more."
        `carries on your build-up (${by} sooner than finishing the farm as it is)`
      : freshBy !== null
        ? `Carrying on your build-up would end ascension 1 ${by} sooner than finishing without buying, and ${freshBy} days sooner than the fresh start this plan takes. ${PICK_IT}`
        : `Carrying on your build-up would end ascension 1 ${by} sooner than finishing without buying; prestiging now was faster still.`;
}
