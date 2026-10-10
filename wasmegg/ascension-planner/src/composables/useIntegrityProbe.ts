import { watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useInitialStateStore } from '@/stores/initialState';

/**
 * The integrity check up front (search/rules.ts, store `probeIntegrity`), once a save is loaded and
 * again if the account or start changes, so a stalled account says so before Start rather than after.
 * Every panel with a Start calls this: By a date used to rely on Fastest's panel having been opened,
 * so with only By a date opened the notice beside its Find never appeared and Find stayed enabled.
 */
export function useIntegrityProbe(playerId: () => string): void {
  const store = useChainSearchStore();
  const initialStateStore = useInitialStateStore();
  watch(
    () => [playerId(), store.currentTE, store.planStart, !!initialStateStore.rawBackup],
    () => void store.probeIntegrity(playerId()),
    { immediate: true }
  );
}
