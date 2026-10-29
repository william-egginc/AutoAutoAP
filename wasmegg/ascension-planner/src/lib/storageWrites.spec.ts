/**
 * A failed storage write warns (QA 24 Oct 2026, finding 5: with localStorage.setItem throwing, a follow looked set
 * and was gone after a reload, with nothing said). One wrapper on Storage.prototype covers every write; the flag is
 * set by a failed write and cleared by a later one of the same key that works (or its removal).
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_WRITE_FAILED_WORDS, noteStorageWrite, resetStorageWrites, storageWriteFailed, watchStorageWrites } from './storageWrites';

/** A window with its own Storage class: `full` makes every write throw as a full storage does. */
function fakeWindow() {
  const state = { full: false };
  class FakeStorage {
    m = new Map<string, string>();
    getItem(k: string) {
      return this.m.get(k) ?? null;
    }
    setItem(k: string, v: string) {
      if (state.full) throw new DOMException('full', 'QuotaExceededError');
      this.m.set(k, v);
    }
    removeItem(k: string) {
      this.m.delete(k);
    }
  }
  const win = { Storage: FakeStorage, localStorage: new FakeStorage(), sessionStorage: new FakeStorage() };
  return { win: win as unknown as { Storage: typeof FakeStorage; localStorage: Storage; sessionStorage: Storage }, state };
}

beforeEach(() => resetStorageWrites());

describe('watchStorageWrites', () => {
  it('a failed localStorage write sets the flag and still throws (callers cope as before)', () => {
    const { win, state } = fakeWindow();
    expect(watchStorageWrites(win)).toBe(true);
    win.localStorage.setItem('a', '1');
    expect(storageWriteFailed.value).toBe(false);
    state.full = true;
    expect(() => win.localStorage.setItem('aap-follow:x', '{}')).toThrow(/full/);
    expect(storageWriteFailed.value).toBe(true);
  });

  it('a later write of that key that works clears it; a small write of another key does not', () => {
    const { win, state } = fakeWindow();
    watchStorageWrites(win);
    state.full = true;
    expect(() => win.localStorage.setItem('big', 'x')).toThrow();
    state.full = false;
    win.localStorage.setItem('small', 'y');
    expect(storageWriteFailed.value).toBe(true);
    win.localStorage.setItem('big', 'x');
    expect(storageWriteFailed.value).toBe(false);
  });

  it('removing the key that failed clears it', () => {
    const { win, state } = fakeWindow();
    watchStorageWrites(win);
    state.full = true;
    expect(() => win.localStorage.setItem('k', 'x')).toThrow();
    win.localStorage.removeItem('k');
    expect(storageWriteFailed.value).toBe(false);
  });

  it('sessionStorage failures are not counted (they are not what a reload loses)', () => {
    const { win, state } = fakeWindow();
    watchStorageWrites(win);
    state.full = true;
    expect(() => win.sessionStorage.setItem('k', 'x')).toThrow();
    expect(storageWriteFailed.value).toBe(false);
  });

  it('a setItem replaced later (a test page making it throw) is wrapped too', () => {
    const { win } = fakeWindow();
    watchStorageWrites(win);
    (win.Storage.prototype as unknown as { setItem: unknown }).setItem = function () {
      throw new DOMException('full', 'QuotaExceededError');
    };
    expect(() => win.localStorage.setItem('k', 'x')).toThrow(/full/);
    expect(storageWriteFailed.value).toBe(true);
  });

  it('once per window; no Storage (Node, a worker): nothing, never throws', () => {
    const { win } = fakeWindow();
    expect(watchStorageWrites(win)).toBe(true);
    expect(watchStorageWrites(win)).toBe(false);
    expect(watchStorageWrites({})).toBe(false);
  });

  it('noteStorageWrite: set by a failure, cleared once every failed key is written', () => {
    noteStorageWrite('a', false);
    noteStorageWrite('b', false);
    noteStorageWrite('a', true);
    expect(storageWriteFailed.value).toBe(true);
    noteStorageWrite('b', true);
    expect(storageWriteFailed.value).toBe(false);
  });
});

describe('words and wiring', () => {
  it('the words', () => {
    expect(STORAGE_WRITE_FAILED_WORDS).toBe("Your browser wouldn't let this page save: what you set may be gone when you reload.");
  });

  it('installed at startup, right after the storage guard', () => {
    const install = readFileSync(new URL('./storageGuard.install.ts', import.meta.url), 'utf8');
    expect(install.indexOf('watchStorageWrites();')).toBeGreaterThan(install.indexOf('installStorageGuard();'));
  });

  it('App.vue shows one amber status line beside the blocked-storage one, not with storage blocked', () => {
    const app = readFileSync(new URL('../App.vue', import.meta.url), 'utf8');
    const template = app.slice(0, app.indexOf('<script setup'));
    const at = template.indexOf('data-testid="storage-write-failed"');
    expect(at).toBeGreaterThan(template.indexOf('data-testid="storage-blocked"'));
    const p = template.slice(template.lastIndexOf('<p', at), template.indexOf('</p>', at));
    expect(p).toContain('v-if="storageWontSave"');
    expect(p).toContain('role="status"');
    expect(p).toContain('bg-amber-50');
    expect(p).toContain('{{ STORAGE_WRITE_FAILED_WORDS }}');
    expect(app).toContain('const storageWontSave = computed(() => storageWriteFailed.value && !storageIsBlocked);');
  });
});
