/**
 * The words of the save strip and the silo line (lib/saveBanner.ts). The "Either your save is out of date, or your silos
 * are running low" blurb of the short-lived amber banner (12 Nov 2026) is retired: the silo line says it now.
 *
 * A *Words.ts file: wording only, never part of the result code hash (lib/resultCodeHash.ts `isWordingOnly`).
 */

/** The silo line turns amber with under this share of the silos' time left (Jordan, 12 Nov 2026), as a percent. UI's rule is
 *  the source; this only says it in Details. */
export const SILO_AMBER_PERCENT_WORDS = 30;

/**
 * THE SILO LINE (12 Nov 2026, Jordan: a small silo tracker as of the save, always shown with a virtue farm, amber under 30%
 * of the silos' time). `when`: when the silos run out, as the app writes times ("Nov 12 at 2:40 PM", lib/eventWhen.ts
 * `dateAt`); `past`: that time has gone by; `low`: the amber state. It goes by the save, so the low one says the game may
 * have synced since. Colour is never alone: the low one says "low".
 *   normal: "Silos run out about Nov 12 at 2:40 PM (from your save)"   ("Silos ran out about … (from your save)")
 *   low:    "Silos are low: they run out about Nov 12 at 2:40 PM (from your save). The game may have synced since, so it
 *            may be later."   (past: "Silos are low: they ran out about … (from your save). The game may have synced since,
 *            so they may have more time now.")
 */
export function siloLine(o: { when: string; past?: boolean; low?: boolean }): string {
  const ran = o.past ? 'ran out' : 'run out';
  if (!o.low) return `Silos ${ran} about ${o.when} (from your save)`;
  const tail = o.past
    ? 'The game may have synced since, so they may have more time now.'
    : 'The game may have synced since, so it may be later.';
  return `Silos are low: they ${ran} about ${o.when} (from your save). ${tail}`;
}

/**
 * The thresholds sentences behind "Details" (moved out of lib/saveFreshness.ts, which is hashed; saveBanner.ts swaps this
 * in for its older "Getting old after…" line). `yellow` / `red`: where Getting old and Out of date start, already as words
 * (lib/saveAge.ts `ageWords`); `clockRight`: the clock-behind state's ending.
 */
export function thresholdsDetail(yellow: string, red: string, clockRight = false): string {
  return `Getting old after ${yellow}, out of date after ${red}, by your save's age${clockRight ? ' once your clock is right' : ''}. The silo line turns amber when your silos have under ${SILO_AMBER_PERCENT_WORDS}% of their time left. Both go by your save, so the game may have synced since.`;
}

/** The quiet line's word for a screen reader (the banner isn't showing): the save's age, not "Up to date" (a 16 h old save
 *  with healthy silos is neither). `age`: lib/saveAge.ts `ageWords`, e.g. "16h". */
export const quietSaveWord = (age: string) => `Save is ${age} old`;
