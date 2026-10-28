/**
 * The save strip on the Auto Planner screens (ux29 item 4, 27 Oct 2026; components/auto/AutoSaveStrip.vue): "Load
 * latest save" was only inside Setup and "A newer save is on the server · Load it" only on My runs. Fastest and By a
 * date now show My runs' strip too, slim, near the top.
 *
 * One source: the server's save time lives in lib/serverSave.ts's module state, and the quiet check is the same
 * once-per-page-load one (useServerSave), so a strip on every screen still asks the server at most once. Quiet while
 * the save is under `QUIET_CHECK_MIN_AGE_S` old (the check is skipped then too), unless a newer save is known.
 * Its button is Setup's "Load latest save" (the ui store's `backupRetryRequested`, App's `prepareAutoPlanner`).
 */
import { computed, type Ref } from 'vue';
import { useInitialStateStore } from '@/stores/initialState';
import { useUIStore } from '@/stores/ui';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { backupSecondsOf, saveStrip } from '@/lib/saveFreshness';
import { QUIET_CHECK_MIN_AGE_S } from '@/lib/serverSave';
import { useServerSave } from './useServerSave';

/** The strip's button words outside Setup: the same words as Setup's button. */
export const LOAD_LATEST_SAVE = 'Load latest save';

export function useAutoSaveStrip(o: { now: Ref<number> }) {
  const initial = useInitialStateStore();
  const ui = useUIStore();
  const planner = useAutoPlannerStore();
  const zone = computed(() => planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
  const loadedSeconds = computed(() => backupSecondsOf(initial.rawBackup));
  const loading = computed(() => ui.loading);
  const server = useServerSave({
    playerId: computed(() => ui.screenPlayerId),
    loadedSeconds,
    ready: computed(() => loadedSeconds.value > 0 && initial.hasData && !ui.loading),
    now: o.now,
  });
  const strip = computed(() => saveStrip(loadedSeconds.value, o.now.value, zone.value));
  const shown = computed(
    () => !!strip.value && (server.value.kind === 'newer' || o.now.value - loadedSeconds.value >= QUIET_CHECK_MIN_AGE_S)
  );
  /** Setup's "Load latest save": App watches the counter and loads a fresh save. */
  function load(): void {
    ui.backupRetryRequested++;
  }
  return { strip, server, shown, loading, load };
}
