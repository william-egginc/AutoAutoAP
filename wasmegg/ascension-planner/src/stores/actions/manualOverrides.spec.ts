/**
 * Garbage in stored JSON never blanks the site (red team 21 Oct 2026, data-inputs #1): the actions
 * store's `state()` read `ascension_manual_overrides` with a bare JSON.parse, so `{not json` threw on
 * every load. lib/safeStorage.ts: fall back to the default and keep a `.bad` copy.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { MANUAL_OVERRIDES_KEY, readManualOverrides, useActionsStore } from './index';
import { badCopyKey, readStoredJson, isPlainRecord, writeStoredJson } from '@/lib/safeStorage';

let mem: Map<string, string>;

function stubStorage(throwOn: 'none' | 'get' | 'set' | 'access' = 'none') {
  mem = new Map();
  const st = {
    getItem: (k: string) => {
      if (throwOn === 'get') throw new DOMException('blocked', 'SecurityError');
      return mem.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (throwOn === 'set') throw new DOMException('full', 'QuotaExceededError');
      mem.set(k, v);
    },
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  };
  if (throwOn === 'access') {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
  } else {
    vi.stubGlobal('localStorage', st);
  }
}

beforeEach(() => {
  stubStorage();
  setActivePinia(createPinia());
});
afterEach(() => {
  vi.unstubAllGlobals();
  // `access` replaced the property itself.
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe('manual overrides from storage', () => {
  it('a corrupt value gives no ticks, keeps a .bad copy and the store still builds', () => {
    mem.set(MANUAL_OVERRIDES_KEY, '{not json');
    const store = useActionsStore();
    expect(store.manualOverrides).toEqual({});
    expect(mem.get(badCopyKey(MANUAL_OVERRIDES_KEY))).toBe('{not json');
  });

  it('a stored null or array is not trusted (the toggle used to throw on null)', () => {
    for (const bad of ['null', '[1,2]', '"text"', '7']) {
      mem.set(MANUAL_OVERRIDES_KEY, bad);
      expect(readManualOverrides()).toEqual({});
      expect(mem.get(badCopyKey(MANUAL_OVERRIDES_KEY))).toBe(bad);
    }
    mem.set(MANUAL_OVERRIDES_KEY, 'null');
    const store = useActionsStore();
    store.activePlanId = 'plan-1';
    expect(() => store.toggleManualOverride('a1')).not.toThrow();
    expect(JSON.parse(mem.get(MANUAL_OVERRIDES_KEY)!)).toEqual({ 'plan-1': { a1: true } });
  });

  it('keeps good entries and drops malformed ones', () => {
    mem.set(MANUAL_OVERRIDES_KEY, JSON.stringify({ p1: { a: true, b: 'yes', c: false }, p2: null, p3: [1] }));
    expect(readManualOverrides()).toEqual({ p1: { a: true, c: false } });
  });

  it('a good value round-trips with no .bad copy', () => {
    mem.set(MANUAL_OVERRIDES_KEY, JSON.stringify({ p1: { a: true } }));
    expect(useActionsStore().manualOverrides).toEqual({ p1: { a: true } });
    expect(mem.has(badCopyKey(MANUAL_OVERRIDES_KEY))).toBe(false);
  });

  it('blocked or full storage never throws', () => {
    stubStorage('get');
    expect(readManualOverrides()).toEqual({});
    stubStorage('set');
    const store = useActionsStore();
    store.activePlanId = 'p';
    expect(() => store.toggleManualOverride('a')).not.toThrow();
    expect(store.manualOverrides).toEqual({ p: { a: true } });
    stubStorage('access');
    expect(readManualOverrides()).toEqual({});
    expect(writeStoredJson('k', 1)).toBe(false);
  });
});

describe('readStoredJson', () => {
  it('reads sessionStorage too, with the same fallback', () => {
    const s = new Map<string, string>([['k', '{oops']]);
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => s.get(k) ?? null,
      setItem: (k: string, v: string) => void s.set(k, v),
    });
    expect(readStoredJson('k', () => ({ d: 1 }), isPlainRecord, 'session')).toEqual({ d: 1 });
    expect(s.get('k.bad')).toBe('{oops');
    // The key itself is left for the next good write.
    expect(s.get('k')).toBe('{oops');
  });

  it('nothing stored is the default, with no .bad copy', () => {
    expect(readStoredJson('missing', () => 5, (v): v is number => typeof v === 'number')).toBe(5);
    expect(mem.size).toBe(0);
  });
});
