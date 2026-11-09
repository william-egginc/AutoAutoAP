import { describe, expect, it } from 'vitest';
import { canonicalDelivered, pacificHourOfWeek, type BuildParams } from './precomputedLeg';
import * as routeFinder from './routeFinder';
import { findRoutes, polishFound, type BuildLookup, type PolishOptions } from './routeFinder';
import { isAvailable, type Availability } from './availability';
import { getNextSaleEnd } from 'lib/planners/events';

// By a date with the player's hours: the last stop counts when it is REACHED by the deadline, as By a date's search
// does (Jordan, 5 Nov 2026, removing "I need to ascend at the last stop before the deadline": a night-time last stop
// they stay up for, and the next-TE line lets them decide whether to wait). Until then the instant answer counted it
// only once it could be claimed inside the hours (`claimAt`, the math review, 24 Oct 2026, finding 9). Every prestige
// before it still waits for the hours. The same synthetic table as routeFinder.hours.spec.ts.
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

describe('By a date with hours: the last stop counts when it is reached by the deadline', () => {
  it('there is no claim rule any more', () => {
    expect(Object.keys(routeFinder)).not.toContain('claimAt');
  });

  it('a deadline in the night counts what was reached by then, after the hours ended too', async () => {
    let checked = 0;
    let atNightOnly = 0;
    for (let night = 4; night < 30; night += 3) {
      // 2:00 am PST on the nights after the plan start, and the last second of the hours before it (4:59:59 pm).
      const deadline = START + 17 * 3600 + night * 86400;
      const evening = deadline - 9 * 3600 - 1;
      const atNight = await find({ hours: days9to5, deadline });
      const atEvening = await find({ hours: days9to5, deadline: evening });
      for (const r of [atNight.byDate, ...atNight.byDateByAscensions]) {
        if (!r) continue;
        expect(r.end).toBeLessThanOrEqual(deadline);
        // Every prestige before the last stop is still inside the hours.
        expect(r.legs.every((l, i) => i === 0 || isAvailable(l.start, days9to5))).toBe(true);
      }
      expect(lastTE(atNight.byDate)).toBeGreaterThanOrEqual(lastTE(atEvening.byDate));
      if (atNight.byDate) checked++;
      // Reached in the night, after the hours ended: counted now, never before.
      if (atNight.byDate && atNight.byDate.end > evening) atNightOnly++;
    }
    expect(checked).toBeGreaterThan(0);
    expect(atNightOnly).toBeGreaterThan(0);
  });

  it('the polish keeps each count reached by the deadline', async () => {
    const free = await find();
    const deadline = free.best!.end - 86_400 + 3600 * 3;
    const dated = await find({ hours: days9to5, deadline });
    const o: PolishOptions = { startTE: FROM, start: START, hours: days9to5, deadline };
    const p = polishFound(table, o, JSON.parse(JSON.stringify(dated)));
    expect(p.byDate).not.toBeNull();
    for (const [k, r] of p.byDateByAscensions.entries()) {
      if (!r) continue;
      expect(r.end).toBeLessThanOrEqual(deadline);
      expect(lastTE(r)).toBeGreaterThanOrEqual(lastTE(dated.byDateByAscensions[k]));
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
