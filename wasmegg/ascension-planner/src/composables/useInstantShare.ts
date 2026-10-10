/**
 * "Keep sharing my checks": the per-browser opt-in for instant answer records (search/
 * instantRecord.ts). OFF by default. With it ticked, every finished Check exactly sends one record;
 * without it, the player can still tick "Share this check" for one check, on the instant answer.
 *
 * The one source of truth for the setting: the box under the instant answer and the mirror in
 * Your setup › Sharing are the same ref, remembered per browser (localStorage).
 *
 * Storage is wrapped in try/catch everywhere: private windows and blocked site data throw.
 */
import { ref, watch, type Ref } from 'vue';

export const INSTANT_SHARE_KEY = 'aap.share.instantAnswers';

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

export interface InstantShare {
  /** Ticked: each finished Check exactly sends one record. */
  on: Ref<boolean>;
}

export function createInstantShare(storage: StorageLike | null = defaultStorage()): InstantShare {
  let saved: string | null = null;
  try {
    saved = storage?.getItem(INSTANT_SHARE_KEY) ?? null;
  } catch {
    saved = null;
  }
  const on = ref(saved === '1');
  watch(
    on,
    v => {
      try {
        storage?.setItem(INSTANT_SHARE_KEY, v ? '1' : '0');
      } catch {
        /* remembered for this visit only */
      }
    },
    { flush: 'sync' }
  );
  return { on };
}

let shared: InstantShare | null = null;
/** The site's one choice (created on first use, so each page load reads storage once). */
export function useInstantShare(): InstantShare {
  return (shared ??= createInstantShare());
}
