/**
 * Joo's starting-TE override (fcc9e764, `stores/autoPlanner.ts` `teOverride`) belongs to one account.
 *
 * WHY (spec-joo-fcc9, 22 Oct 2026). The planner store is not reset when another save loads, and Joo's
 * Virtue Progress card put the override back over every backup refresh, so after switching accounts the
 * second account's plan started from the first one's TE. And the saved override was read once per page
 * load, so switching back lost it until a reload. Here the override follows the save that is loaded: a
 * different account gets its own saved override, or none, read from the cache every time.
 *
 * Called when the Auto Planner sets an account up (lib/modes/planFuture.ts), so every Auto Planner screen
 * and the searches start from the same TE, not only Single run once its card has mounted; and from that
 * card (VirtueProgressSection.vue) on mount and when the save changes.
 */
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { useInitialStateStore } from '@/stores/initialState';
import { accountOf } from '@/search/runSaves';
import { loadAutoPlannerTEOverride } from '@/lib/autoPlannerFormCache';
import { saveTEOf } from '@/lib/saveFreshness';
import { VIRTUE_TE_ORDER } from '@/stores/truthEggs';

/** Makes `teOverride` this save's own. True when the loaded account has an override to apply. */
export function syncTEOverrideToAccount(): boolean {
  const planner = useAutoPlannerStore();
  const initialState = useInitialStateStore();
  const account = accountOf(initialState.rawBackup);
  if (account && planner.teOverrideAccount !== account) {
    planner.teOverrideAccount = account;
    planner.teOverride = loadAutoPlannerTEOverride(initialState.playerId);
  }
  return !!planner.teOverride;
}

/**
 * The TE the Auto Planner sets this save up to start from: this account's override when it has one (claimed TE
 * only, put back over the rolled-up save, lib/modes/planFuture.ts 4b), else the save's own TE (pending counted).
 * What "the stores hold this save set up" is checked against (useNowPage `storeReady`, App `storesSetUpFromSave`):
 * against the save's TE alone, an override on left My runs waiting for good (spec-overridestart, 7 Nov 2026).
 */
export function plannerStartTEOf(raw: unknown): number {
  const planner = useAutoPlannerStore();
  const override = planner.teOverride;
  const account = accountOf(raw);
  if (override && account && planner.teOverrideAccount === account)
    return VIRTUE_TE_ORDER.reduce((sum, egg) => sum + (override[egg] ?? 0), 0);
  return saveTEOf(raw);
}
