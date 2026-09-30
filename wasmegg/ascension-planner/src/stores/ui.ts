import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { AutoView, Depth } from '@/lib/siteNav';

export type PlannerTab = 'manual' | 'automatic' | 'leaderboard' | 'science';

export const useUIStore = defineStore('ui', () => {
  /** The top tab (lib/siteNav.ts has the names and addresses): Manual, Auto, Compare, Science. */
  const plannerTab = ref<PlannerTab>('manual');
  /** Which Auto Planner screen, and how thorough the fastest-route one is. */
  const autoView = ref<AutoView>('classic');
  const fastestDepth = ref<Depth>('smart');
  const isHeaderCollapsed = ref(false);
  const isFooterCollapsed = ref(false);
  const loading = ref(false);
  const error = ref('');
  /**
   * Why the last fresh-backup fetch failed, while the planner is running on an older copy; null
   * once a fetch succeeds.
   *
   * A red line under a collapsed header was all this used to get, and it was missed: a player ran
   * an overnight search against a save 23 TE out of date because the game's server timed out once.
   * Set here, shown by IntegrityNotice beside every Start button, and it blocks the long runs until
   * the player either reloads or says to go ahead.
   */
  const staleBackup = ref<string | null>(null);
  /**
   * Set while the planner holds a run's OWN stored save rather than the player's latest: carrying
   * on an interrupted run loads the save it started with. Cleared by the next fresh fetch.
   */
  const runSaveLoaded = ref<{ te: number; backupAt: number } | null>(null);
  /** Bumped to ask App.vue to open Classic with the chain a search just applied, in place (no reload). */
  const openPlannerRequested = ref(0);
  /** Bumped to open Your setup at its time off (YourSetup.vue), e.g. from a sweep's "add time off". */
  const openSetupRequested = ref(0);
  /** Bumped to ask App.vue to fetch the backup again (it owns the fetch). */
  const backupRetryRequested = ref(0);

  function setActiveTab(tab: PlannerTab) {
    plannerTab.value = tab;
  }

  function setHeaderCollapsed(collapsed: boolean) {
    isHeaderCollapsed.value = collapsed;
  }

  function setLoading(l: boolean) {
    loading.value = l;
  }

  function setError(e: string) {
    error.value = e;
  }

  return {
    plannerTab,
    autoView,
    fastestDepth,
    isHeaderCollapsed,
    isFooterCollapsed,
    loading,
    error,
    staleBackup,
    runSaveLoaded,
    openPlannerRequested,
    backupRetryRequested,
    openSetupRequested,
    setActiveTab,
    setHeaderCollapsed,
    setLoading,
    setError,
  };
});
