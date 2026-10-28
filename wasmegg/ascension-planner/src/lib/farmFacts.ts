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
import { countTEThresholdsPassed, getThresholdForTE, nextTEThreshold, TE_BREAKPOINTS } from '@/lib/truthEggs';
import { totalAwayTime } from '@/stores/silos';
import type { CurrentFarmState, ResearchLevels, VehicleSlot } from '@/types';
import { SAVE_EGG_ORDER } from './nowPlan';
import { relativeWords } from './eventWhen';
import { compactDuration } from './duration';

/** The farm fields of a save read here (ei.IBackup's, loosely). */
interface RawFarm {
  eggType?: number | null;
  commonResearch?: { id?: string | null; level?: number | null }[] | null;
  habs?: (number | null)[] | null;
  habPopulation?: (number | null)[] | null;
  numChickens?: number | null;
  vehicles?: (number | null)[] | null;
  trainLength?: (number | null)[] | null;
  silosOwned?: number | null;
  unclaimedCash?: number | null;
  cashEarned?: number | null;
  cashSpent?: number | null;
  eggsLaid?: number | null;
  lastStepTime?: number | null;
}

/**
 * The save's virtue farm (egg types 50 to 54) as the save itself has it, read the way the initial-state store's
 * `loadFromBackup` reads it; null when the save isn't on one. Not the store's `currentFarmState`: after an account
 * switch `catchUpFarmState` moves its population and delivered count on to "now", and on a page load it can be a
 * restored Manual draft's farm (ui fix 21). Pure.
 */
export function saveFarmOf(raw: unknown): CurrentFarmState | null {
  const farms = (raw as { farms?: RawFarm[] | null } | null | undefined)?.farms;
  if (!Array.isArray(farms)) return null;
  const farm = farms.find(f => f && typeof f.eggType === 'number' && f.eggType >= 50 && f.eggType <= 54);
  if (!farm) return null;
  const commonResearches: ResearchLevels = {};
  for (const r of farm.commonResearch ?? []) if (r?.id && r.level != null) commonResearches[r.id] = r.level;
  const habs = (farm.habs ?? []).map(h => (h === 19 ? null : (h as number | null)));
  while (habs.length < 4) habs.push(null);
  const train = farm.trainLength ?? [];
  const vehicles: VehicleSlot[] = (farm.vehicles ?? []).map((v, i) => ({ vehicleId: v as number | null, trainLength: train[i] || 1 }));
  const population = Array.isArray(farm.habPopulation)
    ? farm.habPopulation.reduce<number>((a, p) => a + (p || 0), 0)
    : farm.numChickens || 0;
  return {
    eggType: farm.eggType as number,
    cash: farm.unclaimedCash || Math.max(0, (farm.cashEarned || 0) - (farm.cashSpent || 0)),
    numSilos: farm.silosOwned || 1,
    commonResearches,
    habs,
    vehicles,
    population,
    deliveredEggs: farm.eggsLaid || 0,
    lastStepTime: farm.lastStepTime || 0,
    cashEarned: farm.cashEarned || 0,
    cashSpent: farm.cashSpent || 0,
  };
}

/** The save's own eggs delivered and claimed TE per virtue egg, by name (`eggLines`' inputs); empty without one. */
export function saveEggCountsOf(raw: unknown): { delivered: Record<string, number>; earned: Record<string, number> } {
  const v = (raw as { virtue?: { eggsDelivered?: (number | null)[] | null; eovEarned?: (number | null)[] | null } | null } | null)
    ?.virtue;
  const delivered: Record<string, number> = {};
  const earned: Record<string, number> = {};
  if (!v) return { delivered, earned };
  SAVE_EGG_ORDER.forEach((egg, i) => {
    delivered[egg] = v.eggsDelivered?.[i] ?? 0;
    earned[egg] = v.eovEarned?.[i] ?? 0;
  });
  return { delivered, earned };
}

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
  /** The farm's last step in the save (unix seconds; the silos were full then), 0 without one. lib/farmNow.ts. */
  stepSeconds?: number;
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
    stepSeconds: farm.lastStepTime || 0,
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
  /** Seconds after the save the goal comes if every TE still to earn came from this egg at the save's rate (the egg
   *  being laid, with a goal given; ux29-d): null when unknown, reached, or past the egg's last threshold. */
  goalInSeconds?: number | null;
}

/** The five eggs in the save's order. */
export function eggLines(
  delivered: Partial<Record<string, number>>,
  earned: Partial<Record<string, number>>,
  currentEgg: string | null,
  elr: number | null,
  /** TE still to earn for the goal (the goal's TE less the save's), when one is known. */
  goalTeLeft: number | null = null
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
    // To goal: the egg's own thresholds (each TE costs more eggs than the last), not TE left × the next TE's time.
    const need = goalTeLeft != null && goalTeLeft > 0 ? passed + Math.ceil(goalTeLeft) : 0;
    const goalInSeconds =
      current && elr && elr > 0 && need > passed && need <= TE_BREAKPOINTS.length ? (getThresholdForTE(need) - d) / elr : null;
    return { egg, te, progress, current, nextInSeconds, goalInSeconds };
  });
}

/** Past this many days a next TE "at the save's rate" is no time to plan by (ux review 26 Oct, row 15: "next TE in
 *  57308 days"): said as "not at this rate" instead. About 10 years. */
export const NEXT_TE_CAP_DAYS = 3650;

/**
 * The line under an egg on Your eggs. Only the egg being laid gets a time; the others' next TE comes after a shift
 * (never timed "at the final rate"). `nowSeconds - saveSeconds` has already passed since the save. With a goal
 * (`goalInSeconds`, ux29-d): "next TE in 3h 20m · to goal about 4d 5h at this rate"; none over about 10 years.
 */
export function nextTeLine(e: EggLine, nowSeconds: number, saveSeconds: number): string {
  const pct = `${Math.round(e.progress * 100)}% to the next TE`;
  if (!e.current) return `${pct} · after a shift`;
  if (e.nextInSeconds == null) return pct;
  const left = e.nextInSeconds - Math.max(0, nowSeconds - saveSeconds);
  if (left <= 0) return 'next TE likely reached since your save';
  if (left > NEXT_TE_CAP_DAYS * 86400) return 'next TE: not at this rate (over 10 years)';
  const goalLeft = e.goalInSeconds != null ? e.goalInSeconds - Math.max(0, nowSeconds - saveSeconds) : null;
  if (goalLeft != null && goalLeft > left && goalLeft <= NEXT_TE_CAP_DAYS * 86400)
    return `next TE ${relativeWords(left)} · to goal about ${compactDuration(goalLeft)} at this rate`;
  return `next TE ${relativeWords(left)} at your save's rate`;
}
