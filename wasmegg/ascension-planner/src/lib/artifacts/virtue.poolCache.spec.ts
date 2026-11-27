import { describe, expect, it } from 'vitest';
import { allModifiersFromColleggtibles } from 'lib/collegtibles';
import { AfxName as N, AfxRarity as R, invArtifact, invStone, syntheticBackup } from '@/auto/loadout/testBackup';
import { buildDeliveryPoolFromBackup, deliveryPoolOf, getOptimalELRSet } from 'lib/planners/artifacts/virtue';

// getOptimalELRSet's delivery pool, remembered per artifacts DB (sim4 table speed-up #1, 9 Nov).
const backup = () =>
  syntheticBackup([
    invArtifact(N.QUANTUM_METRONOME, 4, R.LEGENDARY),
    invArtifact(N.INTERSTELLAR_COMPASS, 4, R.EPIC),
    invArtifact(N.ORNATE_GUSSET, 2, R.EPIC),
    invArtifact(N.ORNATE_GUSSET, 4, R.COMMON),
    invArtifact(N.LUNAR_TOTEM, 4, R.LEGENDARY),
    invArtifact(N.TUNGSTEN_ANKH, 4, R.RARE),
    invStone(N.QUANTUM_STONE, 4, 3),
    invStone(N.TACHYON_STONE, 3, 5),
  ]);

describe('delivery pool cache', () => {
  it('equals a fresh build, and is built once per artifacts DB', () => {
    const b = backup();
    const pool = deliveryPoolOf(b);
    expect(pool).toEqual(buildDeliveryPoolFromBackup(b));
    expect(deliveryPoolOf(b)).toBe(pool);
    // A copy of the save is a different DB: a miss, never another save's pool.
    const copy = JSON.parse(JSON.stringify(b));
    expect(deliveryPoolOf(copy)).not.toBe(pool);
    expect(deliveryPoolOf(copy)).toEqual(pool);
  });

  it('is frozen, so no caller can change it for the next one', () => {
    const pool = deliveryPoolOf(backup());
    expect(Object.isFrozen(pool)).toBe(true);
    expect(Object.isFrozen(pool.candidates)).toBe(true);
    expect(pool.tachyon.every(Object.isFrozen) && pool.quantum.every(Object.isFrozen)).toBe(true);
  });

  it('gives the same delivery set as an uncached search, call after call', () => {
    const opts = {
      assumeMaxHabsVehicles: true,
      commonResearch: { comfortable_nests: 50, hen_house_ac: 50 },
      epicResearchLevels: {},
    };
    // Fresh backups each time: every call is the first for its DB (and for the structure cache).
    const fresh = (research: Record<string, number>) => {
      const b = backup();
      return getOptimalELRSet(b, {
        ...opts,
        commonResearch: research,
        colleggtibleModifiers: allModifiersFromColleggtibles(b),
      });
    };
    const b = backup();
    const mods = allModifiersFromColleggtibles(b);
    for (const research of [
      opts.commonResearch,
      { comfortable_nests: 10 },
      { hen_house_ac: 30, comfortable_nests: 50 },
    ]) {
      expect(
        getOptimalELRSet(b, {
          ...opts,
          commonResearch: research,
          colleggtibleModifiers: mods,
          bypassStructureCache: true,
        })
      ).toEqual(fresh(research));
    }
  });
});
