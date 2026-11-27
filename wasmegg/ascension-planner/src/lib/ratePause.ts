/**
 * @module ratePause
 * @description Whether a speed sample spans a time the page was not running.
 *
 * A phone that goes to the background (screen off, another app) freezes the page and its workers. The
 * batch in flight comes back when the phone wakes, and a sample taken then charges every minute of the
 * pause to its routes: tester report, R7 live, 9 Nov 2026, "about 36 hours" before a Fast search that
 * took about 20 minutes, from a speed kept after such a pause (stores/chainSearch.ts `noteRate`).
 *
 * The store keeps a heartbeat while a run is going (every `RATE_BEAT_MS`). A gap in it longer than
 * `PAUSE_GAP_MS`, or the tab going hidden, marks the sample as paused, and it is dropped: the rate's
 * clock starts again from there. The gap is also checked when the sample is taken (now against the
 * later of the last beat and the last sample), because after a freeze the batch's answer may be handled
 * before the heartbeat's own timer.
 */

/** The heartbeat's period while a run is going. */
export const RATE_BEAT_MS = 5_000;
/** A gap this long with no heartbeat is a pause. A batch never blocks the main thread (the workers
 *  price it), so a live page never goes this long without one. */
export const PAUSE_GAP_MS = 120_000;

/** True when the sample from `lastSampleAt` to `now` spans a pause. */
export function spansPause(o: { now: number; lastBeatAt: number; lastSampleAt: number; paused: boolean }): boolean {
  if (o.paused) return true;
  return o.now - Math.max(o.lastBeatAt, o.lastSampleAt) > PAUSE_GAP_MS;
}
