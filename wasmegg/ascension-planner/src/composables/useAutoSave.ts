import { computed, watch, type Ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useInitialStateStore } from '@/stores/initialState';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useUIStore } from '@/stores/ui';
import { backupSecondsOf, saveTEOf } from '@/lib/saveFreshness';
import { initPlanFuture } from '@/lib/modes';

/**
 * The save, set up for the Auto Planner and My runs: moved out of App.vue (unchanged) so the Joo
 * site's AppJoo.vue runs the very same code instead of a copy that could drift from it.
 *
 * Call it from the page's setup where App had these functions (its watchers register there), and
 * call `startMyRuns()` at the end of the page's onMounted, once its own restore is done.
 */
export function useAutoSave(playerId: Ref<string>, searchActive: Readonly<Ref<boolean>>) {
  const initialStateStore = useInitialStateStore();
  const chainSearchStore = useChainSearchStore();
  const uiStore = useUIStore();
  const { plannerTab, loading, error } = storeToRefs(uiStore);

  /**
   * After a failed fetch, rebuild the planner from the last save that DID load (fetchBackup keeps it on
   * this device), so the older save and the plan built from it match -- rather than leaving a plan from
   * one load beside a save from another. That mismatch is how a player at 170 TE was shown 147.
   */
  async function planFromLastGoodSave(): Promise<void> {
    const older = initialStateStore.rawBackup;
    if (!playerId.value || !older) return;
    try {
      await initPlanFuture(playerId.value, older);
    } catch (e) {
      console.error('Could not rebuild the planner from the saved copy:', e);
    }
  }

  /** The fetch error in words a player can act on. The raw one names the forwarder's URL. */
  function backupFailureReason(e: unknown): string {
    const msg = e instanceof Error ? e.message : String(e);
    if (/timeout|timed out/i.test(msg)) return "the game's server didn't answer in time";
    if (/failed to fetch|network|load failed/i.test(msg)) return "the game's server couldn't be reached";
    return msg.length > 140 ? msg.slice(0, 140) + '…' : msg;
  }

  /**
   * Fetch a fresh save and set the planner up from it for the searches ("Plan Future" mode, zeroed
   * farm): what entering the Auto Planner does, and what a Science sweep does before showing its
   * figures (SweepRunner.vue). Resolves to '' when the planner is ready, else why not. A failed fetch
   * falls back to the last good save, and IntegrityNotice says so beside Start.
   */
  async function prepareAutoPlanner(): Promise<string> {
    if (!playerId.value) return 'Enter your player ID at the top of the page first.';
    // Never under a search that is running: it is pricing against the planner as it is.
    if (searchActive.value) return 'A search is running. Let it finish or stop it first.';
    if (loading.value) return 'Your save is still loading. Try again in a moment.';
    loading.value = true;
    try {
      await initPlanFuture(playerId.value);
      uiStore.staleBackup = null;
      // Back from a run's own older save: its pinned start belongs to that save, not this one.
      if (uiStore.runSaveLoaded) chainSearchStore.resetPlanStartTo(initialStateStore.rawBackup?.approxTime);
      uiStore.runSaveLoaded = null;
      return '';
    } catch (e) {
      console.error('Failed to auto-init Auto Planner:', e);
      error.value = 'Failed to load fresh backup for Auto Planner.';
      uiStore.staleBackup = backupFailureReason(e);
      await planFromLastGoodSave();
      return initialStateStore.rawBackup ? '' : `Your save could not be loaded: ${uiStore.staleBackup}.`;
    } finally {
      loading.value = false;
    }
  }

  /** My runs' "Load a fresh one": the same fresh save as entering the Auto Planner, staying on My runs. */
  function loadFreshSave(): void {
    void prepareAutoPlanner();
  }

  /**
   * My runs reads everything from the save, so it needs one LOADED into the stores. On a page load they hold the
   * Manual planner's restored draft instead (initPersistence -> importPlan -> hydrate: no save time, and the TE
   * and egg of whenever that plan was made) beside the last fetched save: the strip said "No save loaded" and the
   * board's look-alike rule read the draft's TE (fix 20). So on My runs, with no save loaded into the stores, load
   * one the way entering the Auto Planner does (prepareAutoPlanner: a fresh save, else the stored one). After the
   * page's own restore (onMounted ends with it), at most once per account per page visit (a Manual plan opened
   * later from the library is never reset by a tab click: the strip's "Load your save" is there), never under a
   * search or over a save the player picked.
   *
   * An account switch (submitPlayerId) DOES load the save into the stores, but the 'default' way: the pending Truth
   * Eggs not rolled up (the TE is the claimed one) and the farm caught up to now. My runs reads its TE and eggs from
   * the save itself (useNowPage), but the instant answer's key and the gear sets need the stores set up as Fastest
   * and By a date have them, so then it sets them up from the save already in hand (no second fetch; fix 21).
   */
  const storesFromSave = computed(() => initialStateStore.hasData && initialStateStore.lastBackupTime > 0);
  /** The stores hold the loaded save set up the Auto Planner's way: its own time, its pending TE rolled up. */
  const storesSetUpFromSave = computed(
    () =>
      storesFromSave.value &&
      initialStateStore.lastBackupTime === backupSecondsOf(initialStateStore.rawBackup) &&
      chainSearchStore.currentTE === saveTEOf(initialStateStore.rawBackup)
  );
  let myRunsReady = false;
  let myRunsLoadFor = '';
  function loadSaveForMyRuns(): void {
    if (!myRunsReady || plannerTab.value !== 'myruns' || !playerId.value || loading.value || storesSetUpFromSave.value) return;
    if (myRunsLoadFor === playerId.value || searchActive.value || uiStore.runSaveLoaded) return;
    myRunsLoadFor = playerId.value;
    const raw = initialStateStore.rawBackup;
    const inHand =
      storesFromSave.value &&
      !!raw &&
      raw.eiUserId === playerId.value &&
      initialStateStore.lastBackupTime === backupSecondsOf(raw);
    void (inHand ? setUpFromSaveInHand() : prepareAutoPlanner());
  }
  /** initPlanFuture from the save already loaded (an account switch just fetched it). */
  async function setUpFromSaveInHand(): Promise<void> {
    const raw = initialStateStore.rawBackup;
    if (!playerId.value || !raw || loading.value) return;
    loading.value = true;
    try {
      await initPlanFuture(playerId.value, raw);
    } catch (e) {
      console.error('Could not set the planner up from the loaded save:', e);
    } finally {
      loading.value = false;
    }
  }
  // Once per account per visit: a switch back to an account counts again (its stores were loaded the switch's way).
  watch(playerId, () => (myRunsLoadFor = ''));
  watch([plannerTab, playerId, loading, storesSetUpFromSave], loadSaveForMyRuns);

  /** The end of the page's onMounted: the draft is restored, so My runs may load the save now. */
  function startMyRuns(): void {
    myRunsReady = true;
    loadSaveForMyRuns();
  }

  return {
    prepareAutoPlanner,
    loadFreshSave,
    loadSaveForMyRuns,
    setUpFromSaveInHand,
    planFromLastGoodSave,
    backupFailureReason,
    startMyRuns,
  };
}
