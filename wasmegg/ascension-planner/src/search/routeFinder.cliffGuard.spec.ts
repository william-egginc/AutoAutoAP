import { describe, expect, it } from 'vitest';
import { canonicalDelivered, pacificHourOfWeek, type BuildParams } from './precomputedLeg';
import { CLIFF_LAG, CLIFF_TE, expandArrivals, findRoutes, priceChain, priceLeg, type BuildLookup } from './routeFinder';
import { getNextSaleEnd } from 'lib/planners/events';
import { instantPricingOptions } from './instantCompute';

// THE CLIFF GUARD (`TailOptions.cliffGuard`, R10.1; Tables and PC, 21 Nov 2026). A short ascension (up to CLIFF_TE TE)
// is mostly "finish this sale's purchases, then prestige", so its price drops off a cliff when the start passes the
// last hour that still makes this sale: after it, the build waits for next week's. The instant answer's routes run
// about a day early by mid-route (R10 harness, 21 Nov), so a route that reaches such a leg just before the cliff in
// the table reaches it just after in the simulator: bae5's 285->286 was 75 h from the table's start and 165 h from
// the simulator's (notes/short-leg-cliff-2026-11-21.md). With the guard a short leg is also priced from CLIFF_LAG
// later and costs the worse of the two; a longer leg is priced as before.
const TE = 300;
const SALE_END = getNextSaleEnd(Date.UTC(2027, 0, 11) / 1000); // a Saturday 9:00 am PT
const CLIFF = SALE_END - 6 * 3600; // the last start that still makes this sale: Sat 3:00 am PT

/** One build: inside this sale when the cell starts by CLIFF, else next week's; done an hour after its sale ends. */
function build(cellStart: number, te: number): BuildParams {
  const end = cellStart <= CLIFF ? SALE_END : getNextSaleEnd(SALE_END + 60);
  return {
    sales: 1,
    tier13: false,
    waitStart: end - cellStart - 3600,
    saleEnd: end - cellStart,
    peakELR: 1e18,
    delivered: canonicalDelivered(te),
  };
}
const START = CLIFF - 2 * 3600; // Sat 1:00 am PT: this sale, but a day later would not
// The table's week runs from 6 days before the cliff to a day after it (every start below falls inside).
const WEEK_FROM = CLIFF - 144 * 3600;
const table: BuildLookup = (te, hour) => {
  if (te < TE || te > TE + 20) return null;
  const cellStart = WEEK_FROM + ((hour - pacificHourOfWeek(WEEK_FROM) + 168) % 168) * 3600;
  return [build(cellStart, te)];
};
const d = canonicalDelivered(TE);

describe('cliffGuard', () => {
  it('a short ascension just before the cliff costs what it would from a day later', () => {
    const plain = priceLeg(table, TE, START, d, TE + 1)!;
    expect(plain.end).toBeLessThan(SALE_END + 3600);
    const guarded = priceLeg(table, TE, START, d, TE + 1, 1, undefined, { cliffGuard: CLIFF_LAG })!;
    // From a day later it ends next week; less the day, it still ends days after the plain price.
    const later = priceLeg(table, TE, START + CLIFF_LAG, d, TE + 1)!;
    expect(guarded.end).toBe(later.end - CLIFF_LAG);
    expect(guarded.end - plain.end).toBeGreaterThan(4 * 86400);
    expect(guarded.start).toBe(plain.start);
  });

  it('a start well before the cliff (a day later still makes the sale) is not moved', () => {
    const early = START - 2 * 86400;
    const plain = priceLeg(table, TE, early, d, TE + 1)!;
    expect(priceLeg(table, TE, early, d, TE + 1, 1, undefined, { cliffGuard: CLIFF_LAG })!.end).toBe(plain.end);
  });

  it('only short ascensions are guarded', () => {
    const long = TE + CLIFF_TE + 1;
    const plain = priceLeg(table, TE, START, d, long)!;
    expect(priceLeg(table, TE, START, d, long, 1, undefined, { cliffGuard: CLIFF_LAG })!.end).toBe(plain.end);
    const short = TE + CLIFF_TE;
    expect(priceLeg(table, TE, START, d, short, 1, undefined, { cliffGuard: CLIFF_LAG })!.end).toBeGreaterThan(
      priceLeg(table, TE, START, d, short)!.end
    );
  });

  it('the finder prices its arrivals the same way, and off (the default) nothing changes', async () => {
    const item = { id: 0, te: TE, time: START, delivered: d, stop: TE };
    const settings = { top: TE + 1, deliveryScale: 1, onTheHour: true, keep: 6 };
    const plain = expandArrivals(table, settings, [item])[0].leg.end;
    const guarded = expandArrivals(table, { ...settings, cliffGuard: CLIFF_LAG }, [item])[0].leg.end;
    expect(guarded).toBe(priceLeg(table, TE, START, d, TE + 1, 1, undefined, { cliffGuard: CLIFF_LAG })!.end);
    expect(plain).toBe(priceLeg(table, TE, START, d, TE + 1)!.end);
    expect(guarded).toBeGreaterThan(plain + 4 * 86400);
    const off = await findRoutes({ table, startTE: TE, start: START, final: TE + 1, maxAscensions: 1 });
    const on = await findRoutes({
      table,
      startTE: TE,
      start: START,
      final: TE + 1,
      maxAscensions: 1,
      cliffGuard: CLIFF_LAG,
    });
    expect(off.best!.end).toBe(plain);
    expect(on.best!.end).toBe(guarded);
    // The polish's pricing (priceChain) agrees with the finder's.
    expect(priceChain(table, { startTE: TE, start: START, cliffGuard: CLIFF_LAG }, [TE + 1])!.end).toBe(guarded);
  });

  it("the instant answer's pricing turns it on at CLIFF_LAG; an explicit setting wins", () => {
    const base = { te: TE, start: START, firstLegs: [], scale: 1, hours: null };
    expect(instantPricingOptions({ ...base, tail: {} }).cliffGuard).toBe(CLIFF_LAG);
    expect(instantPricingOptions({ ...base, tail: { cliffGuard: 0 } }).cliffGuard).toBe(0);
  });
});
