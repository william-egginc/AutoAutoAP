/**
 * A write to this browser's storage that failed says so (QA 24 Oct 2026, finding 5): with `localStorage.setItem`
 * throwing (the storage full, or refused), a follow looked set and was gone after a reload, and nothing warned.
 *
 * Every write in the app goes through `Storage.prototype.setItem` (the follow store, Setup's memory, settings, the
 * shared JSON helpers in lib/safeStorage.ts), so one wrapper there covers them all without touching each call site.
 * The call still throws as before (each caller already copes); the wrapper only notes, for `localStorage`, which keys
 * failed. `storageWriteFailed` is true while any key's last write failed: a later write of that key that works (or
 * its removal) clears it. Keyed, not "any later write", so a small write that still fits right after a big one that
 * didn't (a full storage) doesn't hide the warning.
 *
 * Not covered: IndexedDB (saved runs, saved By a date answers, the stored save), sessionStorage, a failing
 * removeItem, and a storage the browser blocks outright (lib/storageGuard.ts swaps that for memory and App.vue says
 * so with its own line).
 */
import { ref } from 'vue';

export const STORAGE_WRITE_FAILED_WORDS =
  "Your browser wouldn't let this page save: what you set may be gone when you reload.";

/** True while a write to localStorage failed and nothing has written that key since. */
export const storageWriteFailed = ref(false);

const failedKeys = new Set<string>();

/** Note how a localStorage write (or removal) of `key` went. */
export function noteStorageWrite(key: string, ok: boolean): void {
  if (ok) failedKeys.delete(key);
  else failedKeys.add(key);
  const now = failedKeys.size > 0;
  if (storageWriteFailed.value !== now) storageWriteFailed.value = now;
}

/** For specs: forget every failed write. */
export function resetStorageWrites(): void {
  failedKeys.clear();
  storageWriteFailed.value = false;
}

const WATCHED = Symbol.for('aap.storageWritesWatched');

type SetItem = (this: Storage, key: string, value: string) => void;
type RemoveItem = (this: Storage, key: string) => void;

/**
 * Wrap `Storage.prototype.setItem` and `removeItem` on `win` so localStorage writes are noted (`noteStorageWrite`).
 * A later replacement of either (a test page, an extension) is wrapped too. Returns whether it wrapped; never throws,
 * and once per window.
 */
export function watchStorageWrites(win: object = globalThis): boolean {
  try {
    const proto = (win as { Storage?: { prototype: Storage } }).Storage?.prototype as
      | (Storage & { [WATCHED]?: boolean })
      | undefined;
    if (!proto || proto[WATCHED] || typeof proto.setItem !== 'function') return false;
    const isLocal = (st: unknown): boolean => {
      try {
        return st === (win as { localStorage?: Storage }).localStorage;
      } catch {
        return false;
      }
    };

    let innerSet = proto.setItem as SetItem;
    const setItem: SetItem = function (this: Storage, key: string, value: string) {
      try {
        innerSet.call(this, key, value);
      } catch (e) {
        if (isLocal(this)) noteStorageWrite(String(key), false);
        throw e;
      }
      if (isLocal(this)) noteStorageWrite(String(key), true);
    };
    let innerRemove = proto.removeItem as RemoveItem;
    const removeItem: RemoveItem = function (this: Storage, key: string) {
      innerRemove.call(this, key);
      if (isLocal(this)) noteStorageWrite(String(key), true);
    };

    Object.defineProperty(proto, 'setItem', {
      configurable: true,
      enumerable: true,
      get: () => setItem,
      set: (fn: SetItem) => {
        innerSet = fn;
      },
    });
    Object.defineProperty(proto, 'removeItem', {
      configurable: true,
      enumerable: true,
      get: () => removeItem,
      set: (fn: RemoveItem) => {
        innerRemove = fn;
      },
    });
    Object.defineProperty(proto, WATCHED, { value: true });
    return true;
  } catch {
    return false;
  }
}
