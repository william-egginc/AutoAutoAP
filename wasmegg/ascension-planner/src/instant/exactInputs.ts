/**
 * The exact check's inputs (exactCheck.ts ExactInputs): the state Joo's generate()
 * (auto/useAscensionGenerator.ts) starts from, WITHOUT writing any of the page's stores.
 *
 * generate() always runs on the Auto Planner tab, which first loads the save his way
 * (lib/modes/planFuture.ts initPlanFuture: every store reset, the backup loaded in 'plan_next' mode,
 * pending TE rolled up, bank 0, egg curiosity); generate() then rolls pending TE up again (a no-op) and
 * builds his base state, context and Continue Current state from those stores.
 *
 * The page's own stores can't be read for this: what they hold depends on which load ran last (Load
 * Player Data's 'default' load plus its catch-up, the Auto tab's 'plan_next', the Manual planner's
 * modes, a restored session), and some mixes count the pending TE twice (the TE maps already rolled
 * up while the pending map still holds it) or carry a caught-up farm and another artifact set, so the
 * check started from another state than the instant answer and his planner (Jordan's main, 19 Oct:
 * "ascension 1 already reaches 223 TE" from a 192 TE save). So the inputs are built by running HIS
 * load code (loadAndSyncBackup 'plan_next', rollUpPendingTE, createBaseEngineState) on the page's
 * loaded backup inside a separate, throw-away Pinia: synchronously (nothing else can run in between),
 * with the page's Pinia made active again before returning. The page's stores are only read for the
 * backup and one Auto Planner setting.
 *
 * Only the page calls this (it needs the backup); the check itself runs in exact.worker.ts.
 */
import { toRaw } from 'vue';
import { createPinia, getActivePinia, setActivePinia, type Pinia } from 'pinia';
import { useInitialStateStore } from '@/stores/initialState';
import { useVirtueStore } from '@/stores/virtue';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { loadAndSyncBackup, rollUpPendingTE } from '@/lib/modes/utils';
import { createBaseEngineState } from '@/engine/adapter';
import { computeSnapshot } from '@/engine/compute';
import { getArtifactLoadoutFromBackup, getOptimalEarningsSet } from '@/lib/artifacts';
import type { EngineState, SimulationContext } from '@/engine/types';
import type { VirtueEgg } from '@/types';
import type { ei } from 'lib';
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
const sum = (o: Record<string, number> | undefined): number => Object.values(o ?? {}).reduce((a, b) => a + b, 0);

/** What generate() starts from, for one save (plain data). */
export interface GenerateStart {
  /** createBaseEngineState(null) after initPlanFuture + rollUpPendingTE. */
  base: EngineState;
  /** getSimulationContext() then (without the raw backup: the caller adds it). */
  context: Omit<SimulationContext, 'rawBackup'>;
  /** His Continue Current A1 state, or null without a virtue farm. */
  continueState: EngineState | null;
  /** His `currentTE`: the TE of the snapshot initPlanFuture/generate set (computeSnapshot of the base). */
  currentTE: number;
}

/**
 * Joo's own Auto-tab load and generate() set-up on `backup`, in a throw-away Pinia (see the file
 * comment). `deferForEarningsMode` is the player's Auto Planner setting (his context carries it).
 * The active Pinia is put back before this returns, even when it throws.
 */
export function generateStart(backup: ei.IBackup, opts: { playerId?: string; deferForEarningsMode?: boolean } = {}): GenerateStart {
  const page: Pinia | undefined = getActivePinia();
  const scratch = createPinia();
  setActivePinia(scratch);
  try {
    // initPlanFuture, minus the fetch (the page's loaded backup) and the actions store.
    loadAndSyncBackup(opts.playerId ?? '', backup, 'plan_next');
    rollUpPendingTE();
    const virtue = useVirtueStore();
    virtue.resetToCurrentDateTime();
    virtue.setBankValue(0);
    virtue.setCurrentEgg('curiosity');
    // generate(): rollUpPendingTE() again (nothing pending now), then his base and context.
    rollUpPendingTE();
    const initialState = useInitialStateStore();
    const base = plain(createBaseEngineState(null));
    // getSimulationContext() (engine/adapter.ts) on these stores; planStartOffset is 0 as generate()
    // sets it per ascension, and the defer setting is the player's own.
    const context: Omit<SimulationContext, 'rawBackup'> = plain({
      epicResearchLevels: initialState.epicResearchLevels,
      colleggtibleModifiers: initialState.colleggtibleModifiers,
      ascensionStartTime: Math.floor(Date.now() / 1000),
      planStartOffset: 0,
      assumeDoubleEarnings: initialState.assumeDoubleEarnings,
      deferForEarningsMode: opts.deferForEarningsMode ?? false,
    });
    const currentTE = sum(computeSnapshot(base, { ...context, rawBackup: backup } as SimulationContext).teEarned);

    let continueState: EngineState | null = null;
    const farm = initialState.currentFarmState;
    if (farm && VIRTUE_EGGS_MAP[farm.eggType]) {
      const rawLoadout = getArtifactLoadoutFromBackup(backup);
      const optimalEarnings = getOptimalEarningsSet(backup);
      continueState = plain({
        currentEgg: VIRTUE_EGGS_MAP[farm.eggType] || 'curiosity',
        shiftCount: base.shiftCount,
        te: base.te,
        soulEggs: base.soulEggs,
        vehicles: farm.vehicles || [{ vehicleId: 0, trainLength: 1 }],
        habIds: farm.habs || [0, null, null, null],
        researchLevels: { ...farm.commonResearches },
        siloCount: farm.numSilos || 1,
        tankLevel: base.tankLevel,
        artifactLoadout: rawLoadout.map(slot => ({ artifactId: slot.artifactId, stones: [...slot.stones] })),
        activeArtifactSet: 'elr',
        artifactSets: { earnings: optimalEarnings, elr: rawLoadout },
        fuelTankAmounts: { ...base.fuelTankAmounts },
        eggsDelivered: { ...base.eggsDelivered },
        teEarned: { ...base.teEarned },
        population: farm.population || 0,
        lastStepTime: farm.lastStepTime || 0,
        bankValue: farm.cash || 0,
        activeSales: { research: false, hab: false, vehicle: false },
        earningsBoost: { active: false, multiplier: 1 },
      } as EngineState);
    }
    // Its effects end with it (no store of the page was used).
    (scratch as unknown as { _e?: { stop(): void } })._e?.stop();
    return { base, context, continueState, currentTE };
  } finally {
    if (page) setActivePinia(page);
  }
}

/** The inputs for one route, read now. `start`: unix seconds (rounded up to the minute, as his form). */
export function exactInputsFromStores(route: { chain: number[]; a1: string; start: number }): ExactInputs {
  const pageState = useInitialStateStore();
  const backup = pageState.rawBackup ? (toRaw(pageState.rawBackup) as ei.IBackup) : null;
  if (!backup) throw new Error('no save is loaded (load your player data first)');
  const deferForEarningsMode = useAutoPlannerStore().deferForEarningsMode;
  const g = generateStart(backup, { playerId: pageState.playerId, deferForEarningsMode });

  return {
    chain: [...route.chain],
    a1: route.a1,
    start: Math.ceil(route.start / 60) * 60,
    now: Math.floor(Date.now() / 1000),
    // structuredClone (postMessage) keeps the backup's numbers and enums as they are (JSON would not).
    context: { ...g.context, rawBackup: structuredClone(backup) } as SimulationContext,
    backupBase: g.base,
    continueState: g.continueState,
    currentTE: g.currentTE,
  };
}
