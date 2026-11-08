/**
 * egg-beta 93907cf10 was rolled back (QA, 7 Nov 2026): EVERY localStorage.setItem / removeItem threw "RangeError:
 * Maximum call stack size exceeded" from page load, in Chromium and WebKit. lib/storageWrites.ts `watchStorageWrites`
 * (installed first, by storageGuard.install.ts) puts ACCESSOR properties on Storage.prototype whose setter swaps the
 * function it wraps; composables/useOverrideSync.ts `installTECacheObserver` then did `const set = proto.setItem;
 * proto.setItem = wrapper`, which went through that setter: storageWrites' wrapper called ours, ours called
 * storageWrites', for ever. The phase A specs used a plain stand-in object for localStorage, so they never met the
 * prototype.
 *
 * Here a window-like global with a REAL prototype chain: a `Storage` class whose methods live on its prototype, and
 * `localStorage` an instance of it (`instanceof Storage`), as in a browser. (The repo's vitest environment is 'node'
 * and neither jsdom nor happy-dom is installed, so a browser's own Storage isn't available; this class has the same
 * shape where it matters: methods on the prototype, instances own no methods.) Both install orders; one wrapper; the
 * cache key's write still reaches the observer; a failing write still sets `storageWriteFailed`; installing twice is
 * harmless; another tab's `storage` event still works. Placeholder ID only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { resetStorageWrites, storageWriteFailed, watchStorageWrites } from './storageWrites';
import { installTECacheObserver, onTECacheStorageEvent, resetOverrideSync, TE_INPUTS_V2_PREFIX } from '@/composables/useOverrideSync';
import { useInitialStateStore } from '@/stores/initialState';
import { accountOf } from '@/search/runSaves';

const ID = 'EI0000000000000000';
const KEY = `${TE_INPUTS_V2_PREFIX}:${ID}`;
const TE197 = { curiosity: 40, integrity: 40, humility: 40, resilience: 40, kindness: 37 };

/** A browser-shaped Storage: methods on the prototype; `full` makes setItem throw as a full storage does. */
function realShapedStorage() {
  const state = { full: false };
  const data = new WeakMap<object, Map<string, string>>();
  const m = (s: object) => {
    if (!data.has(s)) data.set(s, new Map());
    return data.get(s)!;
  };
  class Storage {
    getItem(k: string): string | null {
      return m(this).get(String(k)) ?? null;
    }
    setItem(k: string, v: string): void {
      if (state.full) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      m(this).set(String(k), String(v));
    }
    removeItem(k: string): void {
      m(this).delete(String(k));
    }
    key(i: number): string | null {
      return [...m(this).keys()][i] ?? null;
    }
    get length(): number {
      return m(this).size;
    }
  }
  const localStorage = new Storage();
  const sessionStorage = new Storage();
  vi.stubGlobal('Storage', Storage);
  vi.stubGlobal('localStorage', localStorage);
  vi.stubGlobal('sessionStorage', sessionStorage);
  // The browser's own write, unwrapped: what another tab's write looks like from here (it just lands in storage).
  const nativeSet = Storage.prototype.setItem;
  return {
    Storage,
    nativeSet,
    localStorage: localStorage as unknown as globalThis.Storage,
    sessionStorage: sessionStorage as unknown as globalThis.Storage,
    state,
  };
}

beforeEach(() => {
  resetStorageWrites();
  resetOverrideSync();
  setActivePinia(createPinia());
  const s = useInitialStateStore();
  s.playerId = ID;
  s.rawBackup = { eiUserId: ID } as never;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const stamped = (ls: globalThis.Storage) => JSON.parse(ls.getItem(KEY) ?? 'null') as { teEarned?: unknown; at?: number } | null;

for (const order of ['watch, then the observer (the page: storageGuard.install.ts first)', 'the observer, then watch'] as const) {
  describe(`installed in this order: ${order}`, () => {
    function install() {
      const w = realShapedStorage();
      if (order.startsWith('watch')) {
        watchStorageWrites(globalThis);
        installTECacheObserver();
      } else {
        installTECacheObserver();
        watchStorageWrites(globalThis);
      }
      return w;
    }

    it('setItem, getItem and removeItem work and never throw (no RangeError)', () => {
      const { localStorage: ls } = install();
      expect(() => ls.setItem('aap-follow:x', '{"a":1}')).not.toThrow();
      expect(ls.getItem('aap-follow:x')).toBe('{"a":1}');
      expect(() => ls.removeItem('aap-follow:x')).not.toThrow();
      expect(ls.getItem('aap-follow:x')).toBeNull();
      expect(storageWriteFailed.value).toBe(false);
    });

    it("the starting TE cache's write still reaches the observer (stamped with the action's time); its removal too", () => {
      const { localStorage: ls } = install();
      const before = Date.now();
      ls.setItem(KEY, JSON.stringify({ teEarned: TE197 }));
      const v = stamped(ls);
      expect(v?.teEarned).toEqual(TE197);
      expect(v?.at).toBeGreaterThanOrEqual(before);
      ls.removeItem(KEY);
      expect(ls.getItem(KEY)).toBeNull();
      expect(Number(ls.getItem(`aap.teOverride.removedAt.${accountOf({ eiUserId: ID })}`))).toBeGreaterThanOrEqual(before);
    });

    it('a failing write still throws as before and sets storageWriteFailed; a later good one clears it', () => {
      const { localStorage: ls, state } = install();
      state.full = true;
      expect(() => ls.setItem('aap-follow:x', '{}')).toThrow(/quota/i);
      expect(storageWriteFailed.value).toBe(true);
      state.full = false;
      ls.setItem('aap-follow:x', '{}');
      expect(storageWriteFailed.value).toBe(false);
    });

    it('installing both twice is harmless: one wrapper, writes work, the cache write is stamped once', () => {
      const { localStorage: ls } = install();
      watchStorageWrites(globalThis);
      installTECacheObserver();
      installTECacheObserver();
      expect(() => ls.setItem(KEY, JSON.stringify({ teEarned: TE197 }))).not.toThrow();
      expect(typeof stamped(ls)?.at).toBe('number');
      expect(() => ls.setItem('k', 'v')).not.toThrow();
    });

    it("sessionStorage is left alone by the observer and still works", () => {
      const { sessionStorage: ss } = install();
      expect(() => ss.setItem(KEY, JSON.stringify({ teEarned: TE197 }))).not.toThrow();
      expect(stamped(ss)?.at).toBeUndefined();
    });

    it("another tab's write (the storage event): read, never stamped or sent from here (QA finding 4), no throw", () => {
      const { localStorage: ls, nativeSet } = install();
      nativeSet.call(ls as never, KEY, JSON.stringify({ teEarned: TE197 }));
      expect(() => onTECacheStorageEvent({ key: KEY, storageArea: ls } as never)).not.toThrow();
      expect(stamped(ls)?.at).toBeUndefined();
      expect(() => onTECacheStorageEvent({ key: 'other', storageArea: ls } as never)).not.toThrow();
    });
  });
}
