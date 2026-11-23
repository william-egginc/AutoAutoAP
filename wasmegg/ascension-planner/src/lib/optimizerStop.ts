// The Humility visit My runs' rockets row hands the optimizer, built from the stop's own dates and the save's tank (the
// Manual Planner's visit comes from its action history instead: lib/humilityOptimizer.ts `currentHumilityVisit`).

import { ei, fuelTankSizes } from 'lib';
import type { HumilityVisit } from 'lib/mission-optimizer/plan/read';
import type { PlayerData } from 'lib/mission-optimizer/player-data';
import { NON_HUMILITY_EGG_IDS } from 'lib/mission-optimizer/plan/schema';

import type { CurrentVisit } from './humilityOptimizer';
import type { HumilityStop } from './humilityStop';

/**
 * The visit for a stop. It arrives when the plan does and nothing is spent there yet, unless the player is on it: the
 * time already there is then counted, so the launches start now. Fuel and tank are the save's as it stands. Null when the
 * save carries no readable tank.
 *
 * Not known here, and left at zero: what the stop earns, so the price limit cannot be "what this visit earns" (the row
 * asks for no limit). The stop's fuel is today's tank, which is right for the stop the player is on or the next one, not
 * for one several prestiges away.
 */
export function visitForStop(
  stop: HumilityStop,
  now: number,
  player: Pick<PlayerData, 'tankLevel' | 'tankFuels' | 'shipsConfig'>
): CurrentVisit | null {
  if (!player.tankFuels || player.tankLevel === null) return null;
  const fuelByEgg = new Map<ei.Egg, number>();
  for (const [, id] of NON_HUMILITY_EGG_IDS) fuelByEgg.set(id, player.tankFuels.get(id) ?? 0);
  let stored = 0;
  for (const amount of player.tankFuels.values()) stored += amount;
  const visit: HumilityVisit = {
    visitId: `myruns-humility-${stop.arrival}`,
    visitIndex: 0,
    label: 'Humility stop',
    arrivalTimestamp: stop.arrival,
    plannedDurationSeconds: stop.current ? Math.max(0, now - stop.arrival) : 0,
    fuelByEgg,
    tankLevel: player.tankLevel,
    bankValue: 0,
    earningsPerSecond: 0,
    epicResearchFTLLevel: player.shipsConfig.epicResearchFTLLevel,
    epicResearchZerogLevel: player.shipsConfig.epicResearchZerogLevel,
  };
  return { visit, tankFree: Math.max(0, (fuelTankSizes[player.tankLevel] ?? 0) - stored), visitCount: 1 };
}
