import { describe, expect, it } from 'vitest';
import type { PricedChain } from '@/search/types';
import {
  bestByCount,
  compareChains,
  countsIn,
  csvHref,
  filterPlans,
  matchesTerms,
  pageList,
  parseTeFilter,
  rankPlans,
  selectPlans,
  sortPlans,
  type PlanSort,
  type TeTerm,
} from './runPlans';

function priced(chain: number[], days: number): PricedChain {
  return { chain, days, prestiges: chain.length, lastCheckpoint: chain[chain.length - 2] };
}

const RANK: PlanSort = { by: 'rank', dir: 'asc' };
const terms = (text: string): TeTerm[] => {
  const parsed = parseTeFilter(text);
  if ('error' in parsed) throw new Error(parsed.error);
  return parsed.terms;
};

/** A small mixed table, deliberately out of rank order. */
const TABLE = [
  priced([230, 280, 490], 610),
  priced([220, 490], 700),
  priced([230, 260, 297, 490], 600),
  priced([231, 279, 490], 605.001),
  priced([225, 490], 690),
  priced([230, 261, 297, 490], 600.002),
];

/** Every 4-ascension chain in a box: 250 plans with distinct days. */
function box(): PricedChain[] {
  const out: PricedChain[] = [];
  let n = 0;
  for (let a = 200; a < 210; a++)
    for (let b = 250; b < 255; b++)
      for (let c = 280; c < 285; c++) out.push(priced([a, b, c, 490], 800 + ((n++ * 7919) % 250)));
  return out;
}

describe('rankPlans', () => {
  it('ranks fastest first, with days behind the best', () => {
    const r = rankPlans(TABLE);
    expect(r.map(p => p.rank)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.map(p => p.chain.join(' '))).toEqual([
      '230 260 297 490',
      '230 261 297 490',
      '231 279 490',
      '230 280 490',
      '225 490',
      '220 490',
    ]);
    expect(r[0].behind).toBe(0);
    expect(r[1].behind).toBeCloseTo(0.002);
    expect(r.map(p => p.ascensions)).toEqual([4, 4, 3, 3, 2, 2]);
  });

  it('keeps the file order for equally fast plans', () => {
    const r = rankPlans([priced([2, 9], 5), priced([1, 9], 5), priced([3, 9], 4)]);
    expect(r.map(p => p.chain[0])).toEqual([3, 2, 1]);
  });

  it('gives every plan its place in checkpoint order', () => {
    const r = rankPlans(TABLE);
    const byChain = [...r].sort((a, b) => a.chainOrder - b.chainOrder).map(p => p.chain.join(' '));
    expect(byChain).toEqual(['220 490', '225 490', '230 260 297 490', '230 261 297 490', '230 280 490', '231 279 490']);
  });

  it('is empty for an empty table', () => {
    expect(rankPlans([])).toEqual([]);
  });
});

describe('compareChains', () => {
  it('orders checkpoint by checkpoint, a prefix first', () => {
    expect(compareChains([230, 260], [230, 261])).toBeLessThan(0);
    expect(compareChains([231], [230, 999])).toBeGreaterThan(0);
    expect(compareChains([230, 260], [230, 260, 490])).toBeLessThan(0);
    expect(compareChains([1, 2], [1, 2])).toBe(0);
  });
});

describe('parseTeFilter', () => {
  it('reads a TE, a range in any spelling, and several of them', () => {
    expect(parseTeFilter('')).toEqual({ terms: [] });
    expect(parseTeFilter('  280 ')).toEqual({ terms: [{ lo: 280, hi: 280 }] });
    expect(parseTeFilter('275-285')).toEqual({ terms: [{ lo: 275, hi: 285 }] });
    expect(parseTeFilter('275 – 285')).toEqual({ terms: [{ lo: 275, hi: 285 }] });
    expect(parseTeFilter('285 to 275')).toEqual({ terms: [{ lo: 275, hi: 285 }] });
    expect(parseTeFilter('230, 275-285')).toEqual({
      terms: [
        { lo: 230, hi: 230 },
        { lo: 275, hi: 285 },
      ],
    });
  });

  it('refuses what it cannot read, and says what to type', () => {
    const bad = parseTeFilter('abc');
    expect('error' in bad && bad.error).toMatch(/275-285/);
    expect('error' in parseTeFilter('280-')).toBe(true);
    expect('error' in parseTeFilter('2.5')).toBe(true);
  });
});

