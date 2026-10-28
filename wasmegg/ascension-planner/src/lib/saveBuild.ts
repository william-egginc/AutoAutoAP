/**
 * IS THE SAVE'S BUILD FINISHED? (27 Oct 2026, pieha and Jordan: mid-ascension with not all vehicles bought, Right now
 * said "Shift to Curiosity" and the delivery loop, no build-up.) What the standard build buys toward (auto/buildUp.ts:
 * every hab a Chicken Universe, every vehicle slot a full hyperloop), read from the save's virtue farm
 * (lib/farmFacts.ts `saveFarmOf`). The vehicle slots and train length are the most the research allows, not the
 * farm's own research so far: a farm whose fleet research isn't done isn't built either. Silos are bought within a
 * budget, not to a count, so they never make a build unfinished. Pure.
 */
import { CHICKEN_UNIVERSE_ID } from '@/calculations/habPurchasePlan';
import { HYPERLOOP_ID } from '@/calculations/vehiclePurchasePlan';
import {
  calculateMaxTrainLength,
  calculateMaxVehicleSlots,
  getFleetSizeResearches,
  getGravitonCouplingResearch,
} from '@/calculations/shippingCapacity';
import type { CurrentFarmState, ResearchLevels } from '@/types';

/** What the build still has to buy, in the order the words say it. */
export type BuildPart = 'vehicles' | 'habs';

/** Every fleet-size and graviton coupling research at its top level. */
function fleetResearchMaxed(): ResearchLevels {
  const levels: ResearchLevels = {};
  for (const r of getFleetSizeResearches()) levels[r.id] = r.maxLevel;
  const g = getGravitonCouplingResearch();
  if (g) levels[g.id] = g.maxLevel;
  return levels;
}

/** The parts of the save's build not finished yet ([] when finished); null without a virtue farm. */
export function buildLeft(farm: Pick<CurrentFarmState, 'habs' | 'vehicles'> | null | undefined): BuildPart[] | null {
  if (!farm) return null;
  const left: BuildPart[] = [];
  const max = fleetResearchMaxed();
  const slots = calculateMaxVehicleSlots(max);
  const train = calculateMaxTrainLength(max);
  const vehicles = farm.vehicles ?? [];
  for (let i = 0; i < slots; i++) {
    const v = vehicles[i];
    if (!v || v.vehicleId !== HYPERLOOP_ID || !((v.trainLength ?? 1) >= train)) {
      left.push('vehicles');
      break;
    }
  }
  const habs = farm.habs ?? [];
  if (habs.length < 4 || habs.slice(0, 4).some(h => h !== CHICKEN_UNIVERSE_ID)) left.push('habs');
  return left;
}

/** "vehicles and habs", "vehicles". */
export function buildLeftWords(left: readonly string[]): string {
  return left.length <= 1 ? (left[0] ?? '') : `${left.slice(0, -1).join(', ')} and ${left[left.length - 1]}`;
}
