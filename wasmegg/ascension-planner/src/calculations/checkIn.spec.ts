/**
 * The check-in rule (Jordan, 4 Nov 2026): "go offline then but whatever you can afford when you come
 * back… and then anything that's longer than a minute buy that at that time." At a check-in every
 * affordable buy is made at once; the next check-in is at least a minute later. So the money earned
 * over a minute's wait that a purchase didn't use stays in the bank for the next one: on a rich
 * farm, a whole run of cheap buys takes ONE check-in, not a minute each. The virtual planners
 * (vehicles, habs, silos) used to drop that surplus (bank to 0 after any wait).
 */
import { describe, expect, it } from 'vitest';
import { planMaxVehicles } from 'lib/planners/calculations/plannerVehiclePurchasePlan';
import { planSilosWithinBudget } from 'lib/planners/calculations/siloPurchasePlan';
import { findSmartBuyCandidate } from 'lib/planners/calculations/smartBuyCandidate';
import { getCommonResearches, getDiscountedVirtuePrice, isTierUnlocked } from './commonResearch';

const rich = {
  bankValue: 0,
  offlineEarnings: 1e60,
  population: 1e10,
  habCapacity: 1e10,
  offlineIHR: 0,
  shippingCapacity: 1e10,
  ratePerChickenPerSecond: 1,
  elr: 1e10,
  layRate: 1e10,
  earningsBoost: { active: false, multiplier: 1 },
};
const mult = { universalMultiplier: 1, hoverMultiplier: 1, hyperloopMultiplier: 1, epicMultiplier: 1, shippingCapMultiplier: 1, artifactMultiplier: 1 };

describe('one check-in buys everything affordable', () => {
  it('maxing every vehicle on a rich farm takes one minute, not a minute per buy', () => {
    const plan = planMaxVehicles([{ vehicleId: 0, trainLength: 1 }], 17, 10, { bustUnionsLevel: 0, vehicleCostMultiplier: 1 }, false, mult, { ...rich });
    expect(plan.steps.length).toBeGreaterThan(100);
    expect(plan.totalSeconds).toBe(60);
  });
  it('the same for silos', () => {
    const plan = planSilosWithinBudget({ ...rich } as never, 1, 3600) as { steps: { waitSeconds: number }[]; totalSeconds: number };
    expect(plan.steps.length).toBeGreaterThan(1);
    expect(plan.totalSeconds).toBe(60);
  });

  it("Smart Buy's 10 s sweep still finds a buy costing a few seconds of income (a price test, not a wait)", () => {
    const levels = Object.fromEntries(getCommonResearches().map(r => [r.id, 0]));
    const mods = { labUpgradeLevel: 0, researchCostMultiplier: 1, puzzleCubeMultiplier: 1 };
    const cheapest = Math.min(...getCommonResearches().filter(r => isTierUnlocked(levels, r.tier)).map(r => getDiscountedVirtuePrice(r, 0, mods, false)));
    // The cheapest level costs 5 s of income: a 10 s sweep must take it.
    const c = findSmartBuyCandidate(levels, mods, false, { ...rich, offlineEarnings: cheapest / 5 } as never, 10, 1_790_000_000);
    expect(c).not.toBeNull();
    expect(c!.secondsToSave).toBeLessThan(10);
  });
});
