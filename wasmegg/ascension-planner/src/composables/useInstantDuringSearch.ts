/**
 * "Let the instant answer run during a search": whether pressing Work it out again while a search is
 * running goes straight ahead (true) or shows the memory warning first (false, the default).
 *
 * Remembered per browser (localStorage), like the share boxes (useShareExtras.ts). One value for the
 * whole site: the warning's "Don't ask again, just warn me" button and the box in Your setup are the
 * same ref, so ticking one ticks the other.
 *
 * Storage is wrapped in try/catch everywhere: private windows and blocked site data throw.
 */
import { ref, watch, type Ref } from 'vue';

export const INSTANT_DURING_SEARCH_KEY = 'aap.instant.runDuringSearch';

interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function createInstantDuringSearch(storage: StorageLike | null = defaultStorage()): Ref<boolean> {
  let initial = false;
  try {
    initial = storage?.getItem(INSTANT_DURING_SEARCH_KEY) === '1';
  } catch {
    initial = false;
  }
  const on = ref(initial);
  watch(
    on,
    v => {
      try {
        storage?.setItem(INSTANT_DURING_SEARCH_KEY, v ? '1' : '0');
      } catch {
        /* remembered for this visit only */
      }
    },
    { flush: 'sync' }
  );
  return on;
}

let shared: Ref<boolean> | null = null;
/** The site's one value (created on first use, so each page load reads storage once). */
export function useInstantDuringSearch(): Ref<boolean> {
  return (shared ??= createInstantDuringSearch());
}
