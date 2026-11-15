/**
 * A tight instant answer By a date (13 Nov 2026). "314 TE · 19h 6m to spare" was shown as reached, but the quick
 * estimate was 37 h early and the exact price misses the date by 19 h (Custom found 313). The quick estimate can be
 * a few days late (lib/answerCaveat.ts), so under about 2 days to spare the TE is a close call, not a result.
 * Words only: the page shows the tag and the line; nothing here prices a route.
 */

/** Under this much spare, with the quick estimate's gear caveat showing, the TE is unconfirmed (about 2 days). */
export const CLOSE_CALL_SECONDS = 2 * 86400;

export const CLOSE_CALL_TAG = 'close call';

/** `gearCaveat`: the caveat that the quick estimate can be late shows for this answer (as lib/spareLine.ts takes it).
 *  `hoursLimited`: the awake hours limit the answer, which route checks found up to days early (review T3, 15 Nov 2026). */
export function isCloseCall(spareSeconds: number, gearCaveat: boolean, hoursLimited = false): boolean {
  return (gearCaveat || hoursLimited) && spareSeconds < CLOSE_CALL_SECONDS;
}

/** The line under a close call, or null when a finished Custom result for this date confirms the TE (same or higher: review T12).
 *  A Custom result with a lower TE for this date is the confirmed answer. */
export function closeCallLine(o: { te: number; found?: { level: string; endTE: number } | null }): string | null {
  const f = o.found;
  if (f && f.level === 'Custom' && Math.floor(f.endTE) >= o.te) return null;
  if (f && f.level === 'Custom' && Math.floor(f.endTE) < o.te)
    return `Custom found ${Math.floor(f.endTE)} TE for this date, which is confirmed. The ${o.te} TE above may miss.`;
  return `${o.te} TE is a close call: the quick estimate can be a few days late, so this may miss the date. Run Custom to confirm.`;
}

/** The button under a close call that starts a Fast run for this goal (Jordan, 15 Nov 2026). DRAFT: Words writes the text. */
export const CHECK_WITH_FAST = 'Check this with Fast';

/**
 * Whether to offer that button: the answer is a close call (for any reason: `isCloseCall`'s spare under the budget, the awake hours, or
 * the gear caveat), no run is going, and no Custom result has settled the date already (`closeCallLine`). Never for an answer that is not a
 * close call.
 */
export function showCheckWithFast(o: { closeCall: boolean; found?: { level: string; endTE: number } | null; running: boolean }): boolean {
  if (!o.closeCall || o.running) return false;
  return !(o.found && o.found.level === 'Custom');
}
