/**
 * Startup that survives a browser blocking site storage (red team 21 Oct 2026, data-inputs #2). With
 * site data blocked, some privacy modes or an embedded view, reading `localStorage` (or calling its
 * getItem) throws a SecurityError. Several modules read it while loading (the compact Action History
 * choice, the research view prefs, the actions store), so the app never mounted and the page sat on
 * "Loading application..." for good.
 *
 * main.ts runs `installStorageGuard()` before anything else is imported: a storage that throws is
 * swapped for one kept in memory for this visit, and `storageBlocked()` tells App.vue to say that
 * settings will not be remembered. A storage that is only full (QuotaExceededError on setItem) is
 * left alone; every write already copes with that.
 */

type StorageKind = 'localStorage' | 'sessionStorage';

let blocked = false;

/** True when this visit runs on in-memory storage because the browser refused site storage. */
export function storageBlocked(): boolean {
  return blocked;
}

/** A Storage kept in memory: same calls, forgotten when the tab closes. */
export function memoryStorage(): Storage {
  const m = new Map<string, string>();
  const st = {
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => (m.has(String(k)) ? (m.get(String(k)) as string) : null),
    setItem: (k: string, v: string) => void m.set(String(k), String(v)),
    removeItem: (k: string) => void m.delete(String(k)),
    clear: () => m.clear(),
  };
  // `Object.keys(localStorage)` lists stored keys in a browser; a few readers rely on that.
  return new Proxy(st, {
    ownKeys: () => [...m.keys()],
    getOwnPropertyDescriptor: (_t, k) =>
      typeof k === 'string' && m.has(k) ? { value: m.get(k), enumerable: true, configurable: true } : undefined,
  }) as unknown as Storage;
}

function usable(win: object, kind: StorageKind): boolean {
  try {
    const st = (win as Record<StorageKind, Storage | undefined>)[kind];
    if (!st) return false;
    st.getItem('aap-storage-probe');
    return true;
  } catch {
    return false;
  }
}

/**
 * Swaps each throwing storage on `win` for an in-memory one. Returns whether any was swapped (also
 * what `storageBlocked()` reports afterwards). Never throws.
 */
export function installStorageGuard(win: object = globalThis): boolean {
  for (const kind of ['localStorage', 'sessionStorage'] as const) {
    if (usable(win, kind)) continue;
    // Not there at all (a worker, Node): nothing to guard.
    try {
      if (!(kind in win)) continue;
    } catch {
      // fall through: treat as blocked
    }
    blocked = true;
    try {
      Object.defineProperty(win, kind, { value: memoryStorage(), configurable: true, writable: true });
    } catch {
      // Not replaceable: every read site still has its own try/catch.
    }
  }
  return blocked;
}
