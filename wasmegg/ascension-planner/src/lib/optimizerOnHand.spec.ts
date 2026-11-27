/**
 * What the panel tells the solver the player already has (game expert's check, 23 Nov 2026: his save held 572 Solar titanium
 * bars on the Path, yet the plan aimed 63 launches at titanium). The request carries the PATH inventory's stock, counted
 * across rarities, for every item in the recipe tree: titanium bars, geodes and the lower compass tiers included.
 */
const storage: Record<string, string> = {};
Object.assign(globalThis, { window: { location: { pathname: '/' } }, localStorage: storage });

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { ei, Inventory, newShipsConfig } from 'lib';
import type { PlayerData } from 'lib/mission-optimizer/player-data';
import { sliceHumilityVisits } from 'lib/mission-optimizer/plan/read';
import type { PlanSave } from 'lib/mission-optimizer/plan/schema';

import { newVisitSettings } from './humilityOptimizer';
import { buildRequest } from './humilityOptimizerEngine';

const FIXTURES = new URL('../../../artifact-explorer/tests/fixtures/', import.meta.url).pathname;
const [visit] = sliceHumilityVisits(JSON.parse(readFileSync(FIXTURES + 'ascension-plan.json', 'utf8')) as PlanSave);

const COMPASS = 27;
const TAU_CETI_GEODE = 18;
const SOLAR_TITANIUM = 43;
const T = ei.ArtifactSpec.Rarity.COMMON;

/** The Path inventory, as `readPlayerData` builds it (`new Inventory(db, { virtue: true })`), from the db's virtue items. */
function pathPlayer(items: { name: number; level: number; count: number; rarity?: number }[]): PlayerData {
  const db = {
    virtueAfxDb: {
      inventoryItems: items.map(i => ({
        artifact: { spec: { name: i.name, level: i.level, rarity: i.rarity ?? T } },
        quantity: i.count,
      })),
    },
    // Home items are a different stock: the optimizer must not count them.
    inventoryItems: [{ artifact: { spec: { name: SOLAR_TITANIUM, level: 1, rarity: T } }, quantity: 9999 }],
  } as unknown as ei.IArtifactsDB;
  return {
    shipsConfig: newShipsConfig(),
    inventory: new Inventory(db, { virtue: true }),
    totalCraftingXp: 0,
    tankLevel: null,
    tankFuels: null,
    goldenEggs: 0,
  };
}

const ask = (player: PlayerData) =>
  buildRequest(visit, { ...newVisitSettings(), targetIds: ['interstellar-compass-4'], duration: '3d' }, player)!.input
    .ownedStock as Map<string, number>;

describe('on hand, as the panel sends it', () => {
  it('Path titanium bars, geodes and lower compasses are in the stock the solver gets', () => {
    const stock = ask(
      pathPlayer([
        { name: SOLAR_TITANIUM, level: 1, count: 572 },
        { name: TAU_CETI_GEODE, level: 2, count: 3 },
        { name: TAU_CETI_GEODE, level: 1, count: 19 },
        { name: COMPASS, level: 2, count: 10 },
        { name: COMPASS, level: 1, count: 89 },
      ])
    );
    expect(stock.get('solar-titanium-2')).toBe(572);
    expect(stock.get('tau-ceti-geode-3')).toBe(3);
    expect(stock.get('tau-ceti-geode-2')).toBe(19);
    expect(stock.get('interstellar-compass-3')).toBe(10);
    expect(stock.get('interstellar-compass-2')).toBe(89);
  });

  it('counts every rarity of an item, and reads the Path stock, not the home one', () => {
    const stock = ask(
      pathPlayer([
        { name: SOLAR_TITANIUM, level: 1, count: 500, rarity: ei.ArtifactSpec.Rarity.COMMON },
        { name: SOLAR_TITANIUM, level: 1, count: 72, rarity: ei.ArtifactSpec.Rarity.RARE },
      ])
    );
    expect(stock.get('solar-titanium-2')).toBe(572);
  });
});
