import { describe, expect, it } from 'vitest';
import { canonicalDelivered, pacificHourOfWeek, type BuildParams } from './precomputedLeg';
import {
  CLIFF_JUMP,
  CLIFF_LAG,
  CLIFF_TE,
  cellJumps,
  expandArrivals,
  findRoutes,
  priceChain,
  priceLeg,
  type BuildLookup,
} from './routeFinder';
import { getNextSaleEnd } from 'lib/planners/events';
import { instantPricingOptions } from './instantCompute';

// THE CLIFF GUARD BY THE CELL (`TailOptions.cliffJump`, R10.1; Tables and PC, 21 Nov 2026). The guard by length
// (routeFinder.cliffGuard.spec.ts) prices every ascension of up to CLIFF_TE TE twice, and misses a longer one at the
// same kind of cliff (bae5 evenings took a 13-TE leg into one: -486 h). With `cliffJump` the guard looks at the table
// cell `cliffGuard` later first, a lookup and no pricing: only when a build there ends its sale more than `cliffJump`
// later than this cell's (it waits for next week's sale) is the ascension priced again from later, at any length.
const TE = 300;
const SALE_END = getNextSaleEnd(Date.UTC(2027, 0, 11) / 1000); // a Saturday 9:00 am PT
const CLIFF = SALE_END - 6 * 3600; // the last start that still makes this sale: Sat 3:00 am PT
const START = CLIFF - 2 * 3600;
const WEEK_FROM = CLIFF - 144 * 3600;
const cellStartOf = (hour: number) => WEEK_FROM + ((hour - pacificHourOfWeek(WEEK_FROM) + 168) % 168) * 3600;

/** A cliff table (as routeFinder.cliffGuard.spec.ts): this sale up to CLIFF, next week's after. */
const cliff: BuildLookup = (te, hour) => {
  if (te < TE || te > TE + 30) return null;
  const cellStart = cellStartOf(hour);
  const end = cellStart <= CLIFF ? SALE_END : getNextSaleEnd(SALE_END + 60);
  return [
    {
      sales: 1,
      tier13: false,
      waitStart: end - cellStart - 3600,
      saleEnd: end - cellStart,
      peakELR: 1e18,
      delivered: canonicalDelivered(te),
    },
  ];
};
/** No cliff: every cell makes this sale, but a day later the farm lays slower (the price rises, the sale does not jump). */
const slower: BuildLookup = (te, hour) => {
  if (te < TE || te > TE + 30) return null;
  const cellStart = cellStartOf(hour);
  const peak = cellStart <= CLIFF ? 1e18 : 1e9;
  const b: BuildParams = {
    sales: 1,
    tier13: false,
    waitStart: SALE_END - cellStart - 3600,
    saleEnd: SALE_END - cellStart,
    peakELR: peak,
    delivered: canonicalDelivered(te),
  };
  return [b];
};
const d = canonicalDelivered(TE);
const on = { cliffGuard: CLIFF_LAG, cliffJump: CLIFF_JUMP };

describe('cliffJump', () => {
  it('cellJumps: a build that waits for next week a day later jumps; the same sale end does not', () => {
    expect(cellJumps(cliff, TE, START, CLIFF_LAG, CLIFF_JUMP)).toBe(true);
    expect(cellJumps(cliff, TE, START - 2 * 86400, CLIFF_LAG, CLIFF_JUMP)).toBe(false);
    expect(cellJumps(slower, TE, START, CLIFF_LAG, CLIFF_JUMP)).toBe(false);
  });

  it('guards a longer ascension at a cliff too (the length rule does not)', () => {
    const long = TE + CLIFF_TE + 8;
    const plain = priceLeg(cliff, TE, START, d, long)!;
    expect(priceLeg(cliff, TE, START, d, long, 1, undefined, { cliffGuard: CLIFF_LAG })!.end).toBe(plain.end);
    const later = priceLeg(cliff, TE, START + CLIFF_LAG, d, long)!;
    expect(priceLeg(cliff, TE, START, d, long, 1, undefined, on)!.end).toBe(Math.max(plain.end, later.end - CLIFF_LAG));
    expect(priceLeg(cliff, TE, START, d, long, 1, undefined, on)!.end).toBeGreaterThan(plain.end + 4 * 86400);
  });

  it('leaves a short ascension alone when the cell does not jump (the length rule reprices it)', () => {
    const plain = priceLeg(slower, TE, START, d, TE + 1)!;
    expect(priceLeg(slower, TE, START, d, TE + 1, 1, undefined, { cliffGuard: CLIFF_LAG })!.end).toBeGreaterThan(
      plain.end
    );
    expect(priceLeg(slower, TE, START, d, TE + 1, 1, undefined, on)!.end).toBe(plain.end);
  });

  it('the finder and priceChain price it as priceLeg does', async () => {
    const target = TE + CLIFF_TE + 8;
    const item = { id: 0, te: TE, time: START, delivered: d, stop: TE };
    const settings = { top: target, deliveryScale: 1, onTheHour: true, keep: 6, ...on };
    const want = priceLeg(cliff, TE, START, d, target, 1, undefined, on)!.end;
    // The farm is fast here, so the first stop above already arrives at the target: the arrival there.
    const leg = expandArrivals(cliff, settings, [item]).find(c => c.te === target)!.leg;
    expect(leg.end).toBe(want);
    const found = await findRoutes({ table: cliff, startTE: TE, start: START, final: target, maxAscensions: 1, ...on });
    expect(found.best!.end).toBe(want);
    expect(priceChain(cliff, { startTE: TE, start: START, ...on }, [target])!.end).toBe(want);
  });

  it("the instant answer's pricing uses the cell rule", () => {
    const o = instantPricingOptions({ te: TE, start: START, firstLegs: [], scale: 1, hours: null, tail: {} });
    expect(o.cliffGuard).toBe(CLIFF_LAG);
    expect(o.cliffJump).toBe(CLIFF_JUMP);
  });
});
