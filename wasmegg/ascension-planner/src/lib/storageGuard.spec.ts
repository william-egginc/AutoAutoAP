/**
 * Blocked site storage no longer hangs startup on "Loading application..." (red team 21 Oct 2026,
 * data-inputs #2): main.ts swaps a throwing storage for one in memory before any other import, and
 * App.vue says settings won't be remembered.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

function blockedWindow(how: 'getter' | 'getItem') {
  const win: Record<string, unknown> = {};
  for (const kind of ['localStorage', 'sessionStorage']) {
    if (how === 'getter')
      Object.defineProperty(win, kind, {
        configurable: true,
        get() {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        },
      });
    else
      Object.defineProperty(win, kind, {
        configurable: true,
        value: {
          getItem() {
            throw new DOMException('denied', 'SecurityError');
          },
        },
      });
  }
  return win as { localStorage: Storage; sessionStorage: Storage };
}

describe('installStorageGuard', () => {
  it('swaps a storage whose getter throws for one in memory', async () => {
    const { installStorageGuard, storageBlocked } = await import('./storageGuard');
    const win = blockedWindow('getter');
    expect(installStorageGuard(win)).toBe(true);
    expect(storageBlocked()).toBe(true);
    win.localStorage.setItem('a', '1');
    expect(win.localStorage.getItem('a')).toBe('1');
    expect(Object.keys(win.localStorage)).toEqual(['a']);
    expect(win.localStorage.length).toBe(1);
    win.sessionStorage.setItem('s', 'x');
    expect(win.sessionStorage.getItem('s')).toBe('x');
    expect(win.sessionStorage.getItem('nope')).toBeNull();
  });

  it('swaps one whose getItem throws', async () => {
    const { installStorageGuard } = await import('./storageGuard');
    const win = blockedWindow('getItem');
    expect(installStorageGuard(win)).toBe(true);
    expect(win.localStorage.getItem('x')).toBeNull();
  });

  it('leaves a working (or merely full) storage alone and reports nothing', async () => {
    const { installStorageGuard, storageBlocked } = await import('./storageGuard');
    const real = {
      getItem: () => null,
      setItem() {
        throw new DOMException('full', 'QuotaExceededError');
      },
    };
    const win = { localStorage: real, sessionStorage: real };
    expect(installStorageGuard(win)).toBe(false);
    expect(storageBlocked()).toBe(false);
    expect(win.localStorage).toBe(real);
    // No storage at all (a worker): nothing to guard.
    expect(installStorageGuard({})).toBe(false);
  });

  it('lets a module that reads storage while loading load (the compact Action History choice)', async () => {
    const win = blockedWindow('getter');
    vi.stubGlobal('localStorage', undefined);
    const { installStorageGuard } = await import('./storageGuard');
    installStorageGuard(win);
    vi.stubGlobal('localStorage', win.localStorage);
    const mod = await import('@/composables/useCompactActionHistory');
    expect(mod.compactActionHistory.value).toBe(true);
  });
});

describe('startup wiring', () => {
  it('main.ts installs the guard before any other import', () => {
    const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
    const firstImport = main.split('\n').find(l => l.startsWith('import '));
    expect(firstImport).toBe("import './lib/storageGuard.install';");
    const install = readFileSync(new URL('./storageGuard.install.ts', import.meta.url), 'utf8');
    expect(install).toContain('installStorageGuard();');
  });

  it('App.vue shows a short notice when storage is blocked', () => {
    const app = readFileSync(new URL('../App.vue', import.meta.url), 'utf8');
    expect(app).toContain('v-if="storageIsBlocked"');
    expect(app).toContain('won’t be remembered');
    expect(app).toContain('const storageIsBlocked = storageBlocked();');
  });
});
