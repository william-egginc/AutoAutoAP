/**
 * A file-backed stand-in for the one corner of IndexedDB the planner uses, so the site's own
 * checkpoints work on the command line.
 *
 * The chain-search store keeps a run's priced chains, the save it priced them on and the By a date
 * checkpoint in IndexedDB (lib/storage/db.ts: `put`, `get`, `delete` and a cursor over two object
 * stores, `plans` and `metadata`). Node has none, so a killed run used to start again from the top.
 * With this installed (`installFileIndexedDb(dir)`, from `--out`), the same code writes those records
 * as one JSON file each under `dir`, and a re-run finds them: Smart search resumes from its
 * checkpoint, the Full sweep replays every chain it already priced, and a By a date search carries on.
 *
 * Deliberately tiny: only what db.ts calls (`put`, `get`, `getAll`, `delete` by key or by an
 * `IDBKeyRange.bound` prefix range, and a cursor), callbacks fired on a later tick (callers assign
 * `onsuccess` after `put()` returns), and every write is a temp file then a rename, so a run killed
 * mid-write leaves the previous record intact rather than half of a new one.
 *
 * Transactions: db.ts resolves a write when its TRANSACTION completes (`oncomplete`), and rejects on
 * `onerror` / `onabort` (lib/storage/db.ts saveMetadata, putMetadataRecords). Each transaction here
 * counts its requests and fires `oncomplete` once the last one has settled; a request that fails
 * fires the transaction's `onerror`. Without that, the CLI's first checkpoint write waited forever.
 */
import fs from 'node:fs';
import path from 'node:path';

type Handler = ((event: { target: unknown }) => void) | null;

/** What `IDBKeyRange.bound` gives here: inclusive both ends, string keys only (all db.ts uses). */
interface KeyRange {
  lower: string;
  upper: string;
}
const inRange = (key: string, r: KeyRange) => key >= r.lower && key <= r.upper;
const isRange = (q: unknown): q is KeyRange => typeof q === 'object' && q !== null && 'lower' in q && 'upper' in q;

/** One transaction: `oncomplete` once every request made in it has settled. */
class Tx {
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  error: Error | null = null;
  private open = 0;
  private done = false;
  constructor() {
    // A transaction with no requests at all still completes (on a later tick, after the caller
    // has made its requests and assigned its handlers).
    setImmediate(() => this.finishIfIdle());
  }
  begin(): void {
    this.open++;
  }
  end(error?: Error): void {
    this.open--;
    if (error && !this.done) {
      this.done = true;
      this.error = error;
      this.onerror?.();
      return;
    }
    setImmediate(() => this.finishIfIdle());
  }
  private finishIfIdle(): void {
    if (this.done || this.open > 0) return;
    this.done = true;
    this.oncomplete?.();
  }
}

class Request<T = unknown> {
  result: T | undefined = undefined;
  error: Error | null = null;
  onsuccess: Handler = null;
  onerror: Handler = null;
  onupgradeneeded: Handler = null;
  constructor(private readonly tx?: Tx) {
    tx?.begin();
  }
  /** Settle on a later tick, so the caller has assigned its handlers. */
  settle(run: () => T): void {
    setImmediate(() => {
      try {
        this.result = run();
      } catch (e) {
        this.error = e instanceof Error ? e : new Error(String(e));
        this.onerror?.({ target: this });
        this.tx?.end(this.error);
        return;
      }
      this.onsuccess?.({ target: this });
      this.tx?.end();
    });
  }
}

const KEY_PATH: Record<string, string> = { plans: 'storageKey', metadata: 'key' };

