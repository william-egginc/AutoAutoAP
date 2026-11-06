/**
 * The words of lib/saveAge.ts `describeSaveAge` (spec-fluff3-chrome): moved out word for word so the notes can be
 * reworded without moving the result code hash (lib/resultCodeHash.ts: saveAge.ts is an input, a *Words.ts file is
 * not). The rules (which note, when) stay in saveAge.ts.
 */

/** Added to the notes that start at or after the last sync. */
export const NEWER_SYNC = " If you've opened the game since then and have a newer sync, this might not be accurate.";

export const SAVE_AGE_WORDS = {
  /** No virtue farm in progress. No age here: Setup's save card says it once ("Save from 14 min ago", ux review 26 Oct, row 19). */
  noVirtueFarm: () =>
    `Your save has no virtue farm in progress, so there is nothing to catch up: the plan starts with a fresh ascension.`,
  /** Within 15 minutes of the last sync. */
  atSync: () => 'Starts at your last sync, so the farm being simulated and the clock agree.' + NEWER_SYNC,
  /** Before the last sync. */
  beforeSync: (age: string) =>
    `Starts ${age} before your last sync, so the plan begins before the farm state it uses existed.`,
  /** Caught up, within what the silos hold. No age here either (the save card has it). One clause (UX fluff review 2,
   *  S10, spec-fluff3-chrome; DRAFT for Words): it was 5 lines in bold green ("The farm is caught up from your save to
   *  the plan start at its current rate, the way the game credits time away (your silos hold …). If you've opened the
   *  game since then … Anything you bought since is not in it; sync and reload if you have played."). */
  caughtUp: (_silos: string) => 'Your farm is caught up to here from your save. Played since? Sync and reload.',
  /** Past what the silos hold. DRAFT wording (Words reviews; was "Your save is 40h old, longer than your silos hold
   *  (12h), so the answers here won't be accurate. Force a sync: ..." in red, now the save-age banner's to say). */
  pastSilos: (age: string, silos: string) =>
    `Starts ${age} after your last sync, longer than your silos hold (${silos}): the planner counts the farm as running for ${silos} only, the way the game credits time away, then earning nothing.`,
} as const;
