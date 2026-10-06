import { describe, expect, it } from 'vitest';
import { addToHeat, createHeat, heatSnapshot, sortedOrder, thinIndices, thinPositions } from './chartThin';

describe('thinPositions', () => {
  it('keeps everything when there are few enough', () => {
    expect(thinPositions(5, 10, 3)).toEqual([0, 1, 2, 3, 4]);
  });

  it('keeps the best, then an even stride ending at the last', () => {
    const p = thinPositions(100, 10, 4);
    expect(p).toHaveLength(10);
    expect(p.slice(0, 4)).toEqual([0, 1, 2, 3]);
    expect(p[p.length - 1]).toBe(99);
    for (let i = 1; i < p.length; i++) expect(p[i]).toBeGreaterThan(p[i - 1]);
  });

  it('never goes over max on a big run', () => {
    const p = thinPositions(120_000);
    expect(p.length).toBeLessThanOrEqual(5_000);
    expect(p.length).toBeGreaterThan(4_900);
    expect(new Set(p).size).toBe(p.length);
  });
});

describe('thinIndices', () => {
  it('keeps the lowest values and returns indices in order', () => {
    const values = Array.from({ length: 1000 }, (_, i) => 1000 - i); // best is the last index
    const kept = thinIndices(values, 50, 10);
    expect(kept).toHaveLength(50);
    for (let i = 990; i < 1000; i++) expect(kept).toContain(i);
    for (let i = 1; i < kept.length; i++) expect(kept[i]).toBeGreaterThan(kept[i - 1]);
  });

  it('sortedOrder breaks ties by index', () => {
    expect([...sortedOrder([2, 1, 2, 1])]).toEqual([1, 3, 0, 2]);
  });
});

describe('heat grid', () => {
  it('counts every chain and keeps a fixed size however many are fed', () => {
    const h = createHeat(40, 30);
    let seed = 1;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 100_000; i++) addToHeat(h, 150 + Math.floor(rand() * 300), 400 + rand() * 200);
    expect(h.total).toBe(100_000);
    expect(h.counts.length).toBe(1200);
    expect(h.counts.reduce((a, b) => a + b, 0)).toBe(100_000);
  });

  it('keeps counts exact when it grows either way', () => {
    const h = createHeat(4, 4, 1, 1);
    addToHeat(h, 10, 10);
    addToHeat(h, 11, 10);
    addToHeat(h, -50, 10); // grows left on x, several times
    addToHeat(h, 10, 500); // grows up on y
    expect(h.counts.reduce((a, b) => a + b, 0)).toBe(4);
    const s = heatSnapshot(h)!;
    expect(s.total).toBe(4);
    expect(s.counts.reduce((a, b) => a + b, 0)).toBe(4);
    // Every point lies inside the snapshot's range.
    for (const [x, y] of [
      [10, 10],
      [-50, 10],
      [10, 500],
    ]) {
      expect(x).toBeGreaterThanOrEqual(s.x0);
      expect(x).toBeLessThan(s.x0 + s.cols * s.xw);
      expect(y).toBeGreaterThanOrEqual(s.y0);
      expect(y).toBeLessThan(s.y0 + s.rows * s.yw);
    }
  });

  it('remembers the fastest duration per column, through merges', () => {
    const h = createHeat(4, 4, 1, 1);
    addToHeat(h, 0, 5);
    addToHeat(h, 1, 3);
    addToHeat(h, 100, 9); // forces x to coarsen until 0 and 1 share a column
    const s = heatSnapshot(h)!;
    const best = [...s.colBest].filter(Number.isFinite);
    expect(Math.min(...best)).toBe(3);
  });

  it('skips non-finite values and snapshots nothing when empty', () => {
    const h = createHeat();
    addToHeat(h, NaN, 1);
    addToHeat(h, 1, Infinity);
    expect(h.total).toBe(0);
    expect(heatSnapshot(h)).toBeNull();
  });
});
