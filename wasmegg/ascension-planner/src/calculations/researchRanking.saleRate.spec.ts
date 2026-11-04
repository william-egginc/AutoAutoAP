/**
 * Allan's Discord (3 Nov 2026), Joo's AP "sometimes uses the non-sale prices for calculating the
 * efficiency of the purchase" during a research sale. In rankResearchByELRImpact the hr/% rate was
 * taken from a zero-bank sale-aware wait: late in a sale, saving the sale price from zero no longer
 * fits before the sale ends, so that wait fell back to the FULL price (or next week's sale), while the
 * purchase itself (with the bank) is made now at the sale price. The rate must be the time to earn
 * the price actually charged.
 */
import { describe, expect, it } from 'vitest';
import { getCommonResearches, getDiscountedVirtuePrice, getResearchById, type ResearchCostModifiers } from './commonResearch';
import { rankResearchByELRImpact } from './researchRanking';
import { computeSnapshot } from '@/engine/compute';
import { getTimeToSave } from '@/engine/apply';
import { contextDeliverySource } from '@/auto/loadout/resolve';
import { maxedBaseState, maxedContext } from '@/buildTable/maxedAccount';
import { getNextSaleEnd, getNextSaleStart } from '@/lib/events';

const context = maxedContext();
const deliverySource = contextDeliverySource(context);
const saleEnd = getNextSaleEnd(getNextSaleStart(1_790_000_000));
const ID = 'comfy_nests';

describe('ranking during a sale rates a purchase at the price it is charged', () => {
  it('late in a sale, with the sale price in the bank, the hr/% is the sale price’s', () => {
    const researchLevels = { ...Object.fromEntries(getCommonResearches().map(r => [r.id, r.levels])), [ID]: 40 };
    const state = {
      ...maxedBaseState(),
      te: 150,
      habIds: [18, 18, 18, 18],
      vehicles: [{ vehicleId: 11, trainLength: 10 }],
      researchLevels,
      population: 1e10,
      activeSales: { research: true, hab: false, vehicle: false },
    };
    const uncapped = computeSnapshot(state, context, { skipEpochConversion: true });
    const base = computeSnapshot({ ...state, population: uncapped.habCapacity }, context, { skipEpochConversion: true });
    const research = getResearchById(ID)!;
    const unit: ResearchCostModifiers = { labUpgradeLevel: 0, researchCostMultiplier: 1, puzzleCubeMultiplier: 1 };
    const unitSeconds = getTimeToSave(getDiscountedVirtuePrice(research, 40, unit, true), { ...base, bankValue: 0 }, []);
    // The sale price takes 2 h to earn from nothing; the sale has 1 h left; the bank holds the sale price.
    // Two passes: a sub-minute unit price is saved at the online rate (the 60 s rule), the scaled one offline.
    const first = { ...unit, researchCostMultiplier: 7200 / unitSeconds };
    const firstSeconds = getTimeToSave(getDiscountedVirtuePrice(research, 40, first, true), { ...base, bankValue: 0 }, []);
    const mods = { ...unit, researchCostMultiplier: first.researchCostMultiplier * (7200 / firstSeconds) };
    const salePrice = getDiscountedVirtuePrice(research, 40, mods, true);
    const snapshot = { ...base, bankValue: salePrice * 1.0001 };

    const ranked = rankResearchByELRImpact(researchLevels, deliverySource, snapshot, context, mods, true, saleEnd - 3600, saleEnd, 'realistic', 'efficiency');
    const item = ranked.find(r => r.research.id === ID)!;
    expect(item).toBeDefined();
    expect(item.impact!).toBeGreaterThan(0);
    expect(item.price).toBeCloseTo(salePrice, 0);
    const expectedHpp = getTimeToSave(salePrice, { ...snapshot, bankValue: 0 }, []) / 3600 / (item.impact! * 100);
    expect(item.hpp! / expectedHpp).toBeCloseTo(1, 3);
  });
});
