/**
 * The save as loaded, read straight from the raw backup: the instant answer's inputs.
 *
 * Why not the store: Joo's Continue Current load (lib/modes/continueCurrent.ts -> utils.ts
 * `catchUpFarmState`) rewrites `initialState.currentFarmState` IN PLACE (population, cash,
 * eggs laid, lastStepTime = now) and `initialEggsDelivered`, and `rollUpPendingTE` rewrites the TE
 * maps. Reading those, the answer changed depending on whether his Auto tab had been opened. The
 * raw backup is never mutated (a fresh fetch replaces it with a new object), so the same backup
 * always gives the same answer.
 *
 * `farmFromBackup` and `eggsDeliveredFromBackup` are the same parse as initialState.loadFromBackup
 * (saveFarm.spec.ts checks they agree on one backup).
 */
import type { ei } from 'lib';
import type { EngineState } from '@/engine/types';
import type { CurrentFarmState, ResearchLevels, VehicleSlot, VirtueEgg } from '@/types';

const EGGS: VirtueEgg[] = ['curiosity', 'integrity', 'humility', 'resilience', 'kindness'];

/** Per-egg map from one of the backup's five-long arrays (Curiosity, Integrity, Humility, Resilience, Kindness). */
function perEgg(a: (number | null | undefined)[] | null | undefined, offset = 0): Record<VirtueEgg, number> {
  return Object.fromEntries(EGGS.map((e, i) => [e, a?.[offset + i] ?? 0])) as Record<VirtueEgg, number>;
}

/** Eggs delivered per egg, as the save holds them. */
export function eggsDeliveredFromBackup(backup: ei.IBackup | null | undefined): Record<VirtueEgg, number> {
  return perEgg(backup?.virtue?.eggsDelivered);
}

/** The virtue farm in progress (egg 50-54) as the save holds it, or null. */
export function farmFromBackup(backup: ei.IBackup | null | undefined): CurrentFarmState | null {
  const farm = backup?.farms?.find(f => f.eggType && f.eggType >= 50 && f.eggType <= 54);
  if (!farm) return null;
  const commonResearches: ResearchLevels = {};
  for (const r of farm.commonResearch || []) {
    if (r.id && r.level !== null && r.level !== undefined) commonResearches[r.id] = r.level;
  }
  const habs: (number | null)[] = (farm.habs || []).map(h => ((h as number) === 19 ? null : (h as number)));
  while (habs.length < 4) habs.push(null);
  const trainLength = farm.trainLength || [];
  const vehicles: VehicleSlot[] = (farm.vehicles || []).map((v, i) => ({
    vehicleId: v as number | null,
    trainLength: trainLength[i] || 1,
  }));
  let population = farm.numChickens || 0;
  if (farm.habPopulation && Array.isArray(farm.habPopulation)) {
    population = farm.habPopulation.reduce((sum: number, p: number) => sum + (p || 0), 0);
  }
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

/**
 * The engine state before any action, from the backup alone (what continueTail.ts takes as `base`;
 * it replaces the farm, loadout, eggs and cash itself). Replaces createBaseEngineState(null), which
 * reads stores Joo's loads rewrite.
 */
export function baseStateFromBackup(backup: ei.IBackup | null | undefined): EngineState {
  const teEarned = perEgg(backup?.virtue?.eovEarned);
  return {
    currentEgg: 'curiosity',
    shiftCount: backup?.virtue?.shiftCount ?? 0,
    te: EGGS.reduce((n, e) => n + teEarned[e], 0),
    soulEggs: backup?.game?.soulEggsD || 0,
    bankValue: 0,
    habIds: [0, null, null, null],
    vehicles: [{ vehicleId: 0, trainLength: 1 }],
    researchLevels: {},
    siloCount: 1,
    tankLevel: backup?.artifacts?.tankLevel ?? 0,
    artifactLoadout: [],
    activeArtifactSet: 'elr',
    artifactSets: { earnings: null, elr: null },
    fuelTankAmounts: perEgg(backup?.virtue?.afx?.tankFuels, 20),
    eggsDelivered: eggsDeliveredFromBackup(backup),
    teEarned,
    population: 0,
    lastStepTime: 0,
    activeSales: { research: false, hab: false, vehicle: false },
    earningsBoost: { active: false, multiplier: 1 },
  };
}

/** When the save was last synced: the farm's last step when on a virtue farm, else the backup time. */
export function saveSyncSeconds(backup: ei.IBackup | null | undefined): number {
  const farm = farmFromBackup(backup);
  if (farm?.lastStepTime) return farm.lastStepTime;
  return backup?.settings?.lastBackupTime || backup?.approxTime || 0;
}
