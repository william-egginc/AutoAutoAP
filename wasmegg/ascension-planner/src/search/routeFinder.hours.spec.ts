import { describe, expect, it } from 'vitest';
import { canonicalDelivered, pacificHourOfWeek, type BuildParams } from './precomputedLeg';
import { findRoutes, polishFound, prestigesInHours, type BuildLookup, type PolishOptions } from './routeFinder';
import { isAvailable, type Availability } from './availability';
import { getNextSaleEnd } from '@/lib/events';

// "Works inside my hours" (the user, 6 Oct): arrivals whose prestige falls outside the player's hours
// are dropped as the search makes them, so every route it keeps is inside. The same synthetic table
// as routeFinder.polish.spec.ts.
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

describe('prestigesInHours', () => {
  it('checks the start of every ascension after the first', () => {
    const at = (h: number) => Date.parse(`2027-01-05T${String(h).padStart(2, '0')}:00:00Z`) / 1000;
    // 18:00 UTC = 10 am PST (in), 03:00 UTC = 7 pm PST the day before (out).
    expect(prestigesInHours({ legs: [{ start: at(3) }, { start: at(18) }] }, days9to5)).toBe(true);
    expect(prestigesInHours({ legs: [{ start: at(18) }, { start: at(3) }] }, days9to5)).toBe(false);
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

  it('names the counts left without a route, and finds more than filtering the free answer would', async () => {
    // One hour on Wednesdays: most routes have a prestige outside it.
    const narrow: Availability = { days: [3], fromHour: 9, toHour: 10, timezone: 'America/Los_Angeles' };
    const free = await find();
    const kept = await find({ hours: narrow });
    expect(kept.outOfHours!.length).toBeGreaterThan(0);
    kept.byAscensions.forEach((r, k) => {
      if (k === 0) return;
      if (r) {
        expect(prestigesInHours(r, narrow)).toBe(true);
        expect(kept.outOfHours).not.toContain(k);
      } else if (free.byAscensions[k]) expect(kept.outOfHours).toContain(k);
    });
    // 9 am-5 pm every day: more counts answered than the free answer's routes that happen to fit.
    const day = await find({ hours: days9to5 });
    const answered = day.byAscensions.filter(r => r).length;
    const freeInside = free.byAscensions.filter(r => r && prestigesInHours(r, days9to5)).length;
    expect(answered).toBeGreaterThan(freeInside); // 3 against 1 on this table
    // One ascension needs no prestige on the way.
    expect(kept.byAscensions[1]?.end).toBe(free.byAscensions[1]?.end);
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
