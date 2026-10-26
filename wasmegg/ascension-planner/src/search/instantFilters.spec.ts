import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  atMostAscensions,
  boundInput,
  boundsAfter,
  boundsText,
  describeBoxGain,
  polishGains,
  readFilters,
  setBound,
  withinAscensions,
  writeFilters,
} from './instantFilters';
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

  it('carries each kept count\'s other routes', () => {
    const f = atMostAscensions({ ...found, alternatives: [[], [r2], [r1], [r1]], dateAlternatives: [[], [], [r3], [r2]] }, 2);
    expect(f.alternatives).toEqual([[], [r2], [r1], []]);
    expect(f.dateAlternatives).toEqual([[], [], [r3], []]);
    expect('alternatives' in atMostAscensions(found, 2)).toBe(false);
  });

  it('is empty when nothing is left, and keeps no date answer when there was none', () => {
    const f = atMostAscensions({ ...found, byDate: null, byAscensions: [null, null, r2, r3] }, 1);
    expect(f.best).toBeNull();
    expect(f.byDate).toBeNull();
  });
});

describe('withinAscensions (From … to …, 24 Oct 2026)', () => {
  const r1 = route(1, 900, 120);
  const r2 = route(2, 700, 126);
  const r3 = route(3, 500, 130);
  const r4 = route(4, 450, 131);
  const found: FoundRoutes = {
    best: r4,
    byAscensions: [null, r1, r2, r3, r4],
    byDate: r4,
    byDateByAscensions: [null, r1, r2, r3, r4],
    outOfHours: [1, 3],
  };

  it('keeps only the counts inside both ends, and picks the box from them', () => {
    const f = withinAscensions(found, { min: 2, max: 3 });
    expect(f.byAscensions).toEqual([null, null, r2, r3, null]);
    expect(f.byDateByAscensions).toEqual([null, null, r2, r3, null]);
    expect(f.best).toBe(r3);
    expect(f.byDate).toBe(r3);
    expect(f.outOfHours).toEqual([3]);
    expect(f.outside).toBeUndefined();
  });

  it('a lower end alone never lets a route with fewer be the pick', () => {
    const f = withinAscensions({ ...found, best: r1, byAscensions: [null, route(1, 100), r2, r3, null] }, { min: 2, max: null });
    expect(f.best).toBe(r3); // the fastest of 2 and more, never the 1-ascension route that was sooner
    expect(f.byAscensions[1]).toBeNull();
  });

  it('with nothing in the range, names the nearest count that has a route (a tie goes to fewer)', () => {
    const gap: FoundRoutes = { ...found, byAscensions: [null, r1, null, null, r4], byDateByAscensions: [null, r1, null, null, r4] };
    const f = withinAscensions(gap, { min: 2, max: 3 });
    expect(f.best).toBeNull();
    expect(f.byDate).toBeNull();
    expect(f.outside?.fastest).toEqual({ ascensions: 1, chain: r1.chain, end: 900, endTE: 120 });
    expect(f.outside?.date?.ascensions).toBe(1);
    expect(withinAscensions(gap, { min: 3, max: 3 }).outside?.fastest?.ascensions).toBe(4);
  });

  it('says nothing about By a date when there was no date answer at all', () => {
    const f = withinAscensions({ ...found, byDate: null }, { min: 6, max: null });
    expect(f.outside?.fastest?.ascensions).toBe(4);
    expect(f.outside?.date).toBeUndefined();
  });

  it('is the answer itself without bounds, and atMostAscensions is the upper end alone', () => {
    expect(withinAscensions(found, { min: null, max: null })).toBe(found);
    expect(atMostAscensions(found, 2)).toEqual(withinAscensions(found, { min: null, max: 2 }));
  });
});