describe('matchesTerms / filterPlans', () => {
  it('matches a checkpoint, never the target', () => {
    expect(matchesTerms([230, 280, 490], terms('280'))).toBe(true);
    expect(matchesTerms([230, 280, 490], terms('490'))).toBe(false);
    expect(matchesTerms([230, 280, 490], terms('275-285'))).toBe(true);
    expect(matchesTerms([230, 280, 490], terms('281-285'))).toBe(false);
    // Every term must hold, each in some checkpoint.
    expect(matchesTerms([230, 280, 490], terms('230 280'))).toBe(true);
    expect(matchesTerms([230, 280, 490], terms('230 290'))).toBe(false);
  });

  it('filters by count and checkpoints, keeping rank order', () => {
    const r = rankPlans(TABLE);
    expect(filterPlans(r, 'all', [])).toBe(r);
    expect(filterPlans(r, 3, []).map(p => p.rank)).toEqual([3, 4]);
    expect(filterPlans(r, 'all', terms('297')).map(p => p.rank)).toEqual([1, 2]);
    expect(filterPlans(r, 'all', terms('279-281')).map(p => p.rank)).toEqual([3, 4]);
    expect(filterPlans(r, 3, terms('230')).map(p => p.rank)).toEqual([4]);
    expect(filterPlans(r, 5, [])).toEqual([]);
  });

  it('lists the counts in a table', () => {
    expect(countsIn(rankPlans(TABLE))).toEqual([2, 3, 4]);
  });
});

