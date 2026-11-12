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

/** Hours of silo time under which the save banner shows. Must equal lib/saveBanner.ts SAVE_BANNER_SILO_HOURS (a spec pins it;
 *  this file can't import saveBanner, which imports it). */
export const SAVE_BANNER_SILO_HOURS_WORDS = 6;

/**
 * The thresholds sentence behind "Details" (moved out of lib/saveFreshness.ts, which is hashed, 12 Nov 2026), reworded the
 * same day for the new rule: the banner shows only when the silos are low AND the save is old (lib/saveBanner.ts).
 * `yellow` / `red`: where Getting old and Out of date start, already as words (lib/saveAge.ts `ageWords`); `clockRight`:
 * the clock-behind state's ending.
 */
export function thresholdsDetail(yellow: string, red: string, clockRight = false): string {
  return `The banner shows only when your silos have under ${SAVE_BANNER_SILO_HOURS_WORDS} hours left and your save is getting old (after ${yellow}) or out of date (after ${red}). The same lines apply to the silo time used${clockRight ? ', once your clock is right' : ''}.`;
}

/** The quiet line's word for a screen reader (the banner isn't showing): the save's age, not "Up to date" (a 16 h old save
 *  with healthy silos is neither). `age`: lib/saveAge.ts `ageWords`, e.g. "16h". */
export const quietSaveWord = (age: string) => `Save is ${age} old`;