class FileStore {
  private records = new Map<string, unknown>();
  constructor(
    private readonly dir: string,
    private readonly keyPath: string
  ) {
    fs.mkdirSync(dir, { recursive: true });
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.json')) continue;
      try {
        const rec = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as Record<string, unknown>;
        const key = rec?.[keyPath];
        if (typeof key === 'string') this.records.set(key, rec);
      } catch {
        // A record that does not read back (a disk full mid-write leaves only the temp file): skipped.
      }
    }
  }
  private file(key: string): string {
    return path.join(this.dir, encodeURIComponent(key) + '.json');
  }
  put(value: Record<string, unknown>, tx?: Tx): Request {
    const req = new Request(tx);
    req.settle(() => {
      const key = value[this.keyPath];
      if (typeof key !== 'string') throw new Error('record has no key');
      const rec = structuredClone(value);
      const file = this.file(key);
      fs.writeFileSync(file + '.tmp', JSON.stringify(rec));
      fs.renameSync(file + '.tmp', file);
      this.records.set(key, rec);
      return key;
    });
    return req;
  }
  get(key: string, tx?: Tx): Request {
    const req = new Request(tx);
    req.settle(() => (this.records.has(key) ? structuredClone(this.records.get(key)) : undefined));
    return req;
  }
  /** Every record, or those whose key is in `range`, in key order (as IndexedDB returns them). */
  getAll(range?: KeyRange, tx?: Tx): Request {
    const req = new Request(tx);
    req.settle(() =>
      [...this.records.keys()]
        .filter(k => !range || inRange(k, range))
        .sort()
        .map(k => structuredClone(this.records.get(k)))
    );
    return req;
  }
  /** One key, or every key in a range. */
  delete(query: string | KeyRange, tx?: Tx): Request {
    const req = new Request(tx);
    req.settle(() => {
      const keys = isRange(query) ? [...this.records.keys()].filter(k => inRange(k, query)) : [query];
      for (const key of keys) {
        this.records.delete(key);
        fs.rmSync(this.file(key), { force: true });
      }
      return undefined;
    });
    return req;
  }
  openCursor(tx?: Tx): Request {
    // The cursor walks on its own; the transaction counts it as one request that settles at once.
    tx?.begin();
    setImmediate(() => tx?.end());
    const req = new Request<unknown>();
    const values = [...this.records.values()];
    let at = -1;
    const step = () => {
      at++;
      const cursor =
        at < values.length
          ? {
              value: structuredClone(values[at]),
              continue: () => setImmediate(() => {
                step();
                req.onsuccess?.({ target: req });
              }),
            }
          : null;
      req.result = cursor;
    };
    setImmediate(() => {
      step();
      req.onsuccess?.({ target: req });
    });
    return req;
  }
}

class FileDb {
  private stores = new Map<string, FileStore>();
  readonly objectStoreNames = { contains: (name: string) => this.stores.has(name) };
  constructor(private readonly root: string) {}
  createObjectStore(name: string): void {
    if (!this.stores.has(name)) this.stores.set(name, new FileStore(path.join(this.root, name), KEY_PATH[name] ?? 'key'));
  }
  /** Open what an earlier run left, without asking for an upgrade. */
  openExisting(): void {
    for (const name of Object.keys(KEY_PATH)) {
      if (fs.existsSync(path.join(this.root, name))) this.createObjectStore(name);
    }
  }
  /** A transaction over one store: its requests are counted, and it completes after the last. */
  transaction(name: string): Tx & { objectStore: (n: string) => unknown } {
    const tx = new Tx();
    return Object.assign(tx, {
      objectStore: (n: string) => {
        const s = this.stores.get(n ?? name);
        if (!s) throw new Error(`no object store ${n}`);
        return {
          put: (v: Record<string, unknown>) => s.put(v, tx),
          get: (k: string) => s.get(k, tx),
          getAll: (r?: KeyRange) => s.getAll(r, tx),
          delete: (q: string | KeyRange) => s.delete(q, tx),
          openCursor: () => s.openCursor(tx),
        };
      },
    });
  }
  close(): void {}
}

/**
 * Put the file-backed database in place of the missing IndexedDB: records go under `dir`
 * (`dir/metadata/*.json`, `dir/plans/*.json`).
 */
export function installFileIndexedDb(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  // db.ts builds prefix ranges with IDBKeyRange.bound (lib/storage/db.ts prefixRange).
  const g = globalThis as { IDBKeyRange?: unknown };
  if (!g.IDBKeyRange) g.IDBKeyRange = { bound: (lower: string, upper: string): KeyRange => ({ lower, upper }) };
  const db = new FileDb(dir);
  db.openExisting();
  (globalThis as { indexedDB?: unknown }).indexedDB = {
    open(): Request {
      const req = new Request<FileDb>();
      setImmediate(() => {
        req.result = db;
        // db.ts creates the stores it is missing in `onupgradeneeded`, as a first visit does.
        if (!db.objectStoreNames.contains('plans') || !db.objectStoreNames.contains('metadata')) {
          req.onupgradeneeded?.({ target: req });
        }
        req.onsuccess?.({ target: req });
      });
      return req;
    },
  };
}
