/**
 * The cage guard: fewer workers before the tab runs out of room (12 Oct 2026).
 *
 * WHAT HAPPENED. The PC's 34-hour By a date run (19 workers, Edge) died at 7:08 am on 12 Oct with
 * "Out of Memory". Its crash dump says the page's own heap held only ~170 MB: what ran out was the
 * 4 GB pointer-compression CAGE that Chromium gives the page and every one of its workers together
 * ("main cage ... ran out of reservation", 117 MB free, no free run over 1.5 MB). Each worker's heap
 * grows and is collected on its own schedule, with no idea the others are filling the same 4 GB; at
 * ~200 MB a worker, 19 of them were the whole cage. The page has no way to read a worker's heap
 * (`performance.memory` exists on the page only), but `performance.measureUserAgentSpecificMemory()`
 * counts the page AND its workers -- where the page is cross-origin isolated (vite.config.ts
 * `crossOriginIsolation`). There, this steps the worker count down a notch whenever the whole page
 * is past CAGE_HIGH_SHARE of the cage on two measurements running, and the progress send leaves its
 * CSV so far for the next send while the page is past CAGE_CSV_SHARE. Without the measurement (Safari,
 * Firefox, or a page that is not isolated) nothing here does anything.
 *
 * Pure: the store and composables/useStepAway.ts hold the state and act.
 */

/** Chromium's pointer-compression cage: the page and all its workers share it. */
export const CAGE_MB = 4096;
/** Past this share of the cage on two measurements running, take a notch of workers off. */
export const CAGE_HIGH_SHARE = 0.8;
/** Past this share, a progress send skips building its CSV so far (the next send tries again). */
export const CAGE_CSV_SHARE = 0.7;
/** At least this long between two step-downs: a measurement waits for a GC, and a worker let go
 *  frees its heap only once its piece is back. */
export const CAGE_COOLDOWN_MS = 3 * 60_000;

/** One notch down: about a sixth of the workers, at least one, never below one. 19 -> 16 -> 13 -> 11. */
export function cageNotch(workers: number): number {
  const n = Math.max(1, Math.floor(workers));
  return Math.max(1, n - Math.max(1, Math.round(n / 6)));
}

/** Whether the whole page's memory (MB, measureUserAgentSpecificMemory) is past `share` of the cage. */
export function pastCage(pageMB: number | null | undefined, share: number): boolean {
  return typeof pageMB === 'number' && Number.isFinite(pageMB) && pageMB > share * CAGE_MB;
}

/**
 * Step the workers down? Only on two measurements in a row past CAGE_HIGH_SHARE (one could be a
 * moment between a worker's garbage and its collection), not inside the cooldown, and never below one.
 * `recent` is the page's last measurements, oldest first; a beat without one is left out.
 */
export function cageStep(a: { recent: readonly number[]; workers: number; lastStepAt: number; now: number }): {
  to: number;
} | null {
  if (a.workers <= 1) return null;
  if (a.now - a.lastStepAt < CAGE_COOLDOWN_MS) return null;
  const lastTwo = a.recent.slice(-2);
  if (lastTwo.length < 2 || !lastTwo.every(mb => pastCage(mb, CAGE_HIGH_SHARE))) return null;
  return { to: cageNotch(a.workers) };
}

/** Whether a progress send may build its CSV so far now: yes unless the page is measured past
 *  CAGE_CSV_SHARE. Unknown memory is a yes (the chunks are small now; search/csv.ts CHUNK_CHARS). */
export function csvSoFarRoom(pageMB: number | null | undefined): boolean {
  return !pastCage(pageMB, CAGE_CSV_SHARE);
}
