import { describe, expect, it } from 'vitest';
import { canonicalDelivered, pacificHourOfWeek, type BuildParams } from './precomputedLeg';
import {
  expandArrivals,
  findRoutes,
  nextHour,
  polishFound,
  priceLeg,
  prestigesInHours,
  type BuildLookup,
  type ExpandSettings,
  type PolishOptions,
} from './routeFinder';
import { isAvailable, nextAvailable, type Availability } from './availability';
import { getNextSaleEnd } from '@/lib/events';

// "Works inside my hours". Since 14 Oct (Allan's report: a 4-ascension route ~20 days slower with
// hours 7 am-11 pm) each prestige whose start falls outside the player's hours WAITS for the next
// whole hour inside them, and the wait is priced, as Check exactly does (chain.ts handoff
// `nextAvailable`). Before, such an arrival was dropped; since the finder keeps only the arrivals
// nothing beats, one out-of-hours arrival could kill a whole stop, and the count fell back to much
// worse stops (on the maxed table, TE 206 from Thu 1:12 pm PT: +24.4 d dropping, +0.1 d waiting).
// `holdForHours: false` keeps the old filter. The same synthetic table as routeFinder.polish.spec.ts.
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
const find = (extra: object = {}) =>
  findRoutes({ table, startTE: FROM, start: START, final: FINAL, maxAscensions: 5, ...extra });
const days9to5: Availability = { days: [], fromHour: 9, toHour: 17, timezone: 'America/Los_Angeles' };
const days7to11: Availability = { days: [], fromHour: 7, toHour: 23, timezone: 'America/Los_Angeles' };
const settings: ExpandSettings = { top: FINAL, deliveryScale: 1, onTheHour: true, keep: 6 };

describe('prestigesInHours', () => {
  it('checks the start of every ascension after the first', () => {
    const at = (h: number) => Date.parse(`2027-01-05T${String(h).padStart(2, '0')}:00:00Z`) / 1000;
    // 18:00 UTC = 10 am PST (in), 03:00 UTC = 7 pm PST the day before (out).
    expect(prestigesInHours({ legs: [{ start: at(3) }, { start: at(18) }] }, days9to5)).toBe(true);
    expect(prestigesInHours({ legs: [{ start: at(18) }, { start: at(3) }] }, days9to5)).toBe(false);
  });
});

describe('the hold rule', () => {
  // Tue 5 Jan 2027, 2:30 am PST: outside 9-5; the next hour inside is 9:00 am.
  const night = Date.parse('2027-01-05T10:30:00Z') / 1000;
  const nine = Date.parse('2027-01-05T17:00:00Z') / 1000;
  const item = { id: 0, te: 110, time: night, delivered: canonicalDelivered(110), stop: 110 };

  it('a fresh ascension after a prestige outside the hours starts on the next hour inside them', () => {
    const held = expandArrivals(table, { ...settings, hours: days9to5 }, [item]);
    // The same arrival, ready at 9 am, with no hours: the very same legs.
    const atNine = expandArrivals(table, settings, [{ ...item, time: nine }]);
    expect(held.length).toBeGreaterThan(0);
    for (const c of held) expect(c.leg.start).toBe(nine);
    expect(held.map(c => [c.te, c.time, c.leg.to])).toEqual(atNine.map(c => [c.te, c.time, c.leg.to]));
  });

  it('inside the hours it changes nothing', () => {
    const noon = { ...item, time: Date.parse('2027-01-05T20:10:00Z') / 1000 };
    expect(expandArrivals(table, { ...settings, hours: days9to5 }, [noon])).toEqual(
      expandArrivals(table, settings, [noon])
    );
  });

  it('never holds the start of the route (the player is ascending now)', () => {
    const { stop: _, ...first } = item;
    expect(expandArrivals(table, { ...settings, hours: days9to5 }, [first])).toEqual(
      expandArrivals(table, settings, [first])
    );
  });

  it('priceLeg (the polish) holds the same way', () => {
    const p = priceLeg(table, 110, night, canonicalDelivered(110), 120, 1, days9to5)!;
    const q = priceLeg(table, 110, nine, canonicalDelivered(110), 120)!;
    expect(p.start).toBe(nextHour(nextAvailable(nextHour(night), days9to5)));
    expect(p).toEqual(q);
  });
});

