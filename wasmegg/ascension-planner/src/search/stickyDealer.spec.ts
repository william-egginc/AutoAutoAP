import { describe, expect, it } from 'vitest';
import { createStickyDealer } from './stickyDealer';
import { sortChainsDepthFirst } from './chain';

/** Every 3-ascension route over these first and second stops, each with last stop `last`. */
function batch(firsts: number[], seconds: number[], last: (a: number, b: number) => number): number[][] {
  const out: number[][] = [];
  for (const a of firsts) for (const b of seconds) out.push([a, b, last(a, b)]);
  return sortChainsDepthFirst(out);
}
const range = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
const loads = (dealt: number[], workers: number) => {
  const l = new Array(workers).fill(0);
  for (const w of dealt) l[w]++;
  return l;
};

describe('the sticky dealer', () => {
  it('deals a batch evenly', () => {
    const d = createStickyDealer();
    const chains = batch(range(151, 170), range(200, 211), () => 300);
    const l = loads(d.deal(chains, 8), 8);
    expect(Math.max(...l) / (chains.length / 8)).toBeLessThan(1.25);
    expect(Math.min(...l)).toBeGreaterThan(0);
  });

  it('keeps siblings (sets that differ only in their last early stop) on one worker where it can', () => {
    const d = createStickyDealer();
    const chains = batch(range(151, 166), range(200, 211), () => 300);
    const dealt = d.deal(chains, 4);
    const workersPerGroup = new Map<number, Set<number>>();
    chains.forEach((c, i) => {
      const s = workersPerGroup.get(c[0]) ?? new Set();
      s.add(dealt[i]);
      workersPerGroup.set(c[0], s);
    });
    // 16 groups of 12 over 4 workers: each group whole.
    expect([...workersPerGroup.values()].every(s => s.size === 1)).toBe(true);
  });

  it('sends a set back to the worker that priced it, round after round', () => {
    const d = createStickyDealer();
    const first = batch(range(151, 170), range(200, 211), () => 300);
    const dealt = d.deal(first, 8);
    const was = new Map(first.map((c, i) => [c.slice(0, -1).join(','), dealt[i]]));
    // Next round: the same sets, new last stops.
    const again = batch(range(151, 170), range(200, 211), (a, b) => 280 + ((a + b) % 7));
    const now = d.deal(again, 8);
    const moved = again.filter((c, i) => was.get(c.slice(0, -1).join(',')) !== now[i]).length;
    expect(moved).toBe(0);
  });

  it('moves only what it must when some sets drop out', () => {
    const d = createStickyDealer();
    const all = batch(range(151, 170), range(200, 211), () => 300);
    const first = d.deal(all, 8);
    const owner = new Map(all.map((c, i) => [c.slice(0, -1).join(','), first[i]]));
    // Half the sets are finished; the rest come back unevenly spread over the workers.
    const open = all.filter(c => c[0] < 160 || c[1] % 3 === 0).map(c => [c[0], c[1], 310]);
    const now = d.deal(open, 8);
    const l = loads(now, 8);
    expect(Math.max(...l) / (open.length / 8)).toBeLessThan(1.3);
    const kept = open.filter((c, i) => owner.get(c.slice(0, -1).join(',')) === now[i]).length;
    expect(kept / open.length).toBeGreaterThan(0.6);
  });

  it('re-deals only the sets of workers that went when the pool shrinks, and fills new ones when it grows', () => {
    const d = createStickyDealer();
    const all = batch(range(151, 174), range(200, 211), () => 300);
    const at8 = d.deal(all, 8);
    const at6 = d.deal(
      all.map(c => [c[0], c[1], 301]),
      6
    );
    all.forEach((_, i) => {
      expect(at6[i]).toBeLessThan(6);
      if (at8[i] < 6) expect(at6[i]).toBe(at8[i]);
    });
    const at10 = d.deal(
      all.map(c => [c[0], c[1], 302]),
      10
    );
    const l = loads(at10, 10);
    // The new workers take a share, by taking the overflow of the old ones. Moving a set costs its
    // early leg again where it lands, so the even-out stops short of equal route counts.
    expect(l[8] + l[9]).toBeGreaterThan(0);
    expect(Math.max(...l) / (all.length / 10)).toBeLessThan(1.4);
  });

  it('spreads many one-stop sets (2-ascension routes) instead of grouping them all together', () => {
    const d = createStickyDealer();
    const chains = sortChainsDepthFirst(range(151, 190).map(a => [a, 300]));
    const l = loads(d.deal(chains, 8), 8);
    expect(Math.max(...l)).toBeLessThanOrEqual(6);
  });
});
