/**
 * @module polish
 * @description The step after an exhaustive grid sweep: re-search around the grid's winner one TE at
 * a time.
 *
 * WHY (2026-09-24). A banded sweep like M3's `181-250:5` tries every 5th TE, so its winner is the
 * best ON THAT GRID and nothing more. A player ran M3 (221 250 290 490, 667.4 d) and a plain
 * Balanced search (227 259 297 490, 666.5 d): none of 227, 259 or 297 is on the grid, so the sweep
 * could never have tried the faster chain. Durations are jagged -- a leg that misses its Saturday
 * sale jumps by about three days -- so a 5-TE step can step over a good valley entirely.
 *
 * The fix is the staged search's own Balanced tier (coordinate descent, then every 1-TE pair of
 * adjacent checkpoints) started FROM the grid's winner, with the checkpoint count held fixed. It
 * reuses every chain the sweep already priced, costs a few hundred more (measured: ~630 chains for a
 * 4-ascension chain), and means the Insane answer is never worse than a Balanced search from its
 * own best starting point.
 */
import { EFFORT, estimateChains } from './effort';

/** True when every value in every band is one TE apart: the grid already is every TE, so there is
 *  nothing between grid points to find. */
export function gridIsComplete(bands: number[][] | undefined, rangeStep?: number): boolean {
  if (bands?.length) return bands.every(b => b.every((v, i) => i === 0 || v - b[i - 1] === 1));
  return rangeStep === 1;
}

/** The grid's spacing in words: `every TE`, `every 5 TE`, `every 2 to 5 TE`. */
export function gridStepLabel(bands: number[][] | undefined, rangeStep?: number): string {
  const steps = new Set<number>();
  if (bands?.length) {
    for (const b of bands) for (let i = 1; i < b.length; i++) steps.add(b[i] - b[i - 1]);
  } else if (rangeStep) {
    steps.add(rangeStep);
  }
  if (!steps.size) return 'every TE';
  const lo = Math.min(...steps);
  const hi = Math.max(...steps);
  if (hi === 1) return 'every TE';
  return lo === hi ? `every ${lo} TE` : `every ${lo} to ${hi} TE`;
}

/** Upper bound on the chains polishing a `checkpoints`-checkpoint winner prices (final excluded). */
export function polishChainEstimate(checkpoints: number): number {
  return estimateChains(Math.max(1, checkpoints), EFFORT.balanced);
}

/** The fastest priced entry, or null. */
export function fastestEntry<T extends { key: string; seconds: number }>(entries: T[]): T | null {
  let best: T | null = null;
  for (const e of entries) if (e.seconds > 0 && (!best || e.seconds < best.seconds)) best = e;
  return best;
}
