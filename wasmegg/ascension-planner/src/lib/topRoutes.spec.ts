/** More than the single best (lib/topRoutes.ts): the best few routes and the best per ascension count, both goals. */
import { describe, expect, it } from 'vitest';
import { behindLabel, bestPerCount, compareRoutes, keptForTop, topN, type PricedRoute } from './topRoutes';

const T0 = 1_800_000_000;
const H = 3600;
const r = (chain: number[], hours: number, hasLegs = true): PricedRoute => ({ chain, finish: T0 + hours * H, hasLegs });

describe('topN, Fastest (earliest finish)', () => {
  const routes = [
    r([200, 300, 490], 50),
    r([150, 250, 350, 490], 40),
    r([180, 490], 70),
    r([100, 200, 300, 400, 490], 41.5),
    r([160, 260, 360, 490], 44),
    r([170, 270, 370, 490], 48),
    r([210, 310, 490], 46),
  ];

  it('the best 5, best first, ranked, the best marked, how far behind it', () => {
    const top = topN(routes, 'fastest');
    expect(top.map(t => t.chain.join(' '))).toEqual([
      '150 250 350 490',
      '100 200 300 400 490',
      '160 260 360 490',
      '210 310 490',
      '170 270 370 490',
    ]);
    expect(top.map(t => t.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(top.map(t => t.best)).toEqual([true, false, false, false, false]);
    expect(top.map(t => t.ascensions)).toEqual([4, 5, 4, 3, 4]);
    expect(top[1].behindSeconds).toBe(1.5 * H);
    expect(top.map(t => behindLabel('fastest', t))).toEqual(['best', '+1h 30m', '+4h', '+6h', '+8h']);
    expect(top.every(t => t.behindTE === 0 && t.te === 490)).toBe(true);
  });

  it('ties share a rank and list fewer ascensions first, whatever order they came in', () => {
    const tied = [r([100, 200, 300, 490], 40), r([200, 490], 40), r([150, 300, 490], 45), r([120, 490], 40)];
    for (const order of [tied, [...tied].reverse()]) {
      const top = topN(order, 'fastest');
      expect(top.map(t => t.chain.join(' '))).toEqual(['120 490', '200 490', '100 200 300 490', '150 300 490']);
      expect(top.map(t => t.rank)).toEqual([1, 1, 1, 4]);
      expect(top.filter(t => t.best)).toHaveLength(1);
      expect(behindLabel('fastest', top[1])).toBe('same time');
    }
  });

  it('one route: itself, the best; empty and unusable: nothing', () => {
    expect(topN([r([200, 490], 10)], 'fastest')).toMatchObject([{ rank: 1, best: true, behindSeconds: 0 }]);
    expect(topN([], 'fastest')).toEqual([]);
    expect(topN([{ chain: [], finish: T0, hasLegs: true }, { chain: [490], finish: NaN, hasLegs: true }], 'fastest')).toEqual([]);
    expect(topN(routes, 'fastest', 0)).toEqual([]);
  });

  it('a route past the detail cap (no legs) ranks like any other and says so', () => {
    const top = topN([r([200, 490], 30), r([150, 300, 490], 20, false)], 'fastest');
    expect(top[0]).toMatchObject({ chain: [150, 300, 490], hasLegs: false, best: true });
    expect(top[1].hasLegs).toBe(true);
  });

  it('a route that came twice is listed once, the copy with legs kept', () => {
    const top = topN([r([200, 490], 30, false), r([200, 490], 30, true), r([300, 490], 31)], 'fastest');
    expect(top).toHaveLength(2);
    expect(top[0].hasLegs).toBe(true);
  });
});

describe('topN, Highest TE by a date (highest TE, then earliest)', () => {
  const routes = [
    r([200, 300, 310], 10),
    r([200, 312], 30),
    r([150, 250, 312], 20),
    r([100, 200, 300, 311], 5),
    r([220, 312], 20),
  ];

  it('the highest last stop first, then the earliest; behind in TE or in time', () => {
    const top = topN(routes, 'date');
    expect(top.map(t => t.chain.join(' '))).toEqual(['220 312', '150 250 312', '200 312', '100 200 300 311', '200 300 310']);
    expect(top.map(t => t.rank)).toEqual([1, 1, 3, 4, 5]);
    expect(top.map(t => behindLabel('date', t))).toEqual([
      'best',
      'same TE, same time',
      '+10h later',
      '1 TE lower',
      '2 TE lower',
    ]);
    expect(top[3].behindSeconds).toBe(-15 * H);
    expect(top[4].te).toBe(310);
  });

  it('compareRoutes: a higher TE beats an earlier finish on a date, never on Fastest', () => {
    const lowEarly = r([200, 300], 1);
    const highLate = r([200, 301], 9);
    expect(compareRoutes('date', highLate, lowEarly)).toBeLessThan(0);
    expect(compareRoutes('fastest', lowEarly, highLate)).toBeLessThan(0);
  });
});

describe('bestPerCount', () => {
  it('Fastest: the earliest of each count, fewest ascensions first, the overall best marked', () => {
    const per = bestPerCount(
      [r([200, 300, 490], 50), r([210, 310, 490], 46), r([150, 250, 350, 490], 40), r([180, 490], 70), r([160, 260, 360, 490], 44)],
      'fastest'
    );
    expect(per.map(p => [p.ascensions, p.chain.join(' ')])).toEqual([
      [2, '180 490'],
      [3, '210 310 490'],
      [4, '150 250 350 490'],
    ]);
    expect(per.map(p => p.best)).toEqual([false, false, true]);
    expect(per.map(p => p.rank)).toEqual([3, 2, 1]);
    expect(per[0].behindSeconds).toBe(30 * H);
  });

  it('By a date: the highest TE of each count, then the earliest', () => {
    const per = bestPerCount([r([200, 312], 30), r([220, 312], 20), r([100, 200, 311], 5), r([100, 210, 311], 2)], 'date');
    expect(per.map(p => p.chain.join(' '))).toEqual(['220 312', '100 210 311']);
    expect(per.map(p => p.best)).toEqual([true, false]);
    expect(per[1].behindTE).toBe(1);
  });

  it('a tie across counts shares the rank; the fewer ascensions is the best', () => {
    const per = bestPerCount([r([150, 300, 490], 40), r([200, 490], 40)], 'fastest');
    expect(per.map(p => p.rank)).toEqual([1, 1]);
    expect(per.map(p => p.best)).toEqual([true, false]);
  });

  it('one route, empty, and routes without legs', () => {
    expect(bestPerCount([r([200, 490], 10, false)], 'fastest')).toMatchObject([{ ascensions: 2, best: true, hasLegs: false }]);
    expect(bestPerCount([], 'date')).toEqual([]);
  });
});

describe('keptForTop', () => {
  it('keeps just what the list and the chart need, so a store can hold it instead of every route', () => {
    const many: PricedRoute[] = [];
    for (let i = 0; i < 200; i++) many.push(r([100 + i, 200 + i, 490], 50 + i));
    many.push(r([150, 490], 90));
    many.push(r([100, 200, 300, 490], 60));
    const kept = keptForTop(many, 'fastest');
    expect(kept.length).toBe(7);
    expect(topN(kept, 'fastest')).toEqual(topN(many, 'fastest'));
    expect(bestPerCount(kept, 'fastest')).toEqual(bestPerCount(many, 'fastest'));
  });
});
