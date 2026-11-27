/**
 * "Go further: open in Custom ›" on a finished Fast or Exact result (25 Oct 2026). The old link ran the next
 * level up, which after Exact was Very high, a level players no longer pick (glossary 25 Oct). Custom takes over
 * instead, its boxes filled from this run's own best routes: for each stop, the lowest to the highest value those
 * routes used, so the player can widen them or add their own before pressing Find. Nothing runs from here.
 *
 * Pure: the caller passes the saved run's priced routes (`SearchCheckpoint.durations`, keyed by the route's TEs
 * joined with commas, the final target included) and its best route.
 */
import { formatBand } from './exhaustive';

/** How many of the run's fastest routes shape the boxes: enough to show where the good routes sit, few enough
 *  that the box stays a size Custom can price (Custom still asks before a big one). */
export const GO_FURTHER_ROUTES = 8;

/**
 * Custom's band text ("185-190:1; 240-243:1; ...", one band per stop before the target) from the fastest routes
 * with the best route's number of ascensions and target; null when there is nothing to build one from.
 */
export function goFurtherBands(
  durations: readonly (readonly [string, number])[],
  best: readonly number[],
  take = GO_FURTHER_ROUTES
): { bands: string; routes: number } | null {
  if (best.length < 2) return null;
  const finalTE = best[best.length - 1];
  const routes: { chain: number[]; seconds: number }[] = [];
  for (const [key, seconds] of durations) {
    if (!(seconds > 0)) continue;
    const chain = key.split(',').map(Number);
    if (chain.length !== best.length || chain[chain.length - 1] !== finalTE || chain.some(v => !Number.isFinite(v))) continue;
    routes.push({ chain, seconds });
  }
  // The best route always shapes the box, even if the run's record somehow lacks it.
  if (!routes.some(r => r.chain.join(',') === best.join(','))) routes.push({ chain: [...best], seconds: 0 });
  routes.sort((a, b) => a.seconds - b.seconds);
  const used = routes.slice(0, Math.max(1, take));
  const bands: string[] = [];
  for (let i = 0; i < best.length - 1; i++) {
    const vals = used.map(r => r.chain[i]);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    bands.push(lo === hi ? String(lo) : formatBand(Array.from({ length: hi - lo + 1 }, (_, k) => lo + k)));
  }
  return { bands: bands.join('; '), routes: used.length };
}
