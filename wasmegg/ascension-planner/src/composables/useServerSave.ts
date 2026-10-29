/**
 * My runs' save strip: the save on the server versus the save loaded here (lib/serverSave.ts). Once the page holds
 * its save and nothing is loading, ask the server quietly, once per page load per account (the module's guard; a
 * load this page made already counts). No timers, no polling, no focus checks: a reload is the way to ask again.
 */
import { computed, ref, watch, type Ref } from 'vue';
import { checkServerQuietly, serverSaveFor, serverSaveState, type ServerSaveState } from '@/lib/serverSave';
import { hashID } from '@/lib/storage/db';

export function useServerSave(o: {
  playerId: Ref<string>;
  /** The loaded save's own time (unix seconds), 0 without one. */
  loadedSeconds: Ref<number>;
  /** The page holds its save and nothing is loading. */
  ready: Ref<boolean>;
  now: Ref<number>;
}): Ref<ServerSaveState> {
  const hash = ref('');
  watch(
    o.playerId,
    async id => {
      hash.value = '';
      if (!id) return;
      try {
        const h = await hashID(id);
        if (o.playerId.value === id) hash.value = h;
      } catch {
        // No hash, no comparison: the strip stays as it was.
      }
    },
    { immediate: true }
  );
  watch(
    [o.playerId, o.loadedSeconds, o.ready],
    ([id, loaded, ready]) => {
      if (!ready || !id) return;
      const online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
      void checkServerQuietly(id, loaded, { nowSeconds: o.now.value, online });
    },
    { immediate: true }
  );
  return computed(() => serverSaveState(o.loadedSeconds.value, serverSaveFor(hash.value)));
}
