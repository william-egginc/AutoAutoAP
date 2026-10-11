/**
 * THE "PRESTIGE BY" FLAG (search/prestigeBy.ts): experimental, off for players by default, until the
 * predictions it would make have been checked against what players' next saves show.
 *
 * On for this visit with `?prestigeBy=1` in the address (`?prestigeBy=0`: off for this visit, whatever
 * is stored), or for this browser with the box in Your setup › Experimental (localStorage). A second
 * box there keeps the prediction in the opt-in instant answer record, so it can be checked later; it
 * only goes anywhere when "Share this check" is ticked for that check.
 *
 * Storage is wrapped in try/catch everywhere: private windows and blocked site data throw.
 */
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';

export const PRESTIGE_BY_KEY = 'aap.experimental.prestigeBy';
export const PRESTIGE_BY_RECORD_KEY = 'aap.experimental.prestigeByRecord';
export const PRESTIGE_BY_PARAM = 'prestigeBy';

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

function defaultSearch(): string {
  try {
    return typeof location === 'undefined' ? '' : location.search;
  } catch {
    return '';
  }
}

/** The address's say: true (?prestigeBy=1, true, on or yes), false (0, false, off, no), or null. */
export function prestigeByFromUrl(search: string): boolean | null {
  let v: string | null;
  try {
    v = new URLSearchParams(search).get(PRESTIGE_BY_PARAM);
  } catch {
    return null;
  }
  if (v === null) return null;
  const s = v.trim().toLowerCase();
  if (s === '' || s === '1' || s === 'true' || s === 'on' || s === 'yes') return true;
  if (s === '0' || s === 'false' || s === 'off' || s === 'no') return false;
  return null;
}

export interface PrestigeByFlag {
  /** The box in Your setup (this browser). */
  stored: Ref<boolean>;
  /** Keep the prediction in shared instant answer records (this browser). */
  record: Ref<boolean>;
  /** What the address says for this visit (null: nothing). */
  fromUrl: boolean | null;
  /** Shown on this visit: the address's say, else the box. */
  enabled: ComputedRef<boolean>;
}

function stored(storage: StorageLike | null, key: string): Ref<boolean> {
  let initial: boolean;
  try {
    initial = storage?.getItem(key) === '1';
  } catch {
    initial = false;
  }
  const on = ref(initial);
  watch(
    on,
    v => {
      try {
        storage?.setItem(key, v ? '1' : '0');
      } catch {
        /* remembered for this visit only */
      }
    },
    { flush: 'sync' }
  );
  return on;
}

export function createPrestigeBy(
  storage: StorageLike | null = defaultStorage(),
  search: string = defaultSearch()
): PrestigeByFlag {
  const box = stored(storage, PRESTIGE_BY_KEY);
  const record = stored(storage, PRESTIGE_BY_RECORD_KEY);
  const fromUrl = prestigeByFromUrl(search);
  return { stored: box, record, fromUrl, enabled: computed(() => fromUrl ?? box.value) };
}

/** Whether a record gets the prediction: the flag on, its record box ticked, and the check shared. */
export function recordsPrestigeBy(flag: { enabled: boolean; record: boolean }, shared: boolean): boolean {
  return flag.enabled && flag.record && shared;
}

let shared: PrestigeByFlag | null = null;
/** The site's one flag (created on first use, so each page load reads storage and the address once). */
export function usePrestigeBy(): PrestigeByFlag {
  return (shared ??= createPrestigeBy());
}
