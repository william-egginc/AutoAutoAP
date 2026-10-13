/**
 * Highest TE by a date's two searches, each in its own box with its own run controls and results, as
 * on Fastest (the user, 12 Oct 2026: "the same, just different steps"): Nearby routes ('around', the
 * routes around the instant answer, in the Stronger check box) and Exhaustive ('boxes', the boxes the
 * player sets). The store holds one deadline run and one answer; these say which box each belongs to,
 * as Fastest's panels do with `ownRun` (store `chainRunKind`). DeadlinePanel.vue uses them.
 */
import type { StrongerLevel } from '@/stores/stronger';

export type ByDateKind = 'around' | 'boxes';
export const BY_DATE_KINDS: readonly ByDateKind[] = ['around', 'boxes'];

/** Where each box's run controls and results are teleported (targets always on the page). */
export const BY_DATE_TARGETS: Record<ByDateKind, { controls: string; results: string }> = {
  around: { controls: '#bd-around-controls', results: '#bd-around-results' },
  boxes: { controls: '#bd-exh-controls', results: '#bd-exh-results' },
};

const kindOf = (simple: boolean | undefined): ByDateKind => (simple ? 'around' : 'boxes');

/**
 * The run going, by box: the box whose Find was pressed (`starting`, set for the length of that run),
 * else the store's flag for the run (a carry-on), else none.
 */
export function runKindOf(o: { running: boolean; starting: ByDateKind | null; runSimple: boolean }): ByDateKind | null {
  if (!o.running) return null;
  return o.starting ?? kindOf(o.runSimple);
}

/** The answer on screen (or an unfinished run's spec), by box. */
export function kindOfSimple(r: { simple?: boolean } | null | undefined): ByDateKind | null {
  return r ? kindOf(r.simple) : null;
}

/**
 * What the run being planned or going reads: Nearby routes' boxes (true) or Exhaustive's chains. Idle,
 * Exhaustive's (its estimate box is the one that shows the plan).
 */
export function readsAround(o: { running: boolean; starting: ByDateKind | null; runSimple: boolean }): boolean {
  return o.starting ? o.starting === 'around' : o.running && o.runSimple;
}

/** The box that reports how the last run went (its send, its error, a wait for another run). */
export function reportKindOf(o: {
  run: ByDateKind | null;
  last: ByDateKind | null;
  result: ByDateKind | null;
}): ByDateKind {
  return o.run ?? o.last ?? o.result ?? 'boxes';
}

/**
 * Whether box `k` shows its run controls. Exhaustive always; Nearby routes at Fast and above (as
 * Fastest's ChainSearchPanel), and whatever the level while its run goes, its answer is on screen,
 * its run can be carried on, or it reports the last run.
 */
export function showsControls(
  k: ByDateKind,
  o: {
    level: StrongerLevel;
    run: ByDateKind | null;
    result: ByDateKind | null;
    unfinished: ByDateKind | null;
    report: ByDateKind;
  }
): boolean {
  if (k === 'boxes') return true;
  return o.level !== 'light' || o.run === k || o.result === k || o.unfinished === k || o.report === k;
}
