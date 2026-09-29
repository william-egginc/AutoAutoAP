import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useUIStore = defineStore('ui', () => {
  const plannerTab = ref<'manual' | 'automatic' | 'leaderboard'>('manual');
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
  /** Bumped to ask App.vue to fetch the backup again (it owns the fetch). */
  const backupRetryRequested = ref(0);

  function setActiveTab(tab: 'manual' | 'automatic' | 'leaderboard') {
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
    isHeaderCollapsed,
    isFooterCollapsed,
    loading,
    error,
    staleBackup,
    backupRetryRequested,
    setActiveTab,
    setHeaderCollapsed,
    setLoading,
    setError,
  };
});
