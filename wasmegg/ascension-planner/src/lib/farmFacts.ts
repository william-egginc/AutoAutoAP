/**
 * My runs' "Your eggs" block (spec myruns-now v3, section 3): each virtue egg's TE and the way to its next one,
 * and the farm's facts, from the LOADED SAVE only. The rates are the planner's own pure formulas
 * (src/calculations: hab capacity, lay rate, shipping, ELR), fed the save's farm, research, colleggtibles and
 * equipped artifacts: what the companion shows, worked out the same way the planner does at the save's moment.
 * Nothing is simulated forward: "next TE" is at the save's own rate.
 *
 * Not the actions store's initial snapshot: entering the Auto Planner sets that up as a fresh Curiosity farm
 * ("Plan Future"), not the farm in the save.
 */
import { calculateHabCapacity_Full } from '@/calculations/habCapacity';
import { calculateLayRate } from '@/calculations/layRate';
import { calculateShippingCapacity } from '@/calculations/shippingCapacity';
import { calculateEffectiveLayRate } from '@/calculations/effectiveLayRate';
import { calculateArtifactModifiers } from '@/lib/artifacts/calculator';
import type { EquippedArtifact } from '@/lib/artifacts/types';
import { countTEThresholdsPassed, getThresholdForTE, nextTEThreshold } from '@/lib/truthEggs';
import { totalAwayTime } from '@/stores/silos';
import type { CurrentFarmState, ResearchLevels } from '@/types';
import { SAVE_EGG_ORDER } from './nowPlan';

export interface FarmInput {
  farm: CurrentFarmState | null;
  epic: ResearchLevels;
  colleggtibles: { habCap: number; elr: number; shippingCap: number };
  equipped: EquippedArtifact[];
}

export interface FarmFacts {
  habCapacity: number;
  /** 0..1. */
  habFull: number;
  /** Eggs per second the farm ships (min of laying and shipping). */
  elr: number;
  /** Minutes of time away the silos hold. */
  siloMinutes: number;
}

/** Null without a virtue farm in the save. */
export function farmFacts(i: FarmInput): FarmFacts | null {
  const farm = i.farm;
  if (!farm) return null;
  const mods = calculateArtifactModifiers(i.equipped);
  const hab = calculateHabCapacity_Full({
    habIds: farm.habs,
    researchLevels: farm.commonResearches,
    habCapMultiplier: i.colleggtibles.habCap,
    artifactMultiplier: mods.habCapacity.totalMultiplier,
    artifactEffects: mods.habCapacity.effects,
  });
  const lay = calculateLayRate({
    researchLevels: farm.commonResearches,
    epicComfyNestsLevel: i.epic['epic_egg_laying'] || 0,
    elrMultiplier: i.colleggtibles.elr,
    population: farm.population,
    artifactMultiplier: mods.eggLayingRate.totalMultiplier,
    artifactEffects: mods.eggLayingRate.effects,
  });
  const ship = calculateShippingCapacity({
    vehicles: farm.vehicles,
    researchLevels: farm.commonResearches,
    transportationLobbyistLevel: i.epic['transportation_lobbyist'] || 0,
    shippingCapMultiplier: i.colleggtibles.shippingCap,
    artifactMultiplier: mods.shippingRate.totalMultiplier,
    artifactEffects: mods.shippingRate.effects,
  });
  const elr = calculateEffectiveLayRate(lay.totalRatePerSecond, ship.totalFinalCapacity);
  const cap = hab.totalFinalCapacity;
  return {
    habCapacity: cap,
    habFull: cap > 0 ? Math.min(1, farm.population / cap) : 0,
    elr: elr.effectiveLayRate,
    siloMinutes: totalAwayTime(Math.max(1, farm.numSilos || 1), i.epic['silo_capacity'] || 0),
  };
}

export interface EggLine {
  egg: (typeof SAVE_EGG_ORDER)[number];
  /** Lifetime TE as the game counts it: claimed, or thresholds passed if more. */
  te: number;
  /** 0..1 of the way from this TE's threshold to the next. */
  progress: number;
  /** The farm is laying it in the save. */
  current: boolean;
  /** Seconds after the save the next TE comes at the save's rate (the egg being laid only); null otherwise. */
  nextInSeconds: number | null;
}

/** The five eggs in the save's order. */
export function eggLines(
  delivered: Partial<Record<string, number>>,
  earned: Partial<Record<string, number>>,
  currentEgg: string | null,
  elr: number | null
): EggLine[] {
  return SAVE_EGG_ORDER.map(egg => {
    const d = delivered[egg] ?? 0;
    const passed = countTEThresholdsPassed(d);
    const te = Math.max(earned[egg] ?? 0, passed);
    const lo = getThresholdForTE(passed);
    const hi = nextTEThreshold(d);
    const progress = Number.isFinite(hi) && hi > lo ? Math.min(1, Math.max(0, (d - lo) / (hi - lo))) : 1;
    const current = egg === currentEgg;
    const nextInSeconds = current && elr && elr > 0 && Number.isFinite(hi) ? (hi - d) / elr : null;
    return { egg, te, progress, current, nextInSeconds };
  });
}
