/**
 * IS THE SAVE'S BUILD FINISHED? (27 Oct 2026, pieha and Jordan: mid-ascension with not all vehicles bought, Right now
 * said "Shift to Curiosity" and the delivery loop, no build-up.) Read from the save's virtue farm (lib/farmFacts.ts
 * `saveFarmOf`) and its rates at full habs (lib/nextTeEgg.ts `shiftRates`):
 *
 *   habs      unfinished while any hab isn't a Chicken Universe (the standard build's target, auto/buildUp.ts)
 *   vehicles  unfinished only while the farm can't ship what it lays at full habs (shipping below laying)
 *
 * LOOSENED (28 Oct 2026, Jordan: a producing farm on Curiosity at 196 TE, habs full, a few slots short of a full
 * hyperloop, read "Keep building: vehicles until about Nov 14" for 17 days). A farm whose delivery is limited by
 * laying, not shipping, is built, whatever its slots. Without the rates, vehicles never count. Silos are bought within
 * a budget, not to a count, so they never make a build unfinished. Pure.
 */
import { CHICKEN_UNIVERSE_ID } from '@/calculations/habPurchasePlan';
import type { CurrentFarmState } from '@/types';
import type { ShiftRates } from './nextTeEgg';

/** What the build still has to buy, in the order the words say it. */
export type BuildPart = 'vehicles' | 'habs';

/** Shipping is below laying when delivery at full habs (min of the two) is short of laying by more than this share. */
const SHIP_SHORT = 1e-6;

/** The parts of the save's build not finished yet ([] when finished); null without a virtue farm. */
export function buildLeft(
  farm: Pick<CurrentFarmState, 'habs'> | null | undefined,
  rates: Pick<ShiftRates, 'maxHabs' | 'perChicken' | 'maxElr'> | null | undefined
): BuildPart[] | null {
  if (!farm) return null;
  const left: BuildPart[] = [];
  const laying = rates ? rates.perChicken * rates.maxHabs : NaN;
  if (rates && laying > 0 && rates.maxElr < laying * (1 - SHIP_SHORT)) left.push('vehicles');
  const habs = farm.habs ?? [];
  if (habs.length < 4 || habs.slice(0, 4).some(h => h !== CHICKEN_UNIVERSE_ID)) left.push('habs');
  return left;
}

/** "vehicles and habs", "vehicles". */
export function buildLeftWords(left: readonly string[]): string {
  return left.length <= 1 ? (left[0] ?? '') : `${left.slice(0, -1).join(', ')} and ${left[left.length - 1]}`;
}
