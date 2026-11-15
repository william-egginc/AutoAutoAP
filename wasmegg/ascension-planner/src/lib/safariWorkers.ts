/**
 * SAFARI'S STARTING WORKER COUNT for Chain Finder and By a date (15 Nov 2026, beta; aaap-tools
 * notes/safari-workers-2026-11-15.md). Two Safari By a date runs on an 8-core Mac died about 90 s into visible running,
 * both at 7 workers (13 and 15 Nov); the 15 Nov carry-on at 5 ran to the end and was not slower. Safari reports no
 * heap, so memory is a guess; the pattern is the count.
 *
 *   - Safari starts at most `threads - 3` (5 on 8 cores), at least 1. The player's stored choice (WORKERS_KEY) is kept
 *     as it is, and other browsers start at it as before.
 *   - After a Safari crash, the automatic carry-on's count (useStepAway `stepAwayBeginCarryOn`) is kept under its own
 *     key and is the next Safari start, so the next run doesn't crash the same way. Setting a count by hand in Setup
 *     clears it.
 *
 * A worker prices each route the same, so this changes how long a run takes, never its answer. Imported by the store
 * and useStepAway only (outside the result-code hash).
 */
export const SAFARI_CRASH_WORKERS_KEY = 'aap-safari-crash-workers';

/** The most workers Safari starts with on a machine of `threads` logical cores. */
export function safariCeiling(threads: number): number {
  return Math.max(1, Math.floor(threads) - 3);
}

export function safariStartWorkers(x: {
  /** The count the player would start with anywhere else (their stored choice, or the default). */
  chosen: number;
  threads: number;
  safari: boolean;
  /** The count the last Safari crash's carry-on used, if any. */
  lastCrashCarryOn?: number | null;
}): number {
  if (!x.safari) return x.chosen;
  let n = Math.min(x.chosen, safariCeiling(x.threads));
  if (x.lastCrashCarryOn && x.lastCrashCarryOn > 0) n = Math.min(n, Math.floor(x.lastCrashCarryOn));
  return Math.max(1, n);
}

export function readSafariCrashWorkers(): number | null {
  try {
    const n = Number(localStorage.getItem(SAFARI_CRASH_WORKERS_KEY));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  } catch {
    return null;
  }
}

/** Keep (n > 0) or clear (null) the last Safari crash's carry-on count. */
export function writeSafariCrashWorkers(n: number | null): void {
  try {
    if (n && n > 0) localStorage.setItem(SAFARI_CRASH_WORKERS_KEY, String(Math.floor(n)));
    else localStorage.removeItem(SAFARI_CRASH_WORKERS_KEY);
  } catch {
    // Not kept this time: the next start is the ceiling alone.
  }
}