describe('the range’s ends', () => {
  it('move the other end along when one passes it', () => {
    expect(setBound({ min: 2, max: 4 }, 'min', 6)).toEqual({ min: 6, max: 6 });
    expect(setBound({ min: 5, max: 8 }, 'max', 3)).toEqual({ min: 3, max: 3 });
    expect(setBound({ min: 2, max: 4 }, 'max', null)).toEqual({ min: 2, max: null });
    expect(setBound({ min: null, max: 4 }, 'min', 3)).toEqual({ min: 3, max: 4 });
  });

  it('read a typed value: blank or below 1 is no bound, above the top is the top', () => {
    expect(boundInput('', 12)).toBeNull();
    expect(boundInput('0', 12)).toBeNull();
    expect(boundInput('abc', 12)).toBeNull();
    expect(boundInput('3', 12)).toBe(3);
    expect(boundInput('3.7', 12)).toBe(3);
    expect(boundInput('40', 12)).toBe(12);
  });

  it('say the range in words', () => {
    expect(boundsText({ min: 3, max: 5 })).toBe('3 to 5');
    expect(boundsText({ min: 4, max: 4 })).toBe('exactly 4');
    expect(boundsText({ min: 3, max: null })).toBe('at least 3');
    expect(boundsText({ min: null, max: 5 })).toBe('at most 5');
    expect(boundsText({ min: null, max: null })).toBe('');
  });

  it('shift past the player’s own first ascension (an end below 1 is no lower bound)', () => {
    expect(boundsAfter({ min: 3, max: 5 }, 1)).toEqual({ min: 2, max: 4 });
    expect(boundsAfter({ min: 1, max: 1 }, 1)).toEqual({ min: null, max: 0 });
    expect(boundsAfter({ min: 2, max: null }, 0)).toEqual({ min: 2, max: null });
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
    expect(readFilters()).toEqual({ inHours: false, maxAscensions: null, minAscensions: null });
    expect(() => writeFilters({ inHours: true, maxAscensions: 3, minAscensions: null })).not.toThrow();
  });

  it('come back as written, and ignore a bad number', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    writeFilters({ inHours: true, maxAscensions: 4, minAscensions: 2 });
    expect(readFilters()).toEqual({ inHours: true, maxAscensions: 4, minAscensions: 2 });
    store.set('aap-instant-filters', '{"inHours":"yes","maxAscensions":2.5,"minAscensions":0}');
    expect(readFilters()).toEqual({ inHours: false, maxAscensions: null, minAscensions: null });
  });

  it('read an older single "At most N" as no lower bound and that upper one (24 Oct 2026)', () => {
    const store = new Map<string, string>([['aap-instant-filters', '{"inHours":true,"maxAscensions":5}']]);
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    expect(readFilters()).toEqual({ inHours: true, maxAscensions: 5, minAscensions: null });
    // A lower end above the upper one (only by hand): the upper one wins.
    store.set('aap-instant-filters', '{"inHours":false,"maxAscensions":3,"minAscensions":6}');
    expect(readFilters()).toEqual({ inHours: false, maxAscensions: 3, minAscensions: 3 });
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
    expect(describeBoxGain(g, 2, false)).toBe('this route 4 h sooner');
    // The box shows another count: nothing (UX review 26 Oct 2026, item 3).
    expect(describeBoxGain(g, 3, false)).toBe('');
  });

  it('By a date: a higher TE, or the same TE with more to spare', () => {
    const before = base([null, r(1, 10_000, 200), r(2, 20_000, 210)]);
    const after = base([null, r(1, 12_000, 201), r(2, 20_000 - 36_000, 210)]);
    const g = polishGains(before, after, true);
    expect(g.map(x => [x.k, x.te])).toEqual([
      [1, 1],
      [2, 0],
    ]);
    expect(describeBoxGain(g, 1, true)).toBe('this route +1 TE');
    expect(describeBoxGain(g, 2, true)).toBe('this route 10 h more to spare');
    expect(describeBoxGain(g, 8, true)).toBe('');
    expect(describeBoxGain(null as unknown as [], 2, true)).toBe('');
  });
});
