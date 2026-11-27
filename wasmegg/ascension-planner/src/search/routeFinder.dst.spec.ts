/**
 * A CELL ACROSS A DAYLIGHT-SAVING CHANGE (code review 22 Nov 2026, T1.7). A table cell is keyed by the Pacific hour of
 * the week and was built in a week with no clock change, so its builds' sale ends are that week's distance from the
 * hour. A 2-sale build started Thu 29 Oct 2026 9:00 AM PDT waits for the sale ending Sat 7 Nov 9:00 AM PST: an hour
 * longer than in the table's week (the clocks went back on Sun 1 Nov). It was priced an hour early; `dstLateBy`
 * moves the sale's end by the change, in the finder's sweep and in the shifts read back from it.
 */
import { describe, expect, it } from 'vitest';
import { canonicalDelivered, dstLateBy, pacificHourOfWeek, type BuildParams } from './precomputedLeg';
import { priceLeg, type BuildLookup } from './routeFinder';
import { getNextSaleEnd } from 'lib/planners/events';

const TE = 300;
const THU = 3 * 24 + 9; // Thursday 9:00 AM Pacific, hour of the week
/** The table's week: Thu 9 AM to the Saturday after next, 9 AM, with no clock change in between. */
const TWO_SALES = 9 * 86400;
const table: BuildLookup = (te, hour) => {
  if (te !== TE || hour !== THU) return null;
  const b: BuildParams = {
    sales: 2,
    tier13: false,
    waitStart: 3600,
    saleEnd: TWO_SALES,
    peakELR: 1e18,
    delivered: canonicalDelivered(TE),
  };
  return [b];
};
const d = canonicalDelivered(TE);
const secondSaleEnd = (t: number) => getNextSaleEnd(getNextSaleEnd(t) + 60);

describe('a 2-sale build across the November clock change', () => {
  it('Thu 29 Oct 2026 9:00 AM PT ends at the real second sale end (Sat 7 Nov 9:00 AM PST), not an hour early', () => {
    const start = Date.parse('2026-10-29T16:00:00Z') / 1000; // 9:00 AM PDT
    expect(pacificHourOfWeek(start)).toBe(THU);
    expect(secondSaleEnd(start) - start).toBe(TWO_SALES + 3600);
    const leg = priceLeg(table, TE, start, d, TE + 1)!;
    expect(Math.abs(leg.end - secondSaleEnd(start))).toBeLessThan(60);
  });

  it('a week with no change is as before', () => {
    const start = Date.parse('2026-10-15T16:00:00Z') / 1000; // Thu 15 Oct 9:00 AM PDT
    expect(secondSaleEnd(start) - start).toBe(TWO_SALES);
    expect(dstLateBy(TWO_SALES, start, 0)).toBe(0);
    const leg = priceLeg(table, TE, start, d, TE + 1)!;
    expect(Math.abs(leg.end - secondSaleEnd(start))).toBeLessThan(60);
  });

  it('March goes the other way: an hour sooner', () => {
    const start = Date.parse('2027-03-11T17:00:00Z') / 1000; // Thu 11 Mar 2027 9:00 AM PST, sale ends Sat 20 Mar PDT
    expect(secondSaleEnd(start) - start).toBe(TWO_SALES - 3600);
    expect(dstLateBy(TWO_SALES, start, 0)).toBe(3600);
    const leg = priceLeg(table, TE, start, d, TE + 1)!;
    expect(Math.abs(leg.end - secondSaleEnd(start))).toBeLessThan(60);
  });
});
