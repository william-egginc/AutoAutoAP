import { describe, expect, it } from 'vitest';
import { canonicalDelivered, pacificHourOfWeek, type BuildParams } from './precomputedLeg';
import {
  expandArrivals,
  findRoutes,
  firstLegOptions,
  nextHour,
  priceLeg,
  startInSale,
  type BuildLookup,
} from './routeFinder';
import { getNextSaleEnd, isResearchSaleActive } from '@/lib/events';

// AT ONCE INSIDE THE SALE (`TailOptions.inSale: 'atOnce'`, the instant answer's since 24 Oct 2026): a fresh ascension
// the player can start at once inside the weekly sale starts at once, priced from this hour's cell moved by the
// minutes for every build (a 2- or 3-sale build too), as the simulator and the searches start it. Default 'exact':
// only the builds that finish inside this sale at once, else the next whole hour.
const TE = 300;
const SALE_END = getNextSaleEnd(Date.UTC(2027, 0, 11) / 1000); // a Saturday 9:00 am PT
const HOUR = SALE_END - 5 * 3600; // Sat 4:00 am PT, inside the sale

/** A 2-sale build: purchases until the next week's sale (`waitStart` past this sale's end), then a quick tail. */
function twoSale(cellStart: number): BuildParams {
  const nextEnd = getNextSaleEnd(getNextSaleEnd(cellStart) + 60);
  return {
    sales: 2,
    tier13: false,
    waitStart: nextEnd - cellStart - 3600,
    saleEnd: nextEnd - cellStart,
    peakELR: 1e15,
    delivered: canonicalDelivered(TE),
  };
}
const table: BuildLookup = (te, hour) => {
  if (te !== TE) return null;
  const cellStart = HOUR + ((hour - pacificHourOfWeek(HOUR) + 168) % 168) * 3600;
  return [twoSale(cellStart)];
};
const t = HOUR + 1200; // 20 minutes into the hour

describe('inSale', () => {
  it('startInSale keeps only the builds that finish inside this sale, or with `all` every build', () => {
    expect(isResearchSaleActive(t)).toBe(true);
    expect(startInSale(table, TE, t)).toBeNull();
    const all = startInSale(table, TE, t, true)!;
    expect(all.lateBy).toBe(1200);
    expect(all.builds.map(b => b.sales)).toEqual([2]);
  });

  it("'exact' (the default) starts a 2-sale build on the next whole hour; 'atOnce' at once", () => {
    const d = canonicalDelivered(TE);
    expect(priceLeg(table, TE, t, d, TE + 1)!.start).toBe(nextHour(t));
    const now = priceLeg(table, TE, t, d, TE + 1, 1, undefined, { inSale: 'atOnce' })!;
    expect(now.start).toBe(t);
  });

  it('the finder and the first ascension do the same', async () => {
    const exact = await findRoutes({ table, startTE: TE, start: t, final: TE + 1, maxAscensions: 1 });
    expect(exact.best!.legs[0].start).toBe(nextHour(t));
    const atOnce = await findRoutes({
      table,
      startTE: TE,
      start: t,
      final: TE + 1,
      maxAscensions: 1,
      inSale: 'atOnce',
    });
    expect(atOnce.best!.legs[0].start).toBe(t);
    const item = { id: 0, te: TE, time: t, delivered: canonicalDelivered(TE), stop: TE };
    const settings = { top: TE + 1, deliveryScale: 1, onTheHour: true, keep: 6 };
    expect(expandArrivals(table, settings, [item])[0].leg.start).toBe(nextHour(t));
    expect(expandArrivals(table, { ...settings, inSale: 'atOnce' }, [item])[0].leg.start).toBe(t);
    const first = (inSale?: 'atOnce') =>
      firstLegOptions({
        table,
        startTE: TE,
        start: t,
        final: TE + 1,
        delivered: canonicalDelivered(TE),
        cont: null,
        firstAscension: 'fresh',
        pinSeconds: 0,
        maxContinueSeconds: 0,
        ...(inSale ? { inSale } : {}),
      })[0];
    // Both wait for next week's sale here, so they end together; at once is taken all the same.
    expect(first('atOnce').end).toBe(first().end);
    expect(first('atOnce').label).toBe('2-sale');
  });
});
