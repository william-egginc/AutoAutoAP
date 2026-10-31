/**
 * SETS CHANGE ONLY ON HUMILITY (spec-continueset, 31 Oct 2026; Reliability's confirmation in aaap-tools
 * notes/continue-set-2026-10-31.md). A1's "Continue current ascension" and "Continue my build-up"
 * (search/leg.ts `continueState`, `buildUpState`) on a farm off Humility keep the loadout the save has
 * equipped until H1: research and away cash are priced on it. Before, the build-up put on the earnings
 * set at the plan start on any egg, and continue wore the best delivery set, both swaps the game only
 * allows on Humility.
 *
 * The synthetic save (src/test/syntheticSave.ts; no player data, fixed clock) with four T4 legendaries
 * stoned for earnings (lunar) and four for delivery (tachyon) added to its inventory, so the equipped,
 * earnings and best delivery sets all differ. Its farm put on Kindness or Humility.
 *
 * What it proves:
 * - Kindness, production set worn: both states wear the equipped loadout; the build-up stays on it in
 *   every step until H1, and so ends later than the same farm wearing the earnings set (they were equal);
 * - Kindness, earnings set worn: the build-up is exactly what it was (recorded below before the fix);
 *   continue wears that earnings set, not the best delivery set;
 * - Humility: both exactly what they were (the swap is allowed there);
 * - no virtue farm: still no continue and no build-up.
 * A few build-ups of simulation (seconds each).
 */
import '../../scripts/node-shims';

import { describe, expect, it } from 'vitest';
import { syntheticBackup, syntheticInputs } from '@/test/syntheticSave';
import { getArtifactLoadoutFromBackup, getOptimalEarningsSet, getOptimalELRSet } from '@/lib/artifacts';
import { sameSet } from '@/lib/gearMatch';
import { getCommonResearches } from '@/calculations/commonResearch';
import { buildUpStateForCheck, buildUpVariantForCheck, continueStateForCheck, continueVariantForCheck } from './leg';
import type { EquippedArtifact } from '@/lib/artifacts/types';
import type { SearchInputs } from './types';

/** Recorded before the fix (ec96de70): the build-up of the synthetic farm on its earnings set, and on
 *  Humility the build-up and continue. Plan start Oct 1, 2026, 7:00 am Mountain; target 192 TE. */
const BEFORE = { buildUpEarnings: 1791553923.1875973, humilityContinue: 39027924345.62065 };

const KINDNESS = 54;
const HUMILITY = 52;
type Wear = 'production' | 'earnings';

function save(egg: number, wear: Wear, maxed = false): () => any {
  return () => {
    const b = syntheticBackup();
    const f = b.farms[0];
    f.eggType = egg;
    const db = b.artifactsDb.virtueAfxDb;
    const inv = db.inventoryItems;
    const add = (name: number, stones: number[]): number => {
      const itemId = 910000100 + inv.length;
      inv.push({
        itemId,
        artifact: {
          spec: { name, level: 3, rarity: 3, egg: 1000 },
          stones: stones.map(n => ({ name: n, level: 2, rarity: 0 })),
        },
        quantity: 1,
        serverId: '',
      });
      return itemId;
    };
    // Metronome, lunar totem, tungsten ankh, Demeter's necklace: lunar-stoned, then tachyon-stoned.
    const earnings = [24, 0, 12, 6].map(n => add(n, [33, 33, 33]));
    [24, 0, 6, 12].forEach(n => add(n, [1, 1, 1]));
    // Otherwise the save's own: metronome, deflector, compass (a production set).
    if (wear === 'earnings') db.activeArtifacts.slots = earnings.map(itemId => ({ occupied: true, itemId }));
    if (maxed) {
      f.commonResearch = getCommonResearches().map(r => ({ id: r.id, level: r.levels }));
      f.habs = [18, 18, 18, 18];
      f.habPopulation = [1e10, 1e10, 1e10, 1e10];
      f.vehicles = Array(17).fill(11);
      f.trainLength = Array(17).fill(10);
      f.silosOwned = 10;
    }
    return b;
  };
}

const raw = (inputs: SearchInputs) => inputs.context.rawBackup as any;
const equipped = (inputs: SearchInputs) => getArtifactLoadoutFromBackup(raw(inputs));
const earningsSet = (inputs: SearchInputs) => getOptimalEarningsSet(raw(inputs));
const cont = (inputs: SearchInputs) => continueStateForCheck(inputs, inputs.baseState);
const start = (inputs: SearchInputs) => buildUpStateForCheck(inputs, inputs.baseState, inputs.planStart);
const buildUp = (inputs: SearchInputs) =>
  buildUpVariantForCheck(inputs, inputs.baseState, inputs.planStart, 192, 0, inputs.currentTE);
