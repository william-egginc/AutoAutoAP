/**
 * @module initPlanFuture
 * @description Mode B: Plan Future Ascension
 *
 * Contract:
 * - Fresh backup loaded for global progress (epic research, artifacts, TE, fuel)
 * - Pending TE rolled into earned TE (claimed at ascension)
 * - Farm-specific stores ZEROED (research, habs, vehicles, silos, bank)
 * - Start action: egg=curiosity, no farm state, no quick continue
 * - Ascension date/time = now
 * - Artifacts: optimal earnings set
 * - "Wait for Full Habs" auto-added by setInitialSnapshot
 *
 * Key invariant: currentFarmState is populated by loadFromBackup but NOT used
 * (isContinuing=false, start action has no farm state).
 */

import { resetAllStores } from './reset';
import { fetchPlayerBackup } from './fetchBackup';
import { loadAndSyncBackup, rollUpPendingTE } from './utils';
import type { ei } from 'lib';
import { useActionsStore } from '@/stores/actions';
import { useVirtueStore } from '@/stores/virtue';
import { computeSnapshot } from '@/engine/compute';
import { getSimulationContext, createBaseEngineState } from '@/engine/adapter';
import { syncTEOverrideToAccount } from '@/lib/teOverrideAccount';
import { applyAutoStartingTE } from '@/auto/startingTE';
import { useInitialStateStore } from '@/stores/initialState';
import type { StartSource } from '@/search/startProvenance';

/**
 * @param stored A save kept in this browser (search/runSaves.ts) to load INSTEAD of fetching one:
 *   carrying on an interrupted run under the exact save it started with.
 * @param source Where the save came from, for the start's provenance (search/startProvenance.ts): 'fresh'
 *   when fetched here, else 'stored' unless the caller says otherwise (a file the player loaded; a save an
 *   account switch fetched a moment ago).
 */
export async function initPlanFuture(playerId: string, stored?: ei.IBackup, source?: StartSource): Promise<void> {
  // 2 first when it can fail: a fetch that throws after the reset left the planner with no save at
  // all and the previous plan's leftovers on screen.
  const backup = stored ?? (await fetchPlayerBackup(playerId)).backup;

  // 1. Clean slate
  await resetAllStores();

  // 3. Load global progress from backup and sync stores
  loadAndSyncBackup(playerId, backup, 'plan_next');

  // 4. Roll pending TE into earned (they'll be claimed at ascension)
  rollUpPendingTE();

  // 4b. This account's starting-TE override, if it set one (Joo's fcc9e764; lib/teOverrideAccount.ts), so
  //     every Auto Planner screen and search starts from it, not only Single run once its card mounts.
  if (syncTEOverrideToAccount()) await applyAutoStartingTE({ refreshSnapshot: false });

  // 5. Plan-specific setup
  const virtueStore = useVirtueStore();
  virtueStore.resetToCurrentDateTime();
  virtueStore.setBankValue(0);
  virtueStore.setCurrentEgg('curiosity');

  // 6. Ensure start action is clean (resetAllStores already did this, but explicit)
  const actionsStore = useActionsStore();
  const startAction = actionsStore.getStartAction();
  if (startAction) {
    startAction.payload.initialFarmState = undefined;
    startAction.payload.isQuickContinue = false;
    startAction.payload.initialEgg = 'curiosity';
  }

  // 7. Compute and set initial snapshot
  const context = getSimulationContext();
  const baseState = createBaseEngineState(null);
  const initialSnapshot = computeSnapshot(baseState, context);
  await actionsStore.setInitialSnapshot(initialSnapshot);

  // 8. Set up the Auto Planner's way: the instant answer may run from it now (stores/chainSearch.ts `startWait`).
  useInitialStateStore().markSetUp(source ?? (stored ? 'stored' : 'fresh'));
}
