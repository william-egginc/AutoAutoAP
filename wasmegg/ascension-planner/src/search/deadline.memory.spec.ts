/**
 * What the deadline search keeps in memory (the 9 Oct crash): each set's best route instead of every
 * route that made the date, and every priced route as a compact entry instead of its whole result.
 * The answer must be the same, route for route.
 */
import { describe, expect, it } from 'vitest';
import type { ChainResult } from './types';
import { rank, runDeadlineSearch, type DeadlineSpec } from './deadline';

const DAY = 86400;
const START = 1_790_000_000;

function legSeconds(a: number, b: number): number {
  return DAY + (b - a) * DAY * (150 / (a + 20));
}
function priceChain(currentTE: number, chain: number[]): ChainResult {
  let te = currentTE;
  let seconds = 0;
  for (const c of chain) {
    seconds += legSeconds(te, c);
    te = c;
  }
  return { chain: [...chain], seconds, legs: [] };
}
function spec(over: Partial<DeadlineSpec> = {}): DeadlineSpec {
  return {
    currentTE: 100,
    planStart: START,
    deadline: START + 90 * DAY,
    minStops: 1,
    maxStops: 4,
    lastLo: 110,
    lastHi: 200,
    step: 5,
    ...over,
  };
}

/** The ranking the search gave when it kept every route that made the date. */
function rankEveryRoute(s: DeadlineSpec, priced: ChainResult[]) {
  const routes = priced.flatMap(r => {
    const reachAt = s.planStart + r.seconds;
    return reachAt <= s.deadline
      ? [{ chain: r.chain, reachAt, ascendAt: reachAt, spare: s.deadline - reachAt, legs: r.legs }]
      : [];
  });
  return rank(routes);
}

describe('what the deadline search keeps', () => {
  const cases: [string, Partial<DeadlineSpec>][] = [
    ['a grid search', {}],
    ['a grid search with a schedule', { ascendAt: (t: number) => Math.ceil(t / (6 * 3600)) * 6 * 3600 }],
    [
      'a space',
      {
        bandSets: [
          [[120, 125, 130, 135, 140]],
          [
            [115, 125],
            [140, 150, 160],
          ],
          [],
        ],
      },
    ],
  ];
  for (const [name, over] of cases) {
    it(`ranks ${name} exactly as when it kept every route, from each set's best alone`, async () => {
      const s = spec(over);
      const priced: ChainResult[] = [];
      const out = await runDeadlineSearch(s, {
        evaluate: async chains => {
          const r = chains.map(c => priceChain(s.currentTE, c));
          priced.push(...r);
          return r;
        },
      });
      if (!s.ascendAt) {
        const expected = rankEveryRoute(s, priced);
        expect(out.routes.map(r => `${r.chain.join(' ')}|${r.spare}`)).toEqual(
          expected.map(r => `${r.chain.join(' ')}|${r.spare}`)
        );
      }
      expect(out.routes.length).toBeGreaterThan(0);
      // Every route priced is in the compact list, once, with its own arrival.
      const unique = new Map(priced.map(r => [r.chain.join(','), r]));
      expect(out.all.size).toBe(unique.size);
      const at = s.ascendAt ?? ((t: number) => t);
      for (let i = 0; i < out.all.size; i++) {
        const r = unique.get(out.all.keys[i])!;
        expect(out.all.reachAt(i)).toBe(s.planStart + r.seconds);
        expect(out.all.ascendAt(i)).toBe(at(s.planStart + r.seconds));
      }
      // The kept routes are exactly the routes the list says make the date, each set's best.
      const makes = new Set<string>();
      for (let i = 0; i < out.all.size; i++) if (out.all.ascendAt(i) <= s.deadline) makes.add(out.all.keys[i]);
      for (const r of out.routes) expect(makes.has(r.chain.join(','))).toBe(true);
      expect(new Set(out.routes.map(r => r.chain.slice(0, -1).join(','))).size).toBe(out.routes.length);
    });
  }

  it('lists a route that could not be priced, with no times, and never keeps it', async () => {
    const s = spec({ bandSets: [[[120, 130]]] });
    const out = await runDeadlineSearch(s, {
      evaluate: async chains => chains.filter(c => c[0] !== 120).map(c => priceChain(s.currentTE, c)),
    });
    const i = out.all.keys.findIndex(k => k.startsWith('120,'));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(out.all.reachAt(i)).toBeNaN();
    expect(out.routes.every(r => r.chain[0] !== 120)).toBe(true);
  });

  it('hands the live list to a progress send', async () => {
    const s = spec({ bandSets: [[[120, 130]]] });
    let live: unknown = null;
    const out = await runDeadlineSearch(s, {
      evaluate: async chains => chains.map(c => priceChain(s.currentTE, c)),
      pricedSoFar: all => (live = all),
    });
    expect(live).toBe(out.all);
  });

  it('keeps one copy of each strategy key and egg name across the routes it keeps', async () => {
    const s = spec({ bandSets: [[[120, 125, 130]]] });
    const out = await runDeadlineSearch(s, {
      evaluate: async chains =>
        chains.map(c => {
          const r = priceChain(s.currentTE, c);
          // Fresh strings each time, as a worker's reply gives.
          const legs = c.map(te => ({
            key: ['2-sale', 'tier13'].join('-'),
            endTE: te,
            endTime: 0,
            durationSeconds: 1,
            maxELR: 0,
            tier13Unlocked: true,
            shifts: [{ at: 1, egg: ['curio', 'sity'].join('') }],
          }));
          return { ...r, legs } as ChainResult;
        }),
    });
    const legs = out.routes.flatMap(r => r.legs);
    expect(legs.length).toBeGreaterThan(1);
    // Interned: the same string object, so identical in every way; and the content is unchanged.
    expect(new Set(legs.map(l => l.key))).toEqual(new Set(['2-sale-tier13']));
    expect(new Set(legs.flatMap(l => l.shifts!.map(x => x.egg)))).toEqual(new Set(['curiosity']));
  });
});