const continued = (inputs: SearchInputs) => continueVariantForCheck(inputs, inputs.baseState, inputs.planStart, 192, 0);
const loadout = (s: { artifactLoadout: unknown } | null | undefined) =>
  (s?.artifactLoadout ?? null) as EquippedArtifact[] | null;

describe('A1 off Humility keeps the equipped set (search/leg.ts)', () => {
  it('Kindness, production set worn: continue wears it, not the best delivery set', async () => {
    const inputs = await syntheticInputs(save(KINDNESS, 'production'));
    const worn = equipped(inputs);
    expect(sameSet(worn, earningsSet(inputs))).toBe(false);
    const c = cont(inputs)!;
    expect(c.currentEgg).toBe('kindness');
    expect(sameSet(loadout(c), worn)).toBe(true);
  }, 600_000);

  it('Kindness, production set worn: the build-up wears it until H1, and is slower for it', async () => {
    const inputs = await syntheticInputs(save(KINDNESS, 'production'));
    const worn = equipped(inputs);
    const s = start(inputs)!;
    expect(s.activeArtifactSet).toBe('elr');
    expect(sameSet(loadout(s), worn)).toBe(true);
    // Filed as the earnings set too, so a C1 equip of "earnings" would change nothing.
    expect(sameSet(s.artifactSets.earnings as EquippedArtifact[], worn)).toBe(true);

    const v = buildUp(inputs)!;
    const h1 = v.actions.findIndex(a => a.type === 'shift' && (a.payload as { toEgg?: string }).toEgg === 'humility');
    expect(h1).toBeGreaterThan(0);
    for (const a of v.actions.slice(0, h1)) expect(sameSet(loadout(a.endState), worn)).toBe(true);
    // From H1 on it may swap: H1 puts on the delivery set.
    expect(sameSet(loadout(v.actions[h1 + 2]?.endState), worn)).toBe(false);

    // Priced on the weaker set, the build-up is slower than the same farm's wearing the earnings set
    // (they were the same: both were priced on the earnings set).
    expect(v.summary.endTime).toBeGreaterThan(BEFORE.buildUpEarnings);
  }, 600_000);

  it('Kindness, earnings set worn: the build-up is unchanged; continue wears that set', async () => {
    const inputs = await syntheticInputs(save(KINDNESS, 'earnings'));
    const worn = equipped(inputs);
    expect(sameSet(worn, earningsSet(inputs))).toBe(true);

    const c = cont(inputs)!;
    expect(c.activeArtifactSet).toBe('earnings');
    expect(sameSet(loadout(c), worn)).toBe(true);

    const s = start(inputs)!;
    expect(s.activeArtifactSet).toBe('earnings');
    expect(sameSet(loadout(s), worn)).toBe(true);
    expect(buildUp(inputs)!.summary.endTime).toBe(BEFORE.buildUpEarnings);
  }, 600_000);

  it('Humility: the swaps stay allowed, and both are unchanged', async () => {
    const inputs = await syntheticInputs(save(HUMILITY, 'production'));
    const worn = equipped(inputs);
    const c = cont(inputs)!;
    expect(c.currentEgg).toBe('humility');
    // The best delivery set, as before.
    const best = getOptimalELRSet(raw(inputs), {
      commonResearch: inputs.currentFarmState!.commonResearches,
      epicResearchLevels: inputs.context.epicResearchLevels,
      colleggtibleModifiers: inputs.context.colleggtibleModifiers,
      currentSet: worn,
      assumeMaxHabsVehicles: false,
    });
    expect(sameSet(loadout(c), best)).toBe(true);
    expect(sameSet(loadout(c), worn)).toBe(false);

    const s = start(inputs)!;
    expect(s.activeArtifactSet).toBe('earnings');
    expect(sameSet(loadout(s), earningsSet(inputs))).toBe(true);
    expect(buildUp(inputs)!.summary.endTime).toBe(BEFORE.buildUpEarnings);
    expect(continued(inputs)!.summary.endTime).toBe(BEFORE.humilityContinue);
  }, 600_000);

  it('a farm with nothing left to buy: the build-up does not beat continue', async () => {
    const inputs = await syntheticInputs(save(KINDNESS, 'production', true));
    const b = buildUp(inputs)!;
    const c = continued(inputs)!;
    expect(b.summary.endTime).toBeGreaterThanOrEqual(c.summary.endTime);
  }, 600_000);

  it('no virtue farm: no continue and no build-up', async () => {
    const inputs = await syntheticInputs(save(KINDNESS, 'production'));
    const bare = { ...inputs, currentFarmState: null } as unknown as SearchInputs;
    expect(cont(bare)).toBeNull();
    expect(start(bare)).toBeNull();
  }, 600_000);
});
