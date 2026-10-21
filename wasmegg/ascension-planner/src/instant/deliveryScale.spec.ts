import { describe, expect, it } from 'vitest';
import { allModifiersFromColleggtibles } from 'lib/collegtibles';
import { getOptimalELRSet, type EquippedArtifact } from '@/lib/artifacts';
import { deliveryScale } from './deliveryScale';
import { epic, fixtureBackup, research } from './tableGear.fixture';

/**
 * The delivery scale a delivery table is read with (InstantAnswer.vue ownScale): the save's best
 * delivery set at the table's k3 research against the table's own k3 delivery set.
 */
describe('deliveryScale against a delivery table’s k3', () => {
  const raw = fixtureBackup();
  const mods = allModifiersFromColleggtibles(raw);
  const mine = getOptimalELRSet(raw, {
    commonResearch: research,
    epicResearchLevels: epic,
    colleggtibleModifiers: mods,
    assumeMaxHabsVehicles: true,
  }) as EquippedArtifact[];
  const withStones = (stone: (s: string) => string) =>
    mine.map(slot => ({ ...slot, stones: slot.stones.map(s => (s ? stone(s) : s)) }));
  const scale = (delivery: EquippedArtifact[]) => deliveryScale(raw, { research, delivery }, epic, mods);

  it('is 1 for a table with the save’s own set and stones (all T4: as before)', () => {
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.flatMap(s => s.stones).every(s => !s || s.endsWith('-4'))).toBe(true);
    expect(scale(mine)).toBeCloseTo(1, 12);
  });

  it('under 1 when the table’s stones are stronger than the save’s, over 1 when weaker', () => {
    const t2 = withStones(s => s.replace(/-4$/, '-2'));
    // A table with T2 where the save has T4 scales up; the other way round (a save with lower-tier
    // stones than the table's T4) is its inverse, well under the caveat's 0.995.
    expect(scale(t2)).toBeGreaterThan(1);
    expect(1 / scale(t2)).toBeLessThan(0.995);
  });

  it('1 (unscaled) without a save or a k3', () => {
    expect(deliveryScale(null, { research, delivery: mine }, epic, mods)).toBe(1);
    expect(deliveryScale(raw, undefined, epic, mods)).toBe(1);
  });
});
