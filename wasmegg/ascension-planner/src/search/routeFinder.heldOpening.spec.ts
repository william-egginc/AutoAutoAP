import { describe, expect, it } from 'vitest';
import { canonicalDelivered, pacificHourOfWeek, type BuildParams } from './precomputedLeg';
import {
  expandArrivals,
  findRoutes,
  firstLegOptions,
  heldOpeningOf,
  heldOpeningStart,
  nextHour,
  openingFits,
  polishFound,
  priceChain,
  priceLeg,
  type BuildLookup,
  type ExpandSettings,
  type PolishOptions,
} from './routeFinder';
import { holdUntilOf, isAvailable, type Availability } from './availability';
import { openingSpan } from './openingSpan';
import { getNextSaleEnd } from '@/lib/events';

// THE HELD OPENING (routeFinder.ts `heldOpeningStart`): with held shifts, a fresh ascension whose opening (the shifts
// before C3's end, which the table's held replay never holds) could reach past the end of the player's hours waits
// for the first whole hour from which it cannot. The same synthetic table as routeFinder.hours.spec.ts.
const START = Date.parse('2027-01-04T17:00:00Z') / 1000; // Monday 4 Jan 2027, 9:00 am PST
const FROM = 100;
const FINAL = 130;
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
const days7to11: Availability = { days: [], fromHour: 7, toHour: 23, timezone: 'America/Los_Angeles' };
const hold = holdUntilOf(days7to11);
const at = (iso: string) => Date.parse(iso) / 1000;

describe('openingSpan (search/openingSpan.ts): the measured curves, rounded up, plus a margin', () => {
  const MONDAY = 1799654400; // Mon 11 Jan 2027 00:00 PST, the table's reference week
  const hours = (te: number, t: number) => openingSpan(te, t) / 3600;
  it('away from the sale: QUIET (main, TE 260: 4.85 h measured)', () => {
    expect(hours(260, MONDAY)).toBeCloseTo(5.0, 6);
  });
  it('inside the sale with it lasting past the opening: INSIDE (TE 196: 3.20 h measured, 1.35 h away from it)', () => {
    const fridayEvening = MONDAY + 4 * 86400 + 18 * 3600; // Fri 6:00 pm PST, the sale until Sat 9:00 am
    expect(hours(196, fridayEvening)).toBeCloseTo(3.4, 6);
    expect(hours(196, MONDAY)).toBeCloseTo(1.5, 6);
  });
  it('the sale starting within it: the longest of the three (TE 196 starting an hour in: 4.26 h)', () => {
    const fridayEight = MONDAY + 4 * 86400 + 8 * 3600; // Fri 8:00 am PST, an hour before the sale
    expect(hours(196, fridayEight)).toBeCloseTo(4.4, 6);
  });
  it('above TE 360: 1.2 h', () => {
    expect(hours(400, MONDAY)).toBeCloseTo(1.2, 6);
  });
});

describe('heldOpeningStart', () => {
  it('keeps a start whose opening fits inside the hours', () => {
    const nine = at('2027-01-05T17:00:00Z'); // Tue 9:00 am PST
    expect(openingFits(nine, 200, hold)).toBe(true);
    expect(heldOpeningStart(nine, 200, hold)).toEqual({ start: nine, fits: true });
  });

  it('moves one whose opening reaches past the end of the hours to the next morning', () => {
    // Tue 10:00 pm PST: an hour before the hours end, less than any opening's span here.
    const ten = at('2027-01-06T06:00:00Z');
    const te = 200;
    expect(openingSpan(te, ten)).toBeGreaterThan(3600);
    expect(openingFits(ten, te, hold)).toBe(false);
    const h = heldOpeningStart(ten, te, hold);
    expect(h.fits).toBe(true);
    expect(h.start).toBe(at('2027-01-06T15:00:00Z')); // Wed 7:00 am PST
    expect(openingFits(h.start, te, hold)).toBe(true);
  });

  it('gives the start back, not fitting, when the hours are shorter than the opening', () => {
    const oneHour: Availability = { days: [], fromHour: 9, toHour: 10, timezone: 'America/Los_Angeles' };
    const h1 = holdUntilOf(oneHour);
    const nine = at('2027-01-05T17:00:00Z');
    expect(openingSpan(200, nine)).toBeGreaterThan(3600);
    expect(heldOpeningStart(nine, 200, h1)).toEqual({ start: nine, fits: false });
  });

  it('never needs a wait with every hour available', () => {
    const always: Availability = { days: [], fromHour: 0, toHour: 0, timezone: 'America/Los_Angeles' };
    const t = at('2027-01-06T06:00:00Z');
    expect(heldOpeningStart(t, 200, holdUntilOf(always))).toEqual({ start: t, fits: true });
  });
});

