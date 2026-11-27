import { describe, expect, it } from 'vitest';
import {
  calculatePurchasesUpToTier,
  getCommonResearches,
  getTiers,
  isTierUnlocked,
  TIER_UNLOCK_THRESHOLDS,
} from './commonResearch';

// isTierUnlocked's short count (sim4 table speed-up #2, 9 Nov) against the full count it replaced.
const fullCount = (levels: Record<string, number>, tier: number) =>
  tier <= 1
    ? true
    : tier - 1 >= TIER_UNLOCK_THRESHOLDS.length
      ? false
      : calculatePurchasesUpToTier(levels, tier - 1) >= TIER_UNLOCK_THRESHOLDS[tier - 1];

/** A small seeded generator, so a failure names a state that can be rebuilt. */
function rng(seed: number) {
  return () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
}

describe('isTierUnlocked', () => {
  const researches = getCommonResearches();
  const tiers = [...getTiers(), Math.max(...getTiers()) + 1, 0];

  it('matches the full purchase count on every tier, for 2,000 research states', () => {
    const next = rng(9);
    for (let n = 0; n < 2000; n++) {
      // Fill from tier 1 up, the way purchases unlock, to a random depth, with gaps and missing ids.
      const depth = next();
      const levels: Record<string, number> = {};
      for (const r of researches) {
        if (r.tier / 13 > depth + 0.1 || next() < 0.2) continue;
        levels[r.id] = Math.floor(next() * (r.levels + 1));
      }
      for (const tier of tiers)
        expect([n, tier, isTierUnlocked(levels, tier)]).toEqual([n, tier, fullCount(levels, tier)]);
    }
  });

  it('is exact at each threshold: one purchase short is locked, the threshold itself unlocks', () => {
    const tier1 = researches.filter(r => r.tier === 1);
    for (let tier = 2; tier <= TIER_UNLOCK_THRESHOLDS.length; tier++) {
      const need = TIER_UNLOCK_THRESHOLDS[tier - 1];
      const capacity = researches.filter(r => r.tier < tier).reduce((s, r) => s + r.levels, 0);
      if (need > capacity || need === 0) continue;
      // Spend `need` purchases over the tiers below, cheapest first in list order.
      const levels: Record<string, number> = {};
      let left = need;
      for (const r of researches.filter(r => r.tier < tier)) {
        const take = Math.min(left, r.levels);
        if (take) levels[r.id] = take;
        left -= take;
      }
      expect(isTierUnlocked(levels, tier)).toBe(true);
      const short = { ...levels };
      const last = Object.keys(short).pop()!;
      short[last] -= 1;
      expect(isTierUnlocked(short, tier)).toBe(false);
      expect(tier1.length).toBeGreaterThan(0);
    }
  });
});
