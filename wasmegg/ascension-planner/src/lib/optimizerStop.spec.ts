/** The visit My runs' rockets row hands the optimizer: the stop's own dates, the save's tank. */
import { describe, expect, it } from 'vitest';
import { ei, fuelTankSizes } from 'lib';
import { visitForStop } from './optimizerStop';

const stop = { arrival: 20_000, end: 20_000 + 52 * 3600, lengthSeconds: 52 * 3600, current: false, approximate: false };
const fuels = new Map<ei.Egg, number>([
  [ei.Egg.CURIOSITY, 13e12],
  [ei.Egg.INTEGRITY, 450e9],
  [ei.Egg.HUMILITY, 2e12],
  [ei.Egg.RESILIENCE, 1e12],
  [ei.Egg.KINDNESS, 8e12],
]);
const player = { tankLevel: 7, tankFuels: fuels, shipsConfig: { epicResearchFTLLevel: 60, epicResearchZerogLevel: 10 } };

describe('visitForStop', () => {
  const cur = visitForStop(stop, 5000, player as never)!;
  it('arrives when the plan arrives, nothing spent there yet, the save epic research', () => {
    expect(cur.visit.arrivalTimestamp).toBe(20_000);
    expect(cur.visit.plannedDurationSeconds).toBe(0);
    expect(cur.visit.epicResearchFTLLevel).toBe(60);
    expect(cur.visit.epicResearchZerogLevel).toBe(10);
    expect(cur.visitCount).toBe(1);
    expect(cur.visit.visitIndex).toBe(0);
  });
  it('the tank is the save tank, Humility left out of the banked fuel and counted in the room used', () => {
    expect(cur.visit.tankLevel).toBe(7);
    expect(cur.visit.fuelByEgg.get(ei.Egg.CURIOSITY)).toBe(13e12);
    expect(cur.visit.fuelByEgg.has(ei.Egg.HUMILITY)).toBe(false);
    expect(cur.tankFree).toBe(fuelTankSizes[7] - (13e12 + 450e9 + 2e12 + 1e12 + 8e12));
  });
  it('while the player is on the stop, the launches start now: the time already there is counted', () => {
    const on = visitForStop({ ...stop, current: true }, 30_000, player as never)!;
    expect(on.visit.plannedDurationSeconds).toBe(10_000);
  });
  it('the visit has its own id, per stop, so its settings are its own', () => {
    expect(cur.visit.visitId).toBe('myruns-humility-20000');
    expect(visitForStop({ ...stop, arrival: 99_000 }, 5000, player as never)!.visit.visitId).not.toBe(cur.visit.visitId);
  });
  it('no tank in the save, no visit', () => {
    expect(visitForStop(stop, 5000, { ...player, tankFuels: null } as never)).toBeNull();
  });
});
