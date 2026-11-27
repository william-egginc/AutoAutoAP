import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_FAST_SHARE,
  DEFAULT_SHARES,
  KEEP,
  loadTypicalShares,
  noteTypicalShare,
  typicalCount,
  typicalTotal,
} from './fastTypical';

beforeEach(() => {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
});

describe('what a Smart search typically prices here', () => {
  it("with nothing kept (a first run on a device): Fast's built-in share; the bound for a level without one", () => {
    expect(DEFAULT_SHARES.quick).toBe(DEFAULT_FAST_SHARE);
    expect(typicalCount(915, undefined, DEFAULT_FAST_SHARE)).toBe(Math.round(915 * DEFAULT_FAST_SHARE));
    expect(typicalCount(915, [], DEFAULT_SHARES.normal)).toBe(915);
    // Counts down to the built-in share, then past it to the bound (no kept runs to step through).
    expect(typicalTotal(915, undefined, 400, DEFAULT_FAST_SHARE)).toBe(499);
    expect(typicalTotal(915, undefined, 500, DEFAULT_FAST_SHARE)).toBe(915);
  });

  it("is the kept runs' median share of this bound, kept per player and level, the last few only", () => {
    let s = loadTypicalShares('P');
    for (const [priced, bound] of [
      [499, 915],
      [602, 915],
      [492, 915],
    ])
      s = noteTypicalShare('P', s, 'quick', priced, bound);
    expect(typicalCount(915, loadTypicalShares('P').quick)).toBe(499);
    // Another bound (a longer route): the same share of it.
    expect(typicalCount(1200, s.quick)).toBe(Math.round(1200 * (499 / 915)));
    expect(loadTypicalShares('P').normal).toBeUndefined();
    expect(loadTypicalShares('Q')).toEqual({});
    for (let i = 0; i < 10; i++) s = noteTypicalShare('P', s, 'quick', 500, 915);
    expect(loadTypicalShares('P').quick).toHaveLength(KEEP);
  });

  it('counts down to the typical count, then the most a kept run priced, then the bound', () => {
    const shares = [0.5, 0.6, 0.55];
    expect(typicalTotal(1000, shares, 300)).toBe(550);
    expect(typicalTotal(1000, shares, 550)).toBe(550);
    expect(typicalTotal(1000, shares, 551)).toBe(600);
    expect(typicalTotal(1000, shares, 700)).toBe(1000);
    expect(typicalTotal(1000, shares, 1200)).toBe(1200);
  });

  it('ignores a damaged entry', () => {
    localStorage.setItem('chain_typical_v1:P', '{not json');
    expect(loadTypicalShares('P')).toEqual({});
    localStorage.setItem('chain_typical_v1:P', JSON.stringify({ quick: [2, -1, 0.5, 'x'] }));
    expect(loadTypicalShares('P')).toEqual({ quick: [0.5] });
  });
});
