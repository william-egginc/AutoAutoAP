import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { AutoView, CompareView, Depth, ScienceView } from '@/lib/siteNav';
import type { SweepRequest } from '@/search/sweepRequest';
import type { ByDateRequest } from '@/search/byDateRequest';

export type PlannerTab = 'manual' | 'automatic' | 'leaderboard' | 'science';

export const useUIStore = defineStore('ui', () => {
  /** The top tab (lib/siteNav.ts has the names and addresses): Manual, Auto, Compare, Science. */
  const plannerTab = ref<PlannerTab>('manual');
  /** Which Auto Planner screen, and how thorough the fastest-route one is. */
  const autoView = ref<AutoView>('classic');
  const fastestDepth = ref<Depth>('smart');
  /** Compare's view (a leaderboard tab, or Insights) and Science's. */
  const compareView = ref<CompareView>('eggday');
  const scienceView = ref<ScienceView>('check');
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
  /** A route the instant answer's "Simulate this plan" sent to Classic (search/simulateRoute.ts): Classic
   *  scrolls to its plan once simulated and says where it came from, with a way back. */
  const planFromInstant = ref<{ chain: number[]; back: 'fastest' | 'by-date' } | null>(null);
  /** Your setup's floating panel (SetupDock.vue) is open: the gear, or a screen's Edit setup. */
  const setupOpen = ref(false);
  /** Bumped to open Your setup at its time off (YourSetup.vue), e.g. from a sweep's "add time off". */
  const openSetupRequested = ref(0);
  /** Bumped to ask App.vue to fetch the backup again (it owns the fetch). */
  const backupRetryRequested = ref(0);
  /** A route handed to the Full sweep to price exactly (the instant answer's "Check exactly",
   *  InstantRoute.vue): its bands, one value per checkpoint. InsanePanel takes it and clears it. */
  const fullSweepBands = ref<string | null>(null);
  /** The sweep the Science tab's runner (SweepRunner.vue) is showing; null when it is closed. */
  const scienceSweep = ref<SweepRequest | null>(null);
  /** A By a date set-up from the Science tab, for DeadlinePanel to apply once it opens; it clears it. */
  const byDateRequest = ref<ByDateRequest | null>(null);
  /**
   * A sweep started from the Science tab, kept here rather than in the runner so closing the runner
   * (or leaving the tab) loses nothing: the run goes on, sends itself, and opening the runner again
   * shows where it got to. Null once dismissed.
   */
  const scienceRun = ref<{
    request: SweepRequest;
    phase: 'starting' | 'running' | 'sending' | 'done';
    /** How the automatic send went, once it has. */
    report: { ok: boolean; text: string } | null;
  } | null>(null);

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
    compareView,
    scienceView,
    isHeaderCollapsed,
    isFooterCollapsed,
    loading,
    error,
    staleBackup,
    runSaveLoaded,
    openPlannerRequested,
    planFromInstant,
    backupRetryRequested,
    openSetupRequested,
    setupOpen,
    scienceSweep,
    byDateRequest,
    scienceRun,
    fullSweepBands,
    setActiveTab,
    setHeaderCollapsed,
    setLoading,
    setError,
  };
});
