import { describe, expect, it } from 'vitest';
import { canonicalDelivered, pacificHourOfWeek, type BuildParams } from './precomputedLeg';
import {
  findRoutes,
  polishFound,
  priceChain,
  type BuildLookup,
  type PolishOptions,
  type PricedPrefix,
} from './routeFinder';
import { getNextSaleEnd } from '@/lib/events';

// Monday 4 Jan 2027, 9:00 am PST.
const START = Date.parse('2027-01-04T17:00:00Z') / 1000;
const FROM = 100;
const FINAL = 130;

/** A synthetic table: one 1-sale build per TE and hour, its purchases taking longer at higher TE
 *  and on some hours, the sale it waits for the next weekly one. */
const table: BuildLookup = (te, hour) => {
  if (te < FROM || te > FINAL) return null;
  const cellStart = START + ((hour - pacificHourOfWeek(START) + 168) % 168) * 3600;
  const b: BuildParams = {
    sales: 1,
    tier13: false,
    waitStart: 3600 * (2 + (te % 7) + (hour % 5)),
    saleEnd: getNextSaleEnd(cellStart) - cellStart,
    peakELR: 2e12 * (1 + (te - FROM) / 5),
    delivered: canonicalDelivered(te),
  };
  return [b];
};

const o: PolishOptions = { startTE: FROM, start: START };

describe('priceChain and polishFound (the instant answer’s polish)', () => {
  it('prices each route the finder found exactly as the finder did', async () => {
    const found = await findRoutes({ table, startTE: FROM, start: START, final: FINAL, maxAscensions: 4 });
    const routes = found.byAscensions.filter(r => r);
    expect(routes.length).toBeGreaterThan(0);
    for (const r of routes) {
      const again = priceChain(table, o, r!.chain)!;
      expect(again.end).toBe(r!.end);
      expect(again.legs.map(l => l.endTE)).toEqual(r!.legs.map(l => l.endTE));
    }
  });

  it('is null when a stop is not above the TE reached by then', () => {
    expect(priceChain(table, o, [110, 105, FINAL])).toBeNull();
    expect(priceChain(table, o, [FROM, FINAL])).toBeNull();
  });

  it('never makes a route slower, and keeps each count and the final stop', async () => {
    const found = await findRoutes({ table, startTE: FROM, start: START, final: FINAL, maxAscensions: 4 });
    const polished = polishFound(table, o, JSON.parse(JSON.stringify(found)));
    found.byAscensions.forEach((r, k) => {
      const p = polished.byAscensions[k];
      if (!r) return expect(p).toBeNull();
      expect(p!.end).toBeLessThanOrEqual(r.end);
      expect(p!.chain).toHaveLength(r.chain.length);
      expect(p!.chain[p!.chain.length - 1]).toBe(r.chain[r.chain.length - 1]);
      expect(p!.legs[p!.legs.length - 1].endTE).toBeGreaterThanOrEqual(FINAL);
    });
    expect(polished.best!.end).toBe(Math.min(...polished.byAscensions.filter(r => r).map(r => r!.end)));
  });

  it('finds a better neighbour of a poor route', () => {
    // On this table 118 then 130 ends 315.2 h in, 116 308.8 h, 115 (the finder's) 305.7 h.
    const poor = priceChain(table, o, [118, FINAL])!;
    const found = { best: poor, byAscensions: [null, null, poor], byDate: null, byDateByAscensions: [] };
    const p = polishFound(table, o, found);
    expect(p.byAscensions[2]!.chain).toEqual([115, FINAL]);
    expect(p.best).toEqual(p.byAscensions[2]);
  });

  it('with a deadline keeps each count in time and at the same TE or higher', async () => {
    const found = await findRoutes({ table, startTE: FROM, start: START, final: FINAL, maxAscensions: 4 });
    const deadline = found.best!.end + 86_400 * 3;
    const dated = await findRoutes({ table, startTE: FROM, start: START, final: FINAL, maxAscensions: 4, deadline });
    const p = polishFound(table, { ...o, deadline }, JSON.parse(JSON.stringify(dated)));
    const lastTE = (r: { legs: { endTE: number }[] }) => r.legs[r.legs.length - 1].endTE;
    dated.byDateByAscensions.forEach((r, k) => {
      if (!r) return;
      const q = p.byDateByAscensions[k]!;
      expect(q.end).toBeLessThanOrEqual(deadline);
      expect(lastTE(q)).toBeGreaterThanOrEqual(lastTE(r));
    });
  });

  it('prices the same with a memo of prefixes as without', () => {
    const memo = new Map<string, PricedPrefix | null>();
    for (const c of [
      [110, 120, FINAL],
      [110, 121, FINAL],
      [111, 121, FINAL],
      [110, 120, FINAL],
      [125, 120, FINAL],
    ])
      expect(priceChain(table, o, c, memo)).toEqual(priceChain(table, o, c));
  });

  it('the stronger polish (wide, candidates, every pair) is never slower than the plain one', async () => {
    const found = await findRoutes({ table, startTE: FROM, start: START, final: FINAL, maxAscensions: 4 });
    const plain = polishFound(table, o, JSON.parse(JSON.stringify(found)));
    for (const extra of [{ wide: 8 }, { wide: 8, candidates: 3 }, { wide: 6, candidates: 6, wideAll: true }]) {
      const strong = polishFound(table, { ...o, ...extra }, JSON.parse(JSON.stringify(found)));
      strong.byAscensions.forEach((r, k) => {
        if (!r) return expect(plain.byAscensions[k]).toBeNull();
        expect(r.end).toBeLessThanOrEqual(plain.byAscensions[k]!.end);
        expect(priceChain(table, o, r.chain)!.end).toBe(r.end);
      });
    }
  });

  it('the wide step reaches a stop eight TE off in one move', () => {
    // From 123 the plain polish has nowhere better within two (121-125 all wait for a later sale).
    const far = priceChain(table, o, [123, FINAL])!;
    const found = { best: far, byAscensions: [null, null, far], byDate: null, byDateByAscensions: [] };
    expect(polishFound(table, o, found).byAscensions[2]!.chain).toEqual([123, FINAL]);
    expect(polishFound(table, { ...o, wide: 8 }, found).byAscensions[2]!.chain).toEqual([115, FINAL]);
  });
});
