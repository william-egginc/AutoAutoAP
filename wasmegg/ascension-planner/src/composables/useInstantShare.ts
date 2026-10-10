/**
 * "Share my instant answers and their Check exactly results": the per-browser opt-in for instant
 * answer records (search/instantRecord.ts). OFF by default.
 *
 * Three states, remembered per browser (localStorage): never answered (`asked` false: the instant
 * answer offers it once, inline, when a Check exactly finishes), yes, or no. The box in Your setup and
 * the inline "Share this check?" are the same refs.
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
  /** The player has answered (either way), in Your setup or inline. */
  asked: Ref<boolean>;
}

export function createInstantShare(storage: StorageLike | null = defaultStorage()): InstantShare {
  let saved: string | null = null;
  try {
    saved = storage?.getItem(INSTANT_SHARE_KEY) ?? null;
  } catch {
    saved = null;
  }
  const on = ref(saved === '1');
  const asked = ref(saved === '1' || saved === '0');
  watch(
    on,
    v => {
      asked.value = true;
      try {
        storage?.setItem(INSTANT_SHARE_KEY, v ? '1' : '0');
      } catch {
        /* remembered for this visit only */
      }
    },
    { flush: 'sync' }
  );
  return { on, asked };
}

/** "No" inline: remembered as unticked, so it is not offered again. */
export function declineInstantShare(share: InstantShare, storage: StorageLike | null = defaultStorage()): void {
  share.asked.value = true;
  if (share.on.value) share.on.value = false;
  else
    try {
      storage?.setItem(INSTANT_SHARE_KEY, '0');
    } catch {
      /* remembered for this visit only */
    }
}

let shared: InstantShare | null = null;
/** The site's one choice (created on first use, so each page load reads storage once). */
export function useInstantShare(): InstantShare {
  return (shared ??= createInstantShare());
}
