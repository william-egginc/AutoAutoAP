/**
 * The exact check's inputs (exactCheck.ts ExactInputs), read from the page's stores the way Joo's
 * generate() (auto/useAscensionGenerator.ts) reads them, WITHOUT writing any store:
 *
 * - his rollUpPendingTE() (lib/modes/utils.ts) moves each egg's pending TE into the TE maps of the
 *   truthEggs / initialState / virtue stores before every run; `rolledUp` is the same arithmetic on
 *   copies, so the base state is what his createBaseEngineState(null) returns after it;
 * - the context is his getSimulationContext() (read-only), copied to plain data for the worker;
 * - Continue Current's A1 state is built as his generate() builds `continueState`.
 *
 * Only the page calls this (it needs the stores); the check itself runs in exact.worker.ts.
 */
import { toRaw } from 'vue';
import { useInitialStateStore } from '@/stores/initialState';
import { useTruthEggsStore } from '@/stores/truthEggs';
import { useActionsStore } from '@/stores/actions';
import { getSimulationContext, createBaseEngineState } from '@/engine/adapter';
import { getArtifactLoadoutFromBackup, getOptimalEarningsSet } from '@/lib/artifacts';
import type { EngineState, SimulationContext } from '@/engine/types';
import type { VirtueEgg } from '@/types';
import type { ExactInputs } from './exactCheck';

/** His VIRTUE_EGGS_MAP. */
const VIRTUE_EGGS_MAP: Record<number, VirtueEgg> = {
  50: 'curiosity',
  51: 'integrity',
  52: 'humility',
  53: 'resilience',
  54: 'kindness',
};

const plain = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/**
 * rollUpPendingTE on copies: per egg with pending TE, min(98, initial TE earned + pending), else the
 * truthEggs store's TE; eggs delivered are the truthEggs store's.
 */
export function rolledUp(o: {
  pending: Record<string, number>;
  initialTeEarned: Record<string, number>;
  teEarned: Record<string, number>;
  eggsDelivered: Record<string, number>;
}): { teEarned: Record<string, number>; eggsDelivered: Record<string, number>; te: number } {
  const teEarned = { ...o.teEarned };
  for (const egg of Object.keys(o.pending)) {
    const p = o.pending[egg];
    if (p > 0) teEarned[egg] = Math.max(0, Math.min(98, (o.initialTeEarned[egg] || 0) + p));
  }
  const te = Object.values(teEarned).reduce((a, b) => a + b, 0);
  return { teEarned, eggsDelivered: { ...o.eggsDelivered }, te };
}

/** The inputs for one route, read now. `start`: unix seconds (rounded up to the minute, as his form). */
export function exactInputsFromStores(route: { chain: number[]; a1: string; start: number }): ExactInputs {
  const initialState = useInitialStateStore();
  const truthEggs = useTruthEggsStore();
  const actions = useActionsStore();

  const rolled = rolledUp({
    pending: initialState.initialTePending,
    initialTeEarned: initialState.initialTeEarned,
    teEarned: truthEggs.teEarned,
    eggsDelivered: truthEggs.eggsDelivered,
  });
  const base = createBaseEngineState(null);
  const backupBase: EngineState = plain({
    ...base,
    te: rolled.te,
    teEarned: rolled.teEarned as EngineState['teEarned'],
    eggsDelivered: rolled.eggsDelivered as EngineState['eggsDelivered'],
  });

  const ctx = getSimulationContext();
  const rawBackup = initialState.rawBackup ? toRaw(initialState.rawBackup) : undefined;
  const context: SimulationContext = {
    ...plain({ ...ctx, rawBackup: undefined }),
    // structuredClone (postMessage) keeps the backup's numbers and enums as they are (JSON would not).
    ...(rawBackup ? { rawBackup: structuredClone(rawBackup) } : {}),
  };

  let continueState: EngineState | null = null;
  const farm = initialState.currentFarmState;
  if (farm && VIRTUE_EGGS_MAP[farm.eggType]) {
    const rawLoadout = rawBackup ? getArtifactLoadoutFromBackup(rawBackup) : backupBase.artifactLoadout;
    const optimalEarnings = rawBackup ? getOptimalEarningsSet(rawBackup) : backupBase.artifactSets.earnings || null;
    continueState = plain({
      currentEgg: VIRTUE_EGGS_MAP[farm.eggType] || 'curiosity',
      shiftCount: backupBase.shiftCount,
      te: backupBase.te,
      soulEggs: backupBase.soulEggs,
      vehicles: farm.vehicles || [{ vehicleId: 0, trainLength: 1 }],
      habIds: farm.habs || [0, null, null, null],
      researchLevels: { ...farm.commonResearches },
      siloCount: farm.numSilos || 1,
      tankLevel: backupBase.tankLevel,
      artifactLoadout: rawLoadout.map(slot => ({ artifactId: slot.artifactId, stones: [...slot.stones] })),
      activeArtifactSet: 'elr',
      artifactSets: { earnings: optimalEarnings, elr: rawLoadout },
      fuelTankAmounts: { ...backupBase.fuelTankAmounts },
      eggsDelivered: { ...backupBase.eggsDelivered },
      teEarned: { ...backupBase.teEarned },
      population: farm.population || 0,
      lastStepTime: farm.lastStepTime || 0,
      bankValue: farm.cash || 0,
      activeSales: { research: false, hab: false, vehicle: false },
      earningsBoost: { active: false, multiplier: 1 },
    } as EngineState);
  }

  const snap = actions.effectiveSnapshot;
  const currentTE = snap?.teEarned ? Object.values(snap.teEarned).reduce((a, b) => a + b, 0) : 0;

  return {
    chain: [...route.chain],
    a1: route.a1,
    start: Math.ceil(route.start / 60) * 60,
    now: Math.floor(Date.now() / 1000),
    context,
    backupBase,
    continueState,
    currentTE,
  };
}
