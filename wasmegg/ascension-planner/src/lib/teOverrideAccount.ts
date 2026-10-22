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
