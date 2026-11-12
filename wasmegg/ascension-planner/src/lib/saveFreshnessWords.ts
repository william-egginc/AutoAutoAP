/**
 * The blurb that replaces the amber "Getting old" save banner (12 Nov 2026, Jordan). Shown only when the save's silo
 * estimate is under 6 hours (UI owns that rule). A save this old, or silos this low, could mean either: the save is out
 * of date, or the silos are running low. We can't tell which from the save, so it says both and never claims the farm
 * has stopped earning.
 *
 * A *Words.ts file: wording only, never part of the result code hash (lib/resultCodeHash.ts `isWordingOnly`).
 */

/** The first sentence: the two things it can mean. */
export const SAVE_LOW_SILOS_LEAD = 'Either your save is out of date, or your silos are running low.';

/** What to do about it. */
export const SAVE_LOW_SILOS_DO = 'Open Egg, Inc. so it syncs, then load a fresh save.';

/** The whole blurb, one paragraph. */
export const SAVE_LOW_SILOS_WORDS = `${SAVE_LOW_SILOS_LEAD} ${SAVE_LOW_SILOS_DO}`;
