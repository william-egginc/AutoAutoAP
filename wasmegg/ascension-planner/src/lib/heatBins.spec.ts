/** The heat map behind "Your routes at a glance" (lib/heatBins.ts): columns, rows, counts and the best. */
import { describe, expect, it } from 'vitest';
import { HEAT_STEPS, heatBins, heatStep, zoneOffset, type HeatOptions } from './heatBins';

interface R {
  id: string;
  asc: number;
  y: number | null;
  /** Lower is better. */
  rank: number;
}
const r = (id: string, asc: number, y: number | null, rank = 0): R => ({ id, asc, y, rank });
const te: HeatOptions<R> = { scale: 'te', asc: x => x.asc, y: x => x.y, better: (a, b) => a.rank - b.rank };
const fin = (zone = 'UTC'): HeatOptions<R> => ({ ...te, scale: 'finish', zone, locale: 'en-US' });
const H = 3_600_000;
const D = 24 * H;
const at = (iso: string) => Date.parse(iso);

describe('heatBins: edge cases', () => {
  it('no routes, or none with a value: empty', () => {
    for (const m of [heatBins([], te), heatBins([r('a', 3, null)], te), heatBins([r('a', 3, NaN)], te)]) {
      expect(m.empty).toBe(true);
      expect(m.cells).toEqual([]);
      expect(m.max).toBe(0);
      expect(m.best).toBeNull();
    }
  });

  it('one route: one cell, one row, one column, and it is the best', () => {
    const m = heatBins([r('a', 3, 277)], te);
    expect(m.empty).toBe(false);
    expect(m.cols.map(c => c.label)).toEqual(['3']);
    expect(m.rows).toEqual([{ lo: 277, hi: 277, label: '277', range: 'TE 277' }]);
    expect(m.cells[0][0].count).toBe(1);
    expect(m.max).toBe(1);
    expect(m.best?.id).toBe('a');
    expect(m.bestAt).toEqual({ row: 0, col: 0 });
  });

  it('every route on the same value: a single row; same finish: a single day', () => {
    const m = heatBins([r('a', 2, 300), r('b', 3, 300), r('c', 3, 300)], te);
    expect(m.rows).toHaveLength(1);
    expect(m.cells[0].map(c => c.count)).toEqual([1, 2]);
    expect(m.max).toBe(2);
    const t = at('2027-03-04T10:00:00Z');
    const f = heatBins([r('a', 2, t), r('b', 2, t)], fin());
    expect(f.rows).toHaveLength(1);
    expect(f.rows[0].label).toBe('Mar 4, 10 AM');
  });
});

describe('heatBins: columns', () => {
  it('one column per ascension count present, fewest first (gaps are not filled)', () => {
    const m = heatBins([r('a', 5, 1), r('b', 2, 1), r('c', 3, 1), r('d', 5, 1)], te);
    expect(m.cols.map(c => c.label)).toEqual(['2', '3', '5']);
    expect(m.cells[0].map(c => c.count)).toEqual([1, 1, 2]);
  });
  it('past 12 counts, the longest share the last column, said "13+"', () => {
    const items = Array.from({ length: 15 }, (_, k) => r(`r${k}`, k + 2, 300));
    const m = heatBins(items, te);
    expect(m.cols).toHaveLength(12);
    expect(m.cols[11]).toEqual({ lo: 13, hi: 16, label: '13+' });
    expect(m.cells[0][11].count).toBe(4);
    expect(m.cells[0].reduce((s, c) => s + c.count, 0)).toBe(15);
  });
});

describe('heatBins: TE rows', () => {
  it('a tight range is one row per TE, lowest first', () => {
    const m = heatBins([r('a', 3, 275), r('b', 3, 277)], te);
    expect(m.rows.map(x => x.label)).toEqual(['275', '276', '277']);
    expect(m.cells.map(line => line[0].count)).toEqual([1, 0, 1]);
  });
  it('a wide range: round steps, 10 rows or fewer, every route counted once', () => {
    const items = Array.from({ length: 40 }, (_, k) => r(`r${k}`, 3 + (k % 4), 220 + k * 7));
    const m = heatBins(items, te);
    expect(m.rows.length).toBeGreaterThanOrEqual(6);
    expect(m.rows.length).toBeLessThanOrEqual(10);
    expect(m.rows[0]).toMatchObject({ lo: 200, hi: 249, label: '200–249', range: 'TE 200–249' });
    expect(m.cells.flat().reduce((s, c) => s + c.count, 0)).toBe(40);
  });
  it('a huge range still fits in 10 rows', () => {
    const m = heatBins([r('a', 1, 1), r('b', 1, 9_999_999)], te);
    expect(m.rows.length).toBeLessThanOrEqual(10);
    expect(m.cells[0][0].count + m.cells[m.rows.length - 1][0].count).toBe(2);
  });
});

