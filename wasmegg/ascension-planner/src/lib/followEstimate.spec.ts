/**
 * A followed route's estimate on the instant answer's data (lib/followEstimate.ts): what the instant answer priced its
 * routes with is kept in its snapshot, read back, the source picked for the route, and the priced route laid out as
 * Right now's plan. The pricing itself is the route finder's own (`priceChain`): priced from the kept inputs, the
 * instant answer's own route comes out exactly as the finder found it, held hours and no-prestige days included.
 */
import { describe, expect, it } from 'vitest';
import { canonicalDelivered, pacificHourOfWeek, type BuildParams } from '@/search/precomputedLeg';
import { findRoutes, priceChain, type BuildLookup, type FirstLeg, type PolishOptions } from '@/search/routeFinder';
import type { Availability } from '@/search/availability';
import { getNextSaleEnd } from '@/lib/events';
import {
  ESTIMATE_WORDS,
  PRICING_MAX_BYTES,
  estimateKey,
  pickPricing,
  planFromEstimate,
  readPricing,
  snapPricing,
  type PricingSource,
} from './followEstimate';

// Monday 4 Jan 2027, 9:00 am PST.
const START = Date.parse('2027-01-04T17:00:00Z') / 1000;
const FROM = 100;
const FINAL = 130;
const H = 3600;

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
/** The player's own first ascension to each stop (as the instant answer's first-legs request gives them). */
const firstLegs: FirstLeg[] = Array.from({ length: FINAL - FROM }, (_, i) => {
  const to = FROM + 1 + i;
  return { to, endTE: to, end: START + (10 + 6 * i) * H, delivered: canonicalDelivered(to), label: 'continue' };
});
const hours: Availability = { days: [], fromHour: 9, toHour: 17, timezone: 'America/Los_Angeles' };
const noPrestige = [{ from: START + 3 * 86400, to: START + 4 * 86400 }];

describe('followEstimate: the instant answer’s pricing inputs, kept and read back', () => {
  it('keeps a plain copy, and none when there are no first ascensions or they are too big', () => {
    const options: PolishOptions = { startTE: FROM, start: START, firstLegs, hours, holdShifts: true, noPrestige, siloSeconds: 3 * 86400 };
    const p = snapPricing(options, FINAL)!;
    expect(p).toMatchObject({ v: 1, final: FINAL, options: { startTE: FROM, start: START, hours, noPrestige } });
    expect(p.options).not.toBe(options);
    expect(readPricing(JSON.parse(JSON.stringify(p)))).toEqual(p);
    expect(snapPricing({ startTE: FROM, start: START }, FINAL)).toBeNull();
    expect(snapPricing(null, FINAL)).toBeNull();
    const huge = Array.from({ length: 3000 }, (_, i) => ({ ...firstLegs[0], to: FROM + 1 + i, label: 'x'.repeat(80) }));
    expect(JSON.stringify(huge).length).toBeGreaterThan(PRICING_MAX_BYTES);
    expect(snapPricing({ startTE: FROM, start: START, firstLegs: huge }, FINAL)).toBeNull();
  });

  it('reads back nothing from an older snapshot or a broken field', () => {
    expect(readPricing(undefined)).toBeNull();
    expect(readPricing(null)).toBeNull();
    expect(readPricing({ v: 2, final: FINAL, options: { startTE: FROM, start: START, firstLegs } })).toBeNull();
    expect(readPricing({ v: 1, final: FINAL, options: { startTE: FROM, start: START, firstLegs: [] } })).toBeNull();
    expect(readPricing({ v: 1, final: 0, options: { startTE: FROM, start: START, firstLegs } })).toBeNull();
  });

  it('priced from the kept inputs, the instant answer’s own route is exactly its row: held hours and no-prestige days applied', async () => {
    const tail = { holdShifts: true, noPrestige, siloSeconds: 3 * 86400 };
    const found = await findRoutes({ table, startTE: FROM, start: START, final: FINAL, maxAscensions: 4, firstLegs, hours, ...tail });
    const kept = readPricing(JSON.parse(JSON.stringify(snapPricing({ startTE: FROM, start: START, firstLegs, hours, ...tail }, FINAL))))!;
    const routes = found.byAscensions.filter(r => r);
    expect(routes.length).toBeGreaterThan(1);
    for (const r of routes) {
      const again = priceChain(table, kept.options, r!.chain)!;
      expect(again.end).toBe(r!.end);
      expect(again.legs.map(l => [l.start, l.end, l.endTE])).toEqual(r!.legs.map(l => [l.start, l.end, l.endTE]));
    }
    // A no-prestige day on a prestige of the route moves it, and the kept inputs carry that day.
    const r = routes[routes.length - 1]!;
    const at = r.legs[1].start;
    const day = [{ from: at - H, to: at + 12 * H }];
    const held = readPricing(JSON.parse(JSON.stringify(snapPricing({ startTE: FROM, start: START, firstLegs, hours, holdShifts: true, noPrestige: day, siloSeconds: 3 * 86400 }, FINAL))))!;
    expect(priceChain(table, held.options, r.chain)!.legs[1].start).toBeGreaterThanOrEqual(at + 12 * H);
  });
});

