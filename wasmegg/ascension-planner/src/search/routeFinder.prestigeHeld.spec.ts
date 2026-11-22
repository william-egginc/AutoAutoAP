import { describe, expect, it } from 'vitest';
import { canonicalDelivered, pacificHourOfWeek, type BuildParams } from './precomputedLeg';
import { findRoutes, firstLegOptions, nextHour, priceChain, type BuildLookup } from './routeFinder';
import { timeOffWindows } from './timeOff';
import type { Availability } from './availability';
import { instantSteps } from '@/lib/instantSteps';
import { getNextSaleEnd } from 'lib/planners/events';

// A HELD FRESH FIRST ASCENSION (code review 22 Nov 2026, math-fast-1): the player's hours or a no-prestige day hold the
// first prestige past the next whole hour. It was priced from the held start but its leg started at the plan start,
// so the box said "Prestige: now" over a finish worked out from days later. The leg now starts where it was priced
// (`FirstLeg.start`) and says when it was ready (`prestigeHeld`), so the box says when to prestige and why it waits.
// The synthetic table of routeFinder.heldOpening.spec.ts.
const BASE = Date.parse('2027-01-04T17:00:00Z') / 1000; // Monday 4 Jan 2027, 9:00 am PST
const FROM = 100;
const FINAL = 110;
const TZ = 'America/Los_Angeles';
const table: BuildLookup = (te, hour) => {
  if (te < FROM || te > FINAL) return null;
  const cellStart = BASE + ((hour - pacificHourOfWeek(BASE) + 168) % 168) * 3600;
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
const days7to11: Availability = { days: [], fromHour: 7, toHour: 23, timezone: TZ };
const at = (iso: string) => Date.parse(iso) / 1000;
const TUE_1030PM = at('2027-01-06T06:30:00Z');
const TUE_11PM = at('2027-01-06T07:00:00Z');
const THU_7AM = at('2027-01-07T15:00:00Z');
const wednesday = timeOffWindows([{ from: '2027-01-06', to: '2027-01-06' }], TZ);

const legsAt = (start: number, noPrestige = wednesday) =>
  firstLegOptions({
    table,
    startTE: FROM,
    start,
    final: FINAL,
    delivered: canonicalDelivered(FROM),
    cont: null,
    firstAscension: 'fresh',
    pinSeconds: 0,
    maxContinueSeconds: 0,
    hours: days7to11,
    noPrestige,
  });

describe('a fresh first ascension held past the next hour starts where it was priced', () => {
  it('firstLegOptions: each leg starts Thu 7 AM and was ready at 11 PM Tue', () => {
    const legs = legsAt(TUE_1030PM);
    expect(legs.length).toBeGreaterThan(0);
    for (const l of legs) {
      expect(l.start).toBe(THU_7AM);
      expect(l.prestigeHeld).toEqual({ ready: TUE_11PM });
      expect(l.heldOpening).toBeUndefined(); // not the held opening's caveat
    }
  });

  it('findRoutes and priceChain: the route’s first leg starts Thu 7 AM', async () => {
    const firstLegs = legsAt(TUE_1030PM);
    const found = await findRoutes({
      table,
      startTE: FROM,
      start: TUE_1030PM,
      final: FINAL,
      maxAscensions: 3,
      firstLegs,
      hours: days7to11,
      noPrestige: wednesday,
    });
    const best = found.best!;
    expect(best.legs[0].start).toBe(THU_7AM);
    expect(best.legs[0].prestigeHeld).toEqual({ ready: TUE_11PM });
    const priced = priceChain(
      table,
      { startTE: FROM, start: TUE_1030PM, firstLegs, hours: days7to11, noPrestige: wednesday },
      best.chain
    )!;
    expect(priced.legs[0].start).toBe(THU_7AM);
    expect(priced.legs[0].prestigeHeld).toEqual({ ready: TUE_11PM });
  });

  it('instantSteps: not "now": prestige Thu 7 AM, waiting for the no-prestige day', async () => {
    const firstLegs = legsAt(TUE_1030PM);
    const found = await findRoutes({
      table,
      startTE: FROM,
      start: TUE_1030PM,
      final: FINAL,
      maxAscensions: 3,
      firstLegs,
      hours: days7to11,
      noPrestige: wednesday,
    });
    const [s] = instantSteps(found.best!.legs, days7to11, wednesday);
    expect(s.now).toBe(false);
    expect(s.prestigeAt).toBe(THU_7AM);
    expect(s.readyAt).toBe(TUE_11PM);
    expect(s.wait).toBe('days');
  });

  it('the plain round-up to the next hour stays "now", with no marker', async () => {
    const tue1030am = at('2027-01-05T18:30:00Z');
    const firstLegs = legsAt(tue1030am, []);
    for (const l of firstLegs) expect(l.prestigeHeld).toBeUndefined();
    expect(firstLegs[0].start ?? tue1030am).toBeLessThanOrEqual(nextHour(tue1030am));
    const found = await findRoutes({
      table,
      startTE: FROM,
      start: tue1030am,
      final: FINAL,
      maxAscensions: 3,
      firstLegs,
      hours: days7to11,
    });
    const [s] = instantSteps(found.best!.legs, days7to11, []);
    expect(s.now).toBe(true);
  });
});
