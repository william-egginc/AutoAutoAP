/**
 * Minimal browser globals for running app code under Node.
 *
 * Side-effect-only, and imported FIRST by fastsearch.ts: ESM evaluates imports in
 * declaration order, so this runs before any store module whose top-level state()
 * reads localStorage (lib's eids store does exactly that, and throws at import
 * time without it).
 *
 * These are deliberately in-memory and throwaway. The harness never wants to
 * persist a player list or a plan library - it just needs the reads to not throw.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * An in-memory Storage. Like the browser's, its items are its own enumerable properties, so
 * `Object.keys(localStorage)` lists them: the store reads its "already sent" records that way
 * (chainSearch.ts `sentRecords`), and a plain class answered with nothing, so a result sent from the
 * command line could be sent again.
 */
interface MemoryStorage {
  readonly length: number;
  key(i: number): string | null;
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
  clear(): void;
}
function memoryStorage(): MemoryStorage {
  const m = new Map<string, string>();
  const api: MemoryStorage = {
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(String(k), String(v)),
    removeItem: (k: string) => void m.delete(String(k)),
    clear: () => m.clear(),
  };
  return new Proxy(api, {
    ownKeys: () => [...m.keys()],
    getOwnPropertyDescriptor: (_t, k) =>
      typeof k === 'string' && m.has(k)
        ? { value: m.get(k), enumerable: true, configurable: true, writable: true }
        : undefined,
    get: (t, k, r) => (k in t ? Reflect.get(t, k, r) : typeof k === 'string' ? m.get(k) : undefined),
  });
}

/**
 * Keep localStorage in a file from now on (the command line's `--state`, scripts/siteRun.ts).
 * Throwaway is right for a search, but a submission's owner code (search/owner.ts) is what lets the
 * same account's later sends fold together and be renamed; minted afresh each run, every send from
 * the command line would read as a new player. Loads what the file holds, then writes on every
 * change. Mode 0600: the owner code is a claim on the rows.
 */
export function persistLocalStorage(file: string): void {
  const store = g.localStorage as MemoryStorage;
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
    for (const [k, v] of Object.entries(saved)) if (typeof v === 'string') store.setItem(k, v);
  } catch {
    /* no file yet: it is written on the first change */
  }
  const write = () => {
    const out: Record<string, string> = {};
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i)!;
      out[k] = store.getItem(k)!;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(out), { mode: 0o600 });
  };
  const set = store.setItem.bind(store);
  const remove = store.removeItem.bind(store);
  store.setItem = (k: string, v: string) => {
    set(k, v);
    write();
  };
  store.removeItem = (k: string) => {
    remove(k);
    write();
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a browser global scope, assembled by hand
const g = globalThis as any;
if (!g.localStorage) g.localStorage = memoryStorage();
if (!g.sessionStorage) g.sessionStorage = memoryStorage();
if (!g.window) g.window = g;
// The store listens for page events (visibility, unload) that a command line never has.
if (typeof g.addEventListener !== 'function') g.addEventListener = () => {};
if (typeof g.removeEventListener !== 'function') g.removeEventListener = () => {};
// The send waits a frame before its heavy work so the page can paint (search/submission.ts `afterPaint`).
if (typeof g.requestAnimationFrame !== 'function')
  g.requestAnimationFrame = (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0);
if (!g.document) {
  g.document = {
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
    documentElement: { style: {} },
    addEventListener() {},
    removeEventListener() {},
    body: { appendChild() {}, removeChild() {} },
  };
}
if (!g.navigator) g.navigator = { userAgent: 'node', language: 'en-US' };
// The plan-library code path (lib/storage/db) is never called by the search, but
// its module-level feature checks look for indexedDB; leaving it undefined is
// fine as long as it exists as a property.
if (!('indexedDB' in g)) g.indexedDB = undefined;

export {};
