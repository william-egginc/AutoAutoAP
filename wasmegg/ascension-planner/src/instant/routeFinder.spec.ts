import { describe, expect, it } from 'vitest';
import { canonicalDelivered, pacificHourOfWeek, type BuildParams } from './precomputedLeg';
import { findRoutes, firstLegOptions, nextHour, priceLeg, startInSale, type BuildLookup } from './routeFinder';
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

describe('the first ascension: continue or a fresh start (firstLegOptions)', () => {
  const start = SALE_END + 2 * 86400;
  // Continuing: no build to make, the same delivery, so it only has the eggs to lay.
  const quick: BuildParams = { ...build(0, 0) };
  // Continuing a farm that has a month of purchases left: slower than a fresh start's week.
  const slow: BuildParams = { ...build(30 * 86400, 0) };
  const legs = (cont: BuildParams | null) =>
    firstLegOptions({ table, startTE: TE, start, final: TE + 1, delivered: canonicalDelivered(TE), cont });

  it('takes whichever is faster, continuing or a fresh start', () => {
    expect(legs(quick).map(l => l.label)).toEqual(['continue']);
    expect(legs(slow).map(l => l.label)).toEqual(['1-sale']);
    expect(legs(null).map(l => l.label)).toEqual(['1-sale']);
  });

  it('continue starts at once; a fresh start on the next whole hour', async () => {
    // Continue lays from the plan start; the fresh start's purchases wait for the next hour first.
    expect(legs(quick)[0].end).toBeLessThan(legs(null)[0].end);
    const found = await findRoutes({ table, startTE: TE, start, final: TE + 1, maxAscensions: 1, firstLegs: legs(quick) });
    expect(found.best?.legs[0]).toMatchObject({ label: 'continue', start });
  });

  it('never a continue longer than half a year', () => {
    const forever: BuildParams = { ...build(400 * 86400, 0) };
    expect(legs(forever).map(l => l.label)).toEqual(['1-sale']);
  });
});

describe('a superseded search (pause)', () => {
  const o = { table, startTE: TE, start: LAST_HOUR + 180, final: TE + 3, maxAscensions: 3 };

  it('awaits the pause between numbers of ascensions, not before the first', async () => {
    const at: number[] = [];
    let k = 0;
    await findRoutes({ ...o, onProgress: d => (k = d), pause: async () => void at.push(k) });
    expect(at[0]).toBe(1);
    expect(at.length).toBeGreaterThan(0);
  });

  it('stops mid-search when the pause throws', async () => {
    let expanded = 0;
    const stats = { expanded: 0, sweeps: 0, cached: 0 };
    const run = findRoutes({
      ...o,
      stats,
      pause: async () => {
        expanded = stats.expanded;
        throw new Error('superseded');
      },
    });
    await expect(run).rejects.toThrow('superseded');
    // Nothing expanded after the pause.
    expect(stats.expanded).toBe(expanded);
  });
});
