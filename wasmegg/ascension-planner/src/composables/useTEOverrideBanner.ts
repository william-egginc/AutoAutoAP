/**
 * The starting-TE override banner (components/auto/TeOverrideBanner.vue; spec-overridebanner, 7 Nov 2026): whether
 * this account's override is on, its TE and the save's, and Remove.
 *
 * WHY. Jordan's override (197, claimed TE only) made every Auto Planner screen and My runs plan from 197 while his save
 * said 198, and only Single run's Virtue Progress card said so. The banner sits at the top of Fastest, By a date,
 * Single run and My runs.
 *
 * "On" is lib/teOverrideAccount.ts `plannerStartTEOf`'s own test (an override, a loaded account, the override set up
 * for that account), which decides the TE every screen is set up from (App `storesSetUpFromSave`, useNowPage
 * `storeReady`), so the banner shows exactly while plans start from the override. It is restated here, not exported
 * from there, because that file is a result code hash input and this one must not be (lib/resultCodeHash.ts): the
 * spec (TeOverrideBanner.spec.ts) checks the two agree case by case.
 *
 * Not a hash input: src/composables files are only when RESULT_CODE_FILES names them.
 */
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { useInitialStateStore } from '@/stores/initialState';
import { accountOf } from '@/search/runSaves';
import { saveTEOf } from '@/lib/saveFreshness';
import { VIRTUE_TE_ORDER } from '@/stores/truthEggs';
import { applyAutoStartingTE } from '@/auto/startingTE';
import { saveAutoPlannerTEInputs } from '@/lib/autoPlannerFormCache';

export interface TEOverrideBanner {
  /** The TE plans start from: the override's claimed TE, summed. */
  overrideTE: number;
  /** The save's own TE (pending counted, lib/saveFreshness.ts `saveTEOf`), or null when the save holds no virtue progress. */
  saveTE: number | null;
}

/** The banner, or null while no override of this account's is on. Reads the stores, so a computed follows it. */
export function teOverrideBannerOf(): TEOverrideBanner | null {
  const planner = useAutoPlannerStore();
  const raw = useInitialStateStore().rawBackup;
  const override = planner.teOverride;
  const account = accountOf(raw);
  if (!(override && account && planner.teOverrideAccount === account)) return null;
  const overrideTE = VIRTUE_TE_ORDER.reduce((sum, egg) => sum + (override[egg] ?? 0), 0);
  const hasVirtue = !!(raw as { virtue?: unknown } | null)?.virtue;
  return { overrideTE, saveTE: hasVirtue ? saveTEOf(raw) : null };
}

/**
 * Remove: Virtue Progress's Remove Override (VirtueProgressSection.vue `removeOverride`, Joo's card, read only), step
 * for step, since it is that component's own function and no store action: the override cleared, the stores set up
 * from the save again (auto/startingTE.ts `applyAutoStartingTE`), and this account's kept override forgotten
 * (`cacheTEOverride` with none: lib/autoPlannerFormCache.ts `saveAutoPlannerTEInputs(playerId, null)`). The spec
 * pins Virtue Progress's function to these three steps.
 */
export async function removeTEOverride(): Promise<void> {
  const planner = useAutoPlannerStore();
  const initialState = useInitialStateStore();
  planner.teOverride = null;
  const applied = applyAutoStartingTE();
  saveAutoPlannerTEInputs(initialState.playerId, null);
  await applied;
}
