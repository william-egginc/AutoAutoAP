import { describe, expect, it } from 'vitest';
import { canonicalDelivered, pacificHourOfWeek, type BuildParams } from './precomputedLeg';
import { findRoutes, firstLegOptions, nextHour, priceLeg, startInSale, type BuildLookup } from './routeFinder';
import type { FirstAscension } from './firstAscension';
import { getNextSaleEnd, isResearchSaleActive } from '@/lib/events';

const TE = 300;
const WEEK = 7 * 86400;
// A Saturday 09:00 PT, when a weekly sale ends (any week clear of daylight-saving changes).
const SALE_END = getNextSaleEnd(Date.UTC(2027, 0, 11) / 1000);
const LAST_HOUR = SALE_END - 3600;

/** One 1-sale build: purchases done `waitStart` s after its start, sale over `saleEnd` s after it. */
function build(waitStart: number, saleEnd: number): BuildParams {
  return { sales: 1, tier13: false, waitStart, saleEnd, peakELR: 1e15, delivered: canonicalDelivered(TE) };
}

/**
 * A table where every hour's build takes half an hour of purchases and then waits for the next sale
 * to end: inside the sale's last hour that is minutes away, from the next hour it is a week.
 */
const table: BuildLookup = (te, hour) => {
  if (te !== TE) return null;
  const cellStart = LAST_HOUR + ((hour - pacificHourOfWeek(LAST_HOUR) + 168) % 168) * 3600;
  const end = getNextSaleEnd(cellStart);
  return [build(1800, end - cellStart)];
};

describe('the sale’s last hour (startInSale)', () => {
  it('prices a start 3 minutes into the last hour from that hour’s cell, a week sooner', () => {
    const t = LAST_HOUR + 180;
    expect(isResearchSaleActive(t)).toBe(true);
    const late = startInSale(table, TE, t);
    expect(late?.lateBy).toBe(180);
    const leg = priceLeg(table, TE, t, canonicalDelivered(TE), TE + 1)!;
    expect(leg.start).toBe(t);
    // The next hour's cell waits for next week's sale: about a week later.
    const onHour = nextHour(t) + (getNextSaleEnd(nextHour(t)) - nextHour(t));
    expect(onHour - leg.end).toBeGreaterThan(WEEK - 2 * 3600);
  });

  it('does not when the purchases would end after the sale', () => {
    // 50 minutes in: 30 minutes of purchases end after 09:00.
    expect(startInSale(table, TE, LAST_HOUR + 3000)).toBeNull();
    expect(priceLeg(table, TE, LAST_HOUR + 3000, canonicalDelivered(TE), TE + 1)!.start).toBe(SALE_END);
  });

  it('does nothing outside the sale, or on the hour', () => {
    expect(startInSale(table, TE, SALE_END + 2 * 86400 + 600)).toBeNull();
    expect(startInSale(table, TE, LAST_HOUR)).toBeNull();
  });

  it('lets a route take it, for the first ascension and for later ones', async () => {
    const { best } = await findRoutes({ table, startTE: TE, start: LAST_HOUR + 180, final: TE + 1, maxAscensions: 1 });
    expect(best?.legs[0].start).toBe(LAST_HOUR + 180);
    expect(best!.end).toBeLessThan(SALE_END + 3600);
  });
});

describe('the first ascension setting (firstLegOptions)', () => {
  const start = SALE_END + 2 * 86400;
  // Continuing: no build to make, the same delivery, so it only has the eggs to lay.
  const quick: BuildParams = { ...build(0, 0) };
  // Continuing a farm that has a month of purchases left: slower than a fresh start's week.
  const slow: BuildParams = { ...build(30 * 86400, 0) };
  const legs = (cont: BuildParams, firstAscension: FirstAscension) =>
    firstLegOptions({
      table,
      startTE: TE,
      start,
      final: TE + 1,
      delivered: canonicalDelivered(TE),
      cont,
      firstAscension,
      pinSeconds: 1e12,
      maxContinueSeconds: 1e12,
    }).map(l => l.label);

  it('Fastest takes whichever is faster, continuing or a fresh start', () => {
    expect(legs(quick, 'auto')).toEqual(['continue']);
    expect(legs(slow, 'auto')).toEqual(['1-sale']);
  });

  it('Continue Asc. takes continuing inside the pin even when a fresh start is faster', () => {
    expect(legs(quick, 'continue')).toEqual(['continue']);
    expect(legs(slow, 'continue')).toEqual(['continue']);
  });

  it('Prestige Now never continues', () => {
    expect(legs(quick, 'fresh')).toEqual(['1-sale']);
    expect(legs(slow, 'fresh')).toEqual(['1-sale']);
  });
});