describe('the finder with held shifts', () => {
  const find = (extra: object = {}) =>
    findRoutes({
      table,
      startTE: FROM,
      start: START,
      final: FINAL,
      maxAscensions: 5,
      hours: days7to11,
      holdShifts: true,
      ...extra,
    });

  it('an arrival late in the evening prestiges the next morning, noted', () => {
    const evening = at('2027-01-06T05:30:00Z'); // Tue 9:30 pm PST: on the hour inside the hours is 10:00 pm
    const item = { id: 0, te: 110, time: evening, delivered: canonicalDelivered(110), stop: 110 };
    const settings: ExpandSettings = {
      top: FINAL,
      deliveryScale: 1,
      onTheHour: true,
      keep: 6,
      hours: days7to11,
      holdShifts: true,
    };
    const held = expandArrivals(table, settings, [item]);
    expect(held.length).toBeGreaterThan(0);
    for (const c of held) {
      expect(c.leg.start).toBe(at('2027-01-06T15:00:00Z')); // Wed 7:00 am PST
      expect(c.leg.heldOpening).toBe('morning');
      expect(c.leg.wanted).toBe(at('2027-01-06T06:00:00Z'));
    }
    const before = expandArrivals(table, { ...settings, heldOpening: false }, [item]);
    for (const c of before) {
      expect(c.leg.start).toBe(at('2027-01-06T06:00:00Z'));
      expect(c.leg.heldOpening).toBeUndefined();
    }
    // priceLeg, as the polish prices a leg, agrees.
    const p = priceLeg(table, 110, evening, canonicalDelivered(110), 115, 1, days7to11, { holdShifts: true })!;
    expect([p.start, p.heldOpening, p.wanted]).toEqual([at('2027-01-06T15:00:00Z'), 'morning', at('2027-01-06T06:00:00Z')]);
  });

  it('starts every fresh ascension where its opening fits', async () => {
    const held = await find();
    for (const r of held.byAscensions) {
      if (!r) continue;
      r.legs.forEach((l, i) => {
        if (i === 0) return;
        expect(isAvailable(l.start, days7to11)).toBe(true);
        if (l.heldOpening === 'uncertain') return;
        expect(openingFits(l.start, l.from, hold)).toBe(true);
        if (l.heldOpening === 'morning') {
          expect(l.wanted).toBeLessThan(l.start);
          expect(openingFits(l.wanted!, l.from, hold)).toBe(false);
          expect(l.start).toBe(nextHour(l.start));
        }
      });
      if (r.legs.some(l => l.heldOpening === 'morning')) expect(heldOpeningOf(r)).toBe('morning');
    }
  });

  it('heldOpening: false prices every start as before (no notes)', async () => {
    const before = await find({ heldOpening: false });
    for (const r of before.byAscensions) if (r) expect(heldOpeningOf(r)).toBeNull();
    const plain = await find({ heldOpening: false, holdShifts: false });
    // This table carries no version 2 extras, so held shifts change nothing else.
    expect(before.byAscensions.map(r => r?.end)).toEqual(plain.byAscensions.map(r => r?.end));
  });

  it('priceChain and the polish price a route as the finder did, notes included', async () => {
    const held = await find();
    const o: PolishOptions = { startTE: FROM, start: START, hours: days7to11, holdShifts: true };
    for (const r of held.byAscensions) {
      if (!r) continue;
      const again = priceChain(table, o, r.chain)!;
      expect(again.end).toBe(r.end);
      expect(again.legs.map(l => [l.start, l.heldOpening ?? null])).toEqual(
        r.legs.map(l => [l.start, l.heldOpening ?? null])
      );
    }
    const p = polishFound(table, o, JSON.parse(JSON.stringify(held)));
    for (const r of p.byAscensions)
      r?.legs.forEach((l, i) => {
        if (i && l.heldOpening !== 'uncertain') expect(openingFits(l.start, l.from, hold)).toBe(true);
      });
  });

  it('a fresh first ascension waits too, and says so', () => {
    // Plan start Tue 9:30 pm PST: the next whole hour, 10:00 pm, is inside the hours, but the opening would run past
    // 11:00 pm.
    const late = at('2027-01-06T05:30:00Z'); // Tue 9:30 pm PST
    const legs = firstLegOptions({
      table,
      startTE: FROM,
      start: late,
      final: FROM + 5,
      delivered: canonicalDelivered(FROM),
      cont: null,
      firstAscension: 'fresh',
      pinSeconds: 0,
      maxContinueSeconds: 0,
      hours: days7to11,
      holdShifts: true,
    });
    expect(legs.length).toBeGreaterThan(0);
    for (const l of legs) {
      expect(l.heldOpening).toBe('morning');
      expect(l.wanted).toBe(at('2027-01-06T06:00:00Z'));
    }
  });
});