describe('heatBins: finish rows', () => {
  it('a few days apart: whole days on the player\'s clock, named like "Oct 12"', () => {
    const m = heatBins(
      [r('a', 3, at('2026-10-12T05:00:00Z')), r('b', 3, at('2026-10-15T23:00:00Z')), r('c', 4, at('2026-10-17T12:00:00Z'))],
      fin()
    );
    expect(m.rows.length).toBeGreaterThanOrEqual(6);
    expect(m.rows.length).toBeLessThanOrEqual(10);
    expect(m.rows[0].label).toMatch(/^Oct 1[12]/);
    expect(m.cells.flat().reduce((s, c) => s + c.count, 0)).toBe(3);
  });
  it('day bins start at local midnight in the zone, not UTC', () => {
    const zone = 'America/Los_Angeles';
    const m = heatBins(
      [r('a', 3, at('2026-10-12T08:00:00Z')), r('b', 3, at('2026-10-20T06:00:00Z'))], // Oct 12 1 AM PDT, Oct 19 11 PM PDT
      fin(zone)
    );
    expect(m.rows[0].lo).toBe(at('2026-10-12T07:00:00Z'));
    expect(m.rows[0].label).toBe('Oct 12');
    expect(m.rows[m.rows.length - 1].label).toBe('Oct 19');
    expect(zoneOffset(at('2026-10-12T08:00:00Z'), zone)).toBe(-7 * H);
  });
  it('months apart: calendar months, named "Mar 2027"', () => {
    const m = heatBins([r('a', 3, at('2027-01-20T00:00:00Z')), r('b', 5, at('2027-08-02T00:00:00Z'))], fin());
    expect(m.rows.map(x => x.label)).toEqual([
      'Jan 2027',
      'Feb 2027',
      'Mar 2027',
      'Apr 2027',
      'May 2027',
      'Jun 2027',
      'Jul 2027',
      'Aug 2027',
    ]);
    expect(m.rows[0].range).toBe('Jan 2027');
  });
  it('decades apart: whole years, still 10 rows or fewer; nothing is lost', () => {
    const m = heatBins([r('a', 3, at('2027-01-20T00:00:00Z')), r('b', 3, at('2061-08-02T00:00:00Z'))], fin());
    expect(m.rows.length).toBeLessThanOrEqual(10);
    expect(m.rows[0].label).toMatch(/^\d{4}$/);
    expect(m.cells.flat().reduce((s, c) => s + c.count, 0)).toBe(2);
  });
  it('a multi-day bin names its first and last day', () => {
    const m = heatBins([r('a', 3, at('2026-10-01T05:00:00Z')), r('b', 3, at('2026-10-20T05:00:00Z'))], fin());
    expect(m.rows[0].range).toMatch(/^Sep 2\d to Oct \d+$|^Oct \d+ to Oct \d+$/);
  });
});

describe('heatBins: the best', () => {
  it('each cell keeps its routes best first; the map keeps the overall best and its cell', () => {
    const m = heatBins([r('a', 3, 277, 5), r('b', 3, 277, 2), r('c', 4, 280, 1), r('d', 4, 280, 9)], te);
    const c = m.cells[0][0];
    expect(c.items.map(x => x.id)).toEqual(['b', 'a']);
    expect(c.best?.id).toBe('b');
    expect(m.best?.id).toBe('c');
    expect(m.bestAt).toEqual({ row: m.rows.length - 1, col: 1 });
  });
});

describe('heatStep', () => {
  it('empty is none; 1..max spread light to dark; the max is the darkest', () => {
    expect(heatStep(0, 5)).toBeNull();
    expect(heatStep(1, 1)).toBe(HEAT_STEPS.length - 1);
    expect(heatStep(1, 10)).toBe(0);
    expect(heatStep(10, 10)).toBe(HEAT_STEPS.length - 1);
    const steps = Array.from({ length: 10 }, (_, k) => heatStep(k + 1, 10)!);
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
  });
});
