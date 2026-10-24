import { describe, expect, it } from 'vitest';
import { canonicalDelivered, pacificHourOfWeek, type BuildParams } from './precomputedLeg';
import { claimAt, findRoutes, polishFound, type BuildLookup, type PolishOptions } from './routeFinder';
import { nextAvailable, type Availability } from './availability';
import { getNextSaleEnd } from '@/lib/events';

// By a date with the player's hours: a TE counts once a prestige CLAIMS it (Jordan, 22 Oct 2026), and a prestige
// waits for the player, so the last stop must be reached in time to claim it inside the hours by the deadline
// (`claimAt`; the math review, 24 Oct 2026, finding 9). The same synthetic table as routeFinder.hours.spec.ts.
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
const days9to5: Availability = { days: [], fromHour: 9, toHour: 17, timezone: 'America/Los_Angeles' };
const find = (extra: object = {}) =>
  findRoutes({ table, startTE: FROM, start: START, final: FINAL, maxAscensions: 5, ...extra });
const lastTE = (r: { legs: { endTE: number }[] } | null) => (r ? r.legs[r.legs.length - 1].endTE : 0);

describe('claimAt', () => {
  const at = (iso: string) => Date.parse(iso) / 1000;
  it('inside the hours, or with no hours: the moment it is reached', () => {
    const noon = at('2027-01-05T20:00:00Z'); // Tue 12:00 pm PST
    expect(claimAt(noon, days9to5)).toBe(noon);
    expect(claimAt(noon, undefined)).toBe(noon);
    expect(claimAt(noon, null)).toBe(noon);
  });
  it('outside them: when the player is next around', () => {
    const night = at('2027-01-06T10:00:00Z'); // Wed 2:00 am PST
    expect(claimAt(night, days9to5)).toBe(at('2027-01-06T17:00:00Z'));
    expect(claimAt(night, days9to5)).toBe(nextAvailable(night, days9to5));
  });
});

describe('By a date with hours: the last stop claimed inside them by the deadline', () => {
  it('a deadline in the night counts what was reached by the end of the last evening, and no more', async () => {
    let checked = 0;
    for (let night = 4; night < 30; night += 3) {
      // 2:00 am PST on the nights after the plan start, and the last second of the hours before it (4:59:59 pm).
      const deadline = START + 17 * 3600 + night * 86400;
      const evening = deadline - 9 * 3600 - 1;
      const atNight = await find({ hours: days9to5, deadline });
      const atEvening = await find({ hours: days9to5, deadline: evening });
      for (const r of [atNight.byDate, ...atNight.byDateByAscensions]) {
        if (!r) continue;
        expect(claimAt(r.end, days9to5)).toBeLessThanOrEqual(deadline);
        expect(r.end).toBeLessThanOrEqual(evening);
      }
      expect(lastTE(atNight.byDate)).toBe(lastTE(atEvening.byDate));
      if (atNight.byDate) checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('the polish keeps each count claimable in time', async () => {
    const free = await find();
    const deadline = free.best!.end - 86_400 + 3600 * 3;
    const dated = await find({ hours: days9to5, deadline });
    const o: PolishOptions = { startTE: FROM, start: START, hours: days9to5, deadline };
    const p = polishFound(table, o, JSON.parse(JSON.stringify(dated)));
    for (const r of [p.byDate, ...p.byDateByAscensions]) {
      if (!r) continue;
      expect(claimAt(r.end, days9to5)).toBeLessThanOrEqual(deadline);
    }
  });

  it('no hours: reached by the deadline, as before', async () => {
    const free = await find();
    const deadline = free.best!.end - 86_400;
    const dated = await find({ deadline });
    expect(dated.byDate).not.toBeNull();
    expect(dated.byDate!.end).toBeLessThanOrEqual(deadline);
  });
});