describe('sortPlans', () => {
  it('sorts by rank or by chain, either way', () => {
    const r = rankPlans(TABLE);
    expect(sortPlans(r, { by: 'rank', dir: 'desc' }).map(p => p.rank)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(sortPlans(r, { by: 'chain', dir: 'asc' }).map(p => p.chain[0])).toEqual([220, 225, 230, 230, 230, 231]);
    expect(sortPlans(r, { by: 'chain', dir: 'desc' })[0].chain).toEqual([231, 279, 490]);
    // A copy: the ranked list is not reordered under the page.
    expect(r[0].rank).toBe(1);
  });
});

describe('selectPlans', () => {
  const plans = rankPlans(box());

  it('shows the top 10 by default', () => {
    const p = selectPlans(plans, { count: 'all', terms: [], sort: RANK, limit: 10, page: 0 });
    expect(p.rows.map(r => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(p).toMatchObject({ matched: 250, listed: 10, page: 0, pages: 1, from: 1, to: 10 });
  });

  it('arranges the top N in the order picked, rather than taking the first N of that order', () => {
    const p = selectPlans(plans, { count: 'all', terms: [], sort: { by: 'chain', dir: 'asc' }, limit: 25, page: 0 });
    expect(p.rows).toHaveLength(25);
    expect(new Set(p.rows.map(r => r.rank))).toEqual(new Set(Array.from({ length: 25 }, (_, i) => i + 1)));
    for (let i = 1; i < p.rows.length; i++) expect(compareChains(p.rows[i - 1].chain, p.rows[i].chain)).toBeLessThan(0);
  });

  it('pages All 100 at a time and clamps the page', () => {
    const first = selectPlans(plans, { count: 'all', terms: [], sort: RANK, limit: 'all', page: 0 });
    expect(first).toMatchObject({ listed: 250, pages: 3, from: 1, to: 100 });
    expect(first.rows).toHaveLength(100);
    const last = selectPlans(plans, { count: 'all', terms: [], sort: RANK, limit: 'all', page: 2 });
    expect(last).toMatchObject({ page: 2, from: 201, to: 250 });
    expect(last.rows[0].rank).toBe(201);
    expect(selectPlans(plans, { count: 'all', terms: [], sort: RANK, limit: 'all', page: 99 }).page).toBe(2);
    expect(selectPlans(plans, { count: 'all', terms: [], sort: RANK, limit: 'all', page: -3 }).page).toBe(0);
    // Sorted by chain, All runs through the whole table in checkpoint order.
    const chain = selectPlans(plans, {
      count: 'all',
      terms: [],
      sort: { by: 'chain', dir: 'asc' },
      limit: 'all',
      page: 1,
    });
    expect(chain.rows[0].chain).toEqual([204, 250, 280, 490]);
  });

  it('pages the filtered list, and says when nothing matches', () => {
    const p = selectPlans(plans, { count: 'all', terms: terms('203'), sort: RANK, limit: 'all', page: 0 });
    expect(p).toMatchObject({ matched: 25, listed: 25, pages: 1 });
    expect(p.rows.every(r => r.chain[0] === 203)).toBe(true);
    const none = selectPlans(plans, { count: 'all', terms: terms('999'), sort: RANK, limit: 10, page: 0 });
    expect(none).toMatchObject({ rows: [], matched: 0, listed: 0, pages: 1, page: 0, from: 0, to: 0 });
  });

  it('counts a top N short of N when fewer match', () => {
    const p = selectPlans(plans, { count: 'all', terms: terms('203 250'), sort: RANK, limit: 10, page: 0 });
    expect(p).toMatchObject({ matched: 5, listed: 5, from: 1, to: 5 });
  });

  it('keeps a 60,000-plan table cheap to page', () => {
    const big: PricedChain[] = [];
    for (let i = 0; i < 60_000; i++)
      big.push(
        priced(
          [150 + (i % 40), 200 + (((i / 40) | 0) % 40), 250 + ((i / 1600) | 0), 490],
          500 + ((i * 7919) % 60_000) / 100
        )
      );
    const ranked = rankPlans(big);
    const started = performance.now();
    const p = selectPlans(ranked, {
      count: 'all',
      terms: terms('160 210-215'),
      sort: { by: 'chain', dir: 'desc' },
      limit: 'all',
      page: 3,
    });
    expect(performance.now() - started).toBeLessThan(500);
    expect(p.rows.length).toBeLessThanOrEqual(100);
  });
});

describe('pageList', () => {
  it('shows the ends and the pages around the current one, with gaps', () => {
    expect(pageList(0, 0)).toEqual([]);
    expect(pageList(0, 1)).toEqual([0]);
    expect(pageList(0, 5)).toEqual([0, 1, 2, 3, 4]);
    expect(pageList(0, 600)).toEqual([0, 1, 2, null, 599]);
    expect(pageList(300, 600)).toEqual([0, null, 298, 299, 300, 301, 302, null, 599]);
    expect(pageList(599, 600)).toEqual([0, null, 597, 598, 599]);
  });

  it('shows a one-page gap as that page', () => {
    // 0 … 2 3 4 would hide only page 1.
    expect(pageList(4, 10)).toEqual([0, 1, 2, 3, 4, 5, 6, null, 9]);
  });
});

describe('bestByCount', () => {
  it('reads the run’s proof when it has one', () => {
    const proof = {
      byAscensions: [
        { ascensions: 4, priced: 2600, chain: [155, 195, 230, 300], days: 432.6 },
        { ascensions: 2, priced: 28, chain: [215, 300], days: 489.5 },
      ],
    };
    expect(bestByCount(rankPlans(TABLE), proof).map(b => [b.ascensions, b.priced])).toEqual([
      [2, 28],
      [4, 2600],
    ]);
  });

  it('works it out from the table otherwise, and is empty for one count', () => {
    const r = rankPlans(TABLE);
    expect(bestByCount(r, { byAscensions: [] })).toEqual([
      { ascensions: 2, chain: [225, 490], days: 690, priced: 2, partial: false },
      { ascensions: 3, chain: [231, 279, 490], days: 605.001, priced: 2, partial: false },
      { ascensions: 4, chain: [230, 260, 297, 490], days: 600, priced: 2, partial: false },
    ]);
    expect(bestByCount(rankPlans(box()))).toEqual([]);
  });

  it('says the counts are partial when the page read only part of the table, but not from a proof', () => {
    const r = rankPlans(TABLE);
    expect(bestByCount(r, null, 40_000).every(b => b.partial)).toBe(true);
    const proof = {
      byAscensions: [
        { ascensions: 4, priced: 2600, chain: [155, 195, 230, 300], days: 432.6 },
        { ascensions: 2, priced: 28, chain: [215, 300], days: 489.5 },
      ],
    };
    // The proof counted every plan, whatever the parse dropped.
    expect(bestByCount(r, proof, 40_000).some(b => b.partial)).toBe(false);
  });
});

describe('csvHref', () => {
  it('is the collector’s /csv link, like the Leaderboard’s', () => {
    expect(csvHref('https://c.example.dev', 'ab12-cd')).toBe('https://c.example.dev/csv?id=ab12-cd');
    expect(csvHref('https://c.example.dev/', 'a b')).toBe('https://c.example.dev/csv?id=a%20b');
  });
});
