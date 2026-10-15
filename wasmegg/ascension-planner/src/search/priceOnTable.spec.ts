import { describe, expect, it } from 'vitest';
import { canonicalDelivered, type BuildParams } from './precomputedLeg';
import { expandArrivals, findRoutes, firstLegOptions, type BuildLookup } from './routeFinder';
import { priceOnTable, type FirstLegsBase, type TablePricer } from './priceOnTable';

const START = Date.UTC(2027, 0, 12, 12) / 1000;
const build = (te: number, peakELR: number): BuildParams => ({
  sales: 1,
  tier13: false,
  waitStart: 3600,
  saleEnd: 0,
  peakELR,
  delivered: canonicalDelivered(te),
});
/** Two "gear sets": the same builds, one laying twice as fast. */
const tableOf =
  (peakELR: number): BuildLookup =>
  te =>
    te >= 300 && te < 310 ? [build(te, peakELR)] : null;
const tables: Record<string, BuildLookup> = { weak: tableOf(5e15), strong: tableOf(1e16) };

/** A pool that runs the worker's two calls in place, on the table its url names. */
const pool: TablePricer = {
  firstLegs: async ({ url, ...r }) => firstLegOptions({ ...r, table: tables[url] }),
  expand: async (url, items, settings) => expandArrivals(tables[url], settings, items),
};
const legs: FirstLegsBase = {
  startTE: 300,
  start: START,
  final: 310,
  delivered: canonicalDelivered(300),
  cont: null,
  firstAscension: 'fresh',
  pinSeconds: 1e12,
  maxContinueSeconds: 1e12,
};
const o = { legs, final: 310, maxAscensions: 4, atMost: null };

describe('priceOnTable', () => {
  it('is the finder on that table, from the player’s own first ascension', async () => {
    const got = await priceOnTable(pool, 'weak', o);
    const firstLegs = firstLegOptions({ ...legs, table: tables.weak, deliveryScale: 1 });
    const direct = await findRoutes({ table: tables.weak, startTE: 300, start: START, final: 310, maxAscensions: 4, firstLegs });
    expect(got.route?.chain).toEqual(direct.best?.chain);
    expect(got.end).toBe(direct.best?.end);
    expect(got.te).toBe(310);
  });

  it('stronger gear gets there sooner', async () => {
    const weak = await priceOnTable(pool, 'weak', o);
    const strong = await priceOnTable(pool, 'strong', o);
    expect(strong.end!).toBeLessThan(weak.end!);
  });

  it('By a date: the highest TE by then', async () => {
    const r = await priceOnTable(pool, 'strong', { ...o, deadline: START + 10 * 365 * 86400 });
    expect(r.te).toBe(310);
    expect(r.route).not.toBeNull();
  });

  it('"At most N ascensions" applies', async () => {
    const r = await priceOnTable(pool, 'weak', { ...o, atMost: 1 });
    expect(r.route?.legs.length).toBe(1);
  });
});
