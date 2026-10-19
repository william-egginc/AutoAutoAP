/**
 * Continue current ascension as the instant answer's first leg (from the AutoAutoAP fork's
 * search/leg.ts `continueTailParams` and lib/saveAge.ts). No build and no sale: the farm lays at its
 * own delivery rate from where the save's eggs stand, caught up from the farm's last sync to the plan
 * start. `tailTo` / `sweepTails` on this give continue's time to any checkpoint.
 *
 * The farm is set up exactly as Joo's Auto Planner sets up its A1 "Continue Current" (auto/
 * useAscensionGenerator.ts): the farm state from the save, the artifact loadout worn, ELR from his
 * computeSnapshot. One difference, kept on purpose: the catch-up here stops at what the silos hold
 * (the game credits no more time away), where his `runContinueCurrent` credits the whole gap. On a
 * save older than its silos, leg 1 here and his plan's can differ (the card says to load a fresh save).
 */
import type { EngineState, SimulationContext } from '@/engine/types';
import type { CurrentFarmState, VirtueEgg } from '@/types';
import type { ei } from 'lib';
import { computeSnapshot } from '@/engine/compute';
import { getArtifactLoadoutFromBackup, getOptimalEarningsSet } from '@/lib/artifacts';
import { totalAwayTime } from '@/stores/silos';
import { EGG_ORDER, type BuildParams } from './precomputedLeg';

/** The farm's egg (Joo's VIRTUE_EGGS_MAP). */
const VIRTUE_EGGS: Record<number, VirtueEgg> = {
  50: 'curiosity',
  51: 'integrity',
  52: 'humility',
  53: 'resilience',
  54: 'kindness',
};

/** Seconds of time away the silos hold: silo count x the per-silo time Silo Capacity research sets. */
export function siloSeconds(siloCount: number | null | undefined, siloCapacityLevel: number | null | undefined): number {
  return totalAwayTime(Math.max(1, siloCount || 1), siloCapacityLevel || 0) * 60;
}

/** Seconds of offline progress to credit between a sync and a plan start: capped at the silos. */
export function catchUpSeconds(syncSeconds: number, startSeconds: number, silo: number): number {
  if (!(syncSeconds > 1e9) || !(startSeconds > syncSeconds)) return 0;
  return Math.min(startSeconds - syncSeconds, Math.max(0, silo));
}

/** True when the farm is on a virtue egg: the instant answer then offers continue for leg 1. */
export function hasVirtueFarm(farm: CurrentFarmState | null | undefined): boolean {
  return !!farm && VIRTUE_EGGS[farm.eggType] !== undefined;
}

/**
 * The continue tail, or null without a virtue farm or with no delivery. `base`: Joo's base engine
 * state (createBaseEngineState), its eggs replaced by `delivered` (the save's, EGG_ORDER) so the tail
 * starts from the same counts as the fresh build.
 */
export function continueTail(o: {
  farm: CurrentFarmState | null;
  backup: ei.IBackup | null;
  base: EngineState;
  context: SimulationContext;
  start: number;
  delivered: number[];
}): BuildParams | null {
  const farm = o.farm;
  if (!farm || !hasVirtueFarm(farm)) return null;
  const loadout = o.backup ? getArtifactLoadoutFromBackup(o.backup) : o.base.artifactLoadout;
  const earnings = o.backup ? getOptimalEarningsSet(o.backup) : o.base.artifactSets.earnings || null;
  const eggs = Object.fromEntries(EGG_ORDER.map((e, i) => [e, o.delivered[i] || 0])) as Record<VirtueEgg, number>;
  const state: EngineState = {
    ...JSON.parse(JSON.stringify(o.base)),
    currentEgg: VIRTUE_EGGS[farm.eggType],
    vehicles: farm.vehicles || [{ vehicleId: 0, trainLength: 1 }],
    habIds: farm.habs || [0, null, null, null],
    researchLevels: { ...farm.commonResearches },
    siloCount: farm.numSilos || 1,
    artifactLoadout: loadout.map(s => ({ artifactId: s.artifactId, stones: [...s.stones] })),
    activeArtifactSet: 'elr',
    artifactSets: {
      earnings: earnings ? JSON.parse(JSON.stringify(earnings)) : null,
      elr: JSON.parse(JSON.stringify(loadout)),
    },
    eggsDelivered: eggs,
    population: farm.population || 0,
    lastStepTime: farm.lastStepTime || 0,
    bankValue: farm.cash || 0,
    activeSales: { research: false, hab: false, vehicle: false },
    earningsBoost: { active: false, multiplier: 1 },
  };
  const ctx: SimulationContext = { ...o.context, ascensionStartTime: o.start, planStartOffset: 0 };
  const elr = computeSnapshot(state, ctx, { skipGrowth: true }).elr;
  if (!(elr > 0)) return null;
  const delivered = { ...eggs };
  const egg = state.currentEgg as VirtueEgg;
  delivered[egg] +=
    elr * catchUpSeconds(state.lastStepTime, o.start, siloSeconds(state.siloCount, ctx.epicResearchLevels?.['silo_capacity']));
  return { sales: 0, tier13: false, waitStart: 0, saleEnd: 0, peakELR: elr, delivered: EGG_ORDER.map(e => delivered[e] || 0) };
}

/** One line about the save's age at the plan start, or null when it is fresh (under an hour). */
export function staleSaveNote(syncSeconds: number | null | undefined, startSeconds: number, silo: number): string | null {
  if (!syncSeconds || !(syncSeconds > 1e9)) return null;
  const gap = startSeconds - syncSeconds;
  if (gap < 3600) return null;
  const h = gap / 3600;
  const age = h < 48 ? `${Math.round(h)} hours` : `${Math.round(h / 24)} days`;
  return gap > silo
    ? `Your save is ${age} old, longer than your silos hold, so these answers (and the Auto Planner's) won't be accurate: open Egg, Inc., let it sync, then load a fresh save.`
    : `Your save is ${age} old: anything you bought since is not in it. Load a fresh save if you have played.`;
}
