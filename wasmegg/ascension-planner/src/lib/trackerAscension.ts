/**
 * THE BUILD-UP TRACKER'S ASCENSION, KEPT FOR THE ASCENSION (code review round 2, 22 Nov 2026, R7.5). In a followed
 * route's first ascension the page's estimate of its start (lib/buildUpTracker.ts `ascensionStartOf`: the plan's
 * `planStart`) is when the answer was priced, so every newer save moved it: the kept plan, the player's ticks, the fold
 * choice and the calendar uids were all dropped. The save holds no time that stays fixed for one ascension, but it
 * holds the ascension count (`virtue.resets`): while that, the followed route's first stop and the save's order match
 * the kept plan's, the tracker keeps the kept plan's key.
 */

/** Whether `nowSeconds` is in the plan's first ascension (`ascensionStartOf`'s index 0). */
export function inFirstAscension(
  plan: { chain: number[]; legs: { endTime: number }[] | null; tableLegs?: { end: number }[] | null } | null,
  nowSeconds: number
): boolean {
  if (!plan) return false;
  const ends = plan.legs ? plan.legs.map(l => l.endTime) : (plan.tableLegs ?? []).map(l => l.end);
  return ends.slice(0, plan.chain.length).findIndex(e => nowSeconds < e) === 0;
}

/** What says which ascension the save is in: its count, the followed route's first stop, and whether it is the first. */
export interface TrackerAscension {
  resets: number | null;
  firstStop: number | null;
  first: boolean;
}

/** The kept plan's key when it is still this ascension's (same count, same first stop, a save no older), else null. */
export function keptAscensionStart(
  kept: { ascensionStart: number; saveSeconds: number; resets?: number; firstStop?: number } | null,
  now: TrackerAscension | null,
  saveSeconds: number
): number | null {
  if (!kept || !now?.first || now.resets === null || now.firstStop === null) return null;
  if (kept.resets !== now.resets || kept.firstStop !== now.firstStop || saveSeconds < kept.saveSeconds) return null;
  return kept.ascensionStart;
}
