import { afterEach, describe, expect, it, vi } from 'vitest';
import { atMostAscensions, describeGains, polishGains, readFilters, writeFilters } from './instantFilters';
import type { FoundRoutes, Route } from './routeFinder';

const route = (k: number, end: number, endTE = 130): Route => ({
  chain: Array.from({ length: k }, (_, i) => 100 + i + 1),
  legs: Array.from({ length: k }, (_, i) => ({
    from: 100,
    to: 101 + i,
    endTE: i === k - 1 ? endTE : 101 + i,
    start: 0,
    end,
    sales: 1,
    tier13: false,
    label: '1-sale',
  })),
  end,
  seconds: end,
});

describe('atMostAscensions', () => {
  const r1 = route(1, 900, 120);
  const r2 = route(2, 700, 126);
  const r3 = route(3, 500, 130);
  const found: FoundRoutes = {
    best: r3,
    byAscensions: [null, r1, r2, r3],
    byDate: r3,
    byDateByAscensions: [null, r1, r2, r3],
    outOfHours: [2, 4],
  };

  it('hides the counts above N and picks the fastest and the date answer from the rest', () => {
    const f = atMostAscensions(found, 2);
    expect(f.byAscensions).toEqual([null, r1, r2, null]);
    expect(f.best).toBe(r2);
    expect(f.byDate).toBe(r2); // the highest TE left
    expect(f.outOfHours).toEqual([2]);
  });

  it('changes nothing when off', () => {
    expect(atMostAscensions(found, null)).toBe(found);
  });

  it('is empty when nothing is left, and keeps no date answer when there was none', () => {
    const f = atMostAscensions({ ...found, byDate: null, byAscensions: [null, null, r2, r3] }, 1);
    expect(f.best).toBeNull();
    expect(f.byDate).toBeNull();
  });
});

describe('the remembered filters', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('start off without storage, and survive a blocked one', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(readFilters()).toEqual({ inHours: false, maxAscensions: null });
    expect(() => writeFilters({ inHours: true, maxAscensions: 3 })).not.toThrow();
  });

  it('come back as written, and ignore a bad number', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    writeFilters({ inHours: true, maxAscensions: 4 });
    expect(readFilters()).toEqual({ inHours: true, maxAscensions: 4 });
    store.set('aap-instant-filters', '{"inHours":"yes","maxAscensions":2.5}');
    expect(readFilters()).toEqual({ inHours: false, maxAscensions: null });
  });
});

describe('the background polish’s gains', () => {
  const r = (k: number, end: number, endTE = 130) => route(k, end, endTE);
  const base = (rs: (Route | null)[]): FoundRoutes => ({
    best: null,
    byAscensions: rs,
    byDate: null,
    byDateByAscensions: rs,
  });

  it('lists the counts that got sooner, not the same or later ones', () => {
    const before = base([null, r(1, 10_000), r(2, 20_000), r(3, 30_000)]);
    const after = base([null, r(1, 10_000), r(2, 20_000 - 4.1 * 3600), r(3, 30_030)]);
    const g = polishGains(before, after, false);
    expect(g).toEqual([{ k: 2, hours: expect.closeTo(4.1, 5) as number, te: 0 }]);
    expect(describeGains(g, false)).toBe('2 ascensions 4.1 h sooner');
  });

  it('By a date: a higher TE, or the same TE with more to spare', () => {
    const before = base([null, r(1, 10_000, 200), r(2, 20_000, 210)]);
    const after = base([null, r(1, 12_000, 201), r(2, 20_000 - 36_000, 210)]);
    const g = polishGains(before, after, true);
    expect(g.map(x => [x.k, x.te])).toEqual([
      [1, 1],
      [2, 0],
    ]);
    expect(describeGains(g, true)).toBe('1 ascension +1 TE; 2 ascensions 10 h more to spare');
  });
});