const source = (over: Partial<PricingSource> & { startTE?: number; final?: number } = {}): PricingSource => ({
  url: 'precompute/table-v2.bin',
  pricing: { v: 1, final: over.final ?? 490, options: { startTE: over.startTE ?? 194, start: START, firstLegs } },
  tableTo: 490,
  ownGoal: false,
  at: 1000,
  meta: null,
  ...over,
});

describe('followEstimate: which snapshot prices the route', () => {
  it("the selected goal's own first, else the newest of this save's others", () => {
    const own = source({ ownGoal: true, at: 1 });
    const newer = source({ at: 5 });
    expect(pickPricing([newer, own], [225, 300], 194)).toEqual({ source: own, chain: [225, 300] });
    expect(pickPricing([source({ at: 2 }), newer], [225, 300], 194)).toEqual({ source: newer, chain: [225, 300] });
  });

  it("never another save's (its start TE is not the save's), and nothing without a source", () => {
    expect(pickPricing([source({ startTE: 193 })], [225, 300], 194)).toBeNull();
    expect(pickPricing([], [225, 300], 194)).toBeNull();
    expect(pickPricing([source()], [], 194)).toBeNull();
  });

  it('a route the instant answer\'s data does not cover is `beyond`, never priced', () => {
    // The first stop past the record's own first ascensions (its target).
    expect(pickPricing([source({ final: 220 })], [225, 310], 194)).toEqual({ beyond: true, chain: [225, 310] });
    // An ascension starting past the table's rows.
    expect(pickPricing([source({ tableTo: 300 })], [225, 310, 400], 194)).toEqual({ beyond: true, chain: [225, 310, 400] });
    // One that covers it wins over one that doesn't.
    const ok = source({ at: 0 });
    expect(pickPricing([source({ final: 220, ownGoal: true }), ok], [225, 310], 194)).toEqual({ source: ok, chain: [225, 310] });
  });

  it("covers a route to 490 on a table whose rows end at 489, and a Fastest route from a date answer's record (26 Oct 2026)", () => {
    // Jordan's Fastest to 490 TE route on a table of start TEs 55-489: the last stop is reached, never started from.
    const table489 = source({ tableTo: 489 });
    expect(pickPricing([table489], [226, 277, 317, 490], 194)).toEqual({ source: table489, chain: [226, 277, 317, 490] });
    // A record whose own target is lower (a date's answer to 300): its first ascensions reach 226, the rest is the table.
    const dateRecord = source({ final: 300, tableTo: 489 });
    expect(pickPricing([dateRecord], [226, 277, 317, 490], 194)).toEqual({ source: dateRecord, chain: [226, 277, 317, 490] });
    expect(pickPricing([table489], [226, 277, 491], 194)).toEqual({ beyond: true, chain: [226, 277, 491] });
  });

  it('keys by save, snapshot and route: a new save or a new instant answer is another estimate', () => {
    const s = source();
    const k = estimateKey(100, s, [225, 300]);
    expect(estimateKey(101, s, [225, 300])).not.toBe(k);
    expect(estimateKey(100, { ...s, at: 2000 }, [225, 300])).not.toBe(k);
    expect(estimateKey(100, s, [226, 300])).not.toBe(k);
    expect(estimateKey(100, s, [225, 300])).toBe(k);
  });
});

describe("followEstimate: Right now's plan", () => {
  it('rounded (not exact), marked estimated, from the plan start it was priced from; By a date with its spare', () => {
    const route = priceChain(table, { startTE: FROM, start: START, firstLegs }, [110, FINAL])!;
    const deadline = route.end + 10 * H;
    const p = planFromEstimate(route, { goal: 'date', deadline }, source(), 12345);
    expect(p).toMatchObject({ goal: 'date', deadline, chain: [110, FINAL], end: route.end, exact: false, estimated: true, legs: null, planStart: START, calculatedAt: 12345 });
    expect(p.spareHours).toBeCloseTo(10);
    expect(p.tableLegs).toHaveLength(2);
    expect(p.from).toBeUndefined();
    const f = planFromEstimate(route, { goal: 'fastest', deadline: null }, source(), 1);
    expect(f).toMatchObject({ deadline: null, spareHours: null, instantTE: null });
  });

  it('says where the times come from in player words', () => {
    expect(ESTIMATE_WORDS).toBe("estimated from the instant answer's data (times rounded to the hour)");
    expect(ESTIMATE_WORDS).not.toMatch(/table|chain|checkpoint|Light/);
  });
});
