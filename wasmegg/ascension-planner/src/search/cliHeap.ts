/**
 * The command line's main-thread heap (scripts/siteRun.ts): shown on each progress line, and a run
 * stopped cleanly before Node's heap limit rather than killed by V8 (17 Oct 2026: a helper's By a
 * date box, 561K routes on a 32-thread PC, died with a V8 fatal error after 129K). Stopped the way
 * Ctrl+C stops it: the best so far and the checkpoint are kept, and the same command carries on.
 *
 * Measured the same day (alt save, a store with a stand-in pool, 140,000 sets): the store and the
 * search keep about 0.4-3.8 KB a priced route on the main thread, so 129K routes is a few hundred
 * MB. The process's RSS also counts every worker thread's heap (~100-200 MB each), so a 5 GB RSS
 * on 32 workers is mostly the workers. This guard is for whatever the measurement missed.
 */

/** Stop the run at this share of the heap limit: room left for the end-of-run CSV and send. */
export const HEAP_STOP_SHARE = 0.8;

const MB = 1024 * 1024;

/** "heap 612 of 4,144 MB" for the progress line. */
export function heapLabel(usedBytes: number, limitBytes: number): string {
  return `heap ${Math.round(usedBytes / MB).toLocaleString('en-US')} of ${Math.round(limitBytes / MB).toLocaleString('en-US')} MB`;
}

/** Whether the main heap is close enough to its limit to stop the run now. */
export function heapNearLimit(usedBytes: number, limitBytes: number, share = HEAP_STOP_SHARE): boolean {
  return limitBytes > 0 && usedBytes >= share * limitBytes;
}

/** What the command line says when it stops a run for memory. */
export function heapStopMessage(usedBytes: number, limitBytes: number, out: string | undefined): string {
  const limitMB = Math.round(limitBytes / MB);
  const raise = Math.max(8192, Math.ceil((limitMB * 2) / 1024) * 1024);
  const again = out
    ? `The checkpoint in ${out} is kept: run the same command again (no --fresh) with NODE_OPTIONS=--max-old-space-size=${raise} and it carries on from here.`
    : `Without --out there is no checkpoint to carry on from: run it again with --out DIR and NODE_OPTIONS=--max-old-space-size=${raise}, or split the box.`;
  return `this process's memory is near Node's limit (${heapLabel(usedBytes, limitBytes)}). ${again}`;
}