describe('findRoutes with hours', () => {
  it('gives each count a route inside the hours, never sooner than without them', async () => {
    const free = await find();
    const kept = await find({ hours: days9to5 });
    let some = 0;
    kept.byAscensions.forEach((r, k) => {
      if (!r) return;
      some++;
      expect(prestigesInHours(r, days9to5)).toBe(true);
      expect(r.end).toBeGreaterThanOrEqual(free.byAscensions[k]!.end);
    });
    expect(some).toBeGreaterThan(1);
    expect(kept.best).toBe(kept.byAscensions.reduce((a, r) => (r && (!a || r.end < a!.end) ? r : a), null as never));
  });

  it('answers every count the free search answers: waiting loses hours, not the route', async () => {
    // One hour on Wednesdays: nearly every prestige has to wait.
    const narrow: Availability = { days: [3], fromHour: 9, toHour: 10, timezone: 'America/Los_Angeles' };
    for (const hours of [narrow, days9to5]) {
      const free = await find();
      const kept = await find({ hours });
      expect(kept.outOfHours).toEqual([]);
      free.byAscensions.forEach((r, k) => {
        if (!r) return;
        expect(kept.byAscensions[k]).not.toBeNull();
        expect(prestigesInHours(kept.byAscensions[k]!, hours)).toBe(true);
      });
    }
    // One ascension needs no prestige on the way.
    expect((await find({ hours: narrow })).byAscensions[1]?.end).toBe((await find()).byAscensions[1]?.end);
  });

  it('regression: the count dropping lost, waiting keeps at the same time', async () => {
    // From Mon 1:00 pm PST with hours 7 am-11 pm: the fastest 3-ascension route prestiges at night.
    // Dropping, no 3-ascension route is left; waiting finds one that ends as soon as the free one.
    const start = START + 4 * 3600;
    const run = (extra: object) =>
      findRoutes({ table, startTE: FROM, start, final: FINAL, maxAscensions: 5, ...extra });
    const free = (await run({})).byAscensions[3]!;
    const dropped = await run({ hours: days7to11, holdForHours: false });
    const held = (await run({ hours: days7to11 })).byAscensions[3]!;
    expect(prestigesInHours(free, days7to11)).toBe(false);
    expect(dropped.byAscensions[3]).toBeNull();
    expect(dropped.outOfHours).toContain(3);
    expect(prestigesInHours(held, days7to11)).toBe(true);
    expect(held.end).toBe(free.end);
  });

  it('waiting is never slower than dropping', async () => {
    for (const h of [0, 30, 75, 98, 124, 139]) {
      const start = START + h * 3600;
      const run = (extra: object) =>
        findRoutes({ table, startTE: FROM, start, final: FINAL, maxAscensions: 5, hours: days9to5, ...extra });
      const dropped = await run({ holdForHours: false });
      const held = await run({});
      dropped.byAscensions.forEach((r, k) => {
        if (r) expect(held.byAscensions[k]!.end).toBeLessThanOrEqual(r.end + 60);
      });
    }
  });

  it('drops nothing when every hour of every day is available', async () => {
    const always: Availability = { days: [], fromHour: 0, toHour: 0, timezone: 'America/Los_Angeles' };
    const free = await find();
    const kept = await find({ hours: always });
    expect(kept.byAscensions).toEqual(free.byAscensions);
    expect(kept.outOfHours).toEqual([]);
  });

  it('By a date: each count the highest TE in time with its prestiges inside the hours', async () => {
    const free = await find();
    const deadline = free.best!.end + 86_400 * 2;
    const kept = await find({ hours: days9to5, deadline });
    for (const r of kept.byDateByAscensions) {
      if (!r) continue;
      expect(r.end).toBeLessThanOrEqual(deadline);
      expect(prestigesInHours(r, days9to5)).toBe(true);
    }
    expect(kept.byDate).not.toBeNull();
  });

  it('leaves the answer alone without hours (no outOfHours)', async () => {
    expect((await find()).outOfHours).toBeUndefined();
  });

  it('the polish keeps every prestige inside the hours', async () => {
    const o: PolishOptions = { startTE: FROM, start: START, hours: days9to5 };
    const kept = await find({ hours: days9to5 });
    const p = polishFound(table, o, JSON.parse(JSON.stringify(kept)));
    p.byAscensions.forEach((r, k) => {
      if (!r) return;
      expect(r.legs.slice(1).every(l => isAvailable(l.start, days9to5))).toBe(true);
      expect(r.end).toBeLessThanOrEqual(kept.byAscensions[k]!.end);
    });
    expect(p.outOfHours).toEqual(kept.outOfHours);
  });
});

describe('holdForHours: false (the old filter)', () => {
  it('drops arrivals outside the hours and names the counts left without a route', async () => {
    const narrow: Availability = { days: [3], fromHour: 9, toHour: 10, timezone: 'America/Los_Angeles' };
    const free = await find();
    const kept = await find({ hours: narrow, holdForHours: false });
    expect(kept.outOfHours!.length).toBeGreaterThan(0);
    kept.byAscensions.forEach((r, k) => {
      if (k === 0) return;
      if (r) {
        expect(prestigesInHours(r, narrow)).toBe(true);
        expect(kept.outOfHours).not.toContain(k);
      } else if (free.byAscensions[k]) expect(kept.outOfHours).toContain(k);
    });
    // Every prestige of a kept route is when the free search would start it (no waiting): on the
    // next whole hour, or at once inside the sale.
    const day = await find({ hours: days9to5, holdForHours: false });
    for (const r of day.byAscensions)
      if (r)
        for (const [i, l] of r.legs.entries())
          if (i) expect([r.legs[i - 1].end, nextHour(r.legs[i - 1].end)]).toContain(l.start);
  });

  it('the polish drops the same way', async () => {
    const o: PolishOptions = { startTE: FROM, start: START, hours: days9to5, holdForHours: false };
    const kept = await find({ hours: days9to5, holdForHours: false });
    const p = polishFound(table, o, JSON.parse(JSON.stringify(kept)));
    p.byAscensions.forEach(r => {
      if (r) expect(prestigesInHours(r, days9to5)).toBe(true);
    });
  });
});
