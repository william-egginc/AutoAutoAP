/**
 * A PRODUCING FARM IS BUILT (28 Oct 2026, Jordan in Chrome: Fastest to 490, following 226 → 277 → 317 → 490, farm
 * producing on Curiosity at 196 TE, habs full). Next step said "Keep building: vehicles until about Nov 14, 10:00 AM"
 * and Next shifts listed it, then "Shift to Humility · about Nov 13, 9:05 PM", before the build supposedly ends. The
 * vehicle test counted any slot short of a full hyperloop as unfinished. Now: vehicles are unfinished only when the
 * farm can't ship what it lays at full habs (shipping below laying: lib/nextTeEgg.ts `shiftRates`), and a
 * keep-building line never ends after the first shift it lists.
 */
import { describe, expect, it } from 'vitest';
import { buildLeft } from './saveBuild';
import { nextAction, nextShifts, type ActionLeg } from './nextAction';
import type { CurrentFarmState } from '@/types';

const H = 3600;
const T0 = Date.parse('2027-01-04T17:00:00Z') / 1000;

const farm = (habs: (number | null)[], vehicles: [number | null, number][]): CurrentFarmState =>
  ({
    eggType: 50,
    habs,
    vehicles: vehicles.map(([vehicleId, trainLength]) => ({ vehicleId, trainLength })),
    commonResearches: {},
  }) as unknown as CurrentFarmState;
// Jordan's: four Chicken Universes, 17 slots with a few short of a full hyperloop.
const jordans = farm(
  [18, 18, 18, 18],
  [...Array.from({ length: 13 }, () => [11, 10] as [number, number]), [11, 6], [10, 5], [9, 5], [9, 3]]
);
// Laying-limited: 1e4 chickens x 1 egg/s each = 1e4 laying, shipping above it (delivery = laying).
const layingLimited = { maxHabs: 1e4, perChicken: 1, maxElr: 1e4 };
// Shipping-limited: laying 1e4, shipping (and so delivery) only 6e3.
const shippingLimited = { maxHabs: 1e4, perChicken: 1, maxElr: 6e3 };

describe('buildLeft from the rates (b)', () => {
  it("Jordan's producing farm, delivery limited by laying: built, whatever its slots", () => {
    expect(buildLeft(jordans, layingLimited)).toEqual([]);
  });
  it('shipping below laying at full habs: vehicles', () => {
    expect(buildLeft(jordans, shippingLimited)).toEqual(['vehicles']);
  });
  it('habs not all Chicken Universes: habs (with vehicles too when shipping-limited)', () => {
    expect(buildLeft(farm([18, 18, 13, null], []), layingLimited)).toEqual(['habs']);
    expect(buildLeft(farm([18, 18, 13, null], []), shippingLimited)).toEqual(['vehicles', 'habs']);
  });
  it('rates not known: vehicles never counted (never over-eager); no farm: null', () => {
    expect(buildLeft(jordans, null)).toEqual([]);
    expect(buildLeft(null, layingLimited)).toBeNull();
  });
});

describe('a keep-building line never ends after the first shift it lists (a)', () => {
  // Jordan's: the build "ends" Nov 14, 10:00 AM, but Humility comes Nov 13, 9:05 PM.
  const leg: ActionLeg = {
    to: 226,
    endTE: 226,
    start: T0,
    end: T0 + 60 * H,
    buildEnd: T0 + 20 * H,
    simulated: true,
    live: true,
    building: ['vehicles'],
    shifts: [
      { at: T0 + 7 * H, egg: 'humility' },
      { at: T0 + 7 * H, egg: 'kindness' },
    ],
  };
  it('the build ends after the first shift: no keep-building line; the shift comes first', () => {
    expect(nextAction({ now: T0 + H, leg, last: false })).toEqual({ kind: 'shift', egg: 'humility', at: T0 + 7 * H });
    const l = nextShifts({ now: T0 + H, legs: [leg], more: true });
    expect(l.some(x => x.kind === 'keepbuilding')).toBe(false);
    expect(l[0]).toMatchObject({ kind: 'shift', egg: 'humility' });
  });
  it('the build ends at or before the first shift ahead: the line stays, first', () => {
    const ok = { ...leg, buildEnd: T0 + 7 * H };
    expect(nextAction({ now: T0 + H, leg: ok, last: false })).toEqual({
      kind: 'keepbuilding',
      until: T0 + 7 * H,
      left: ['vehicles'],
    });
    expect(nextShifts({ now: T0 + H, legs: [ok], more: true })[0]).toMatchObject({
      kind: 'keepbuilding',
      at: T0 + 7 * H,
    });
  });
});
