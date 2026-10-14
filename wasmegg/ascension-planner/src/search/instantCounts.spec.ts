import { describe, expect, it } from 'vitest';
import { countsShown } from './instantCounts';

const route = (n: number) => ({ legs: Array.from({ length: n }, () => 0) });

describe('countsShown', () => {
  const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(route);

  it('shows up to one past the best and hides the rest', () => {
    const r = countsShown(rows, rows[5], null);
    expect(r.limit).toBe(7);
    expect(r.shown.map(x => x.legs.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(r.hidden).toBe(3);
  });

  it('reaches one past the exact best when that is the longer', () => {
    expect(countsShown(rows, rows[3], rows[6]).limit).toBe(8);
  });

  it('nothing to hide when the rows stop at the limit', () => {
    expect(countsShown(rows.slice(0, 5), rows[4], null).hidden).toBe(0);
  });
});
