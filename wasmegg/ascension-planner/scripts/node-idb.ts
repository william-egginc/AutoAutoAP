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
 * Deliberately tiny: only what db.ts calls, callbacks fired on a later tick (callers assign
 * `onsuccess` after `put()` returns), and every write is a temp file then a rename, so a run killed
 * mid-write leaves the previous record intact rather than half of a new one.
 */
import fs from 'node:fs';
import path from 'node:path';

type Handler = ((event: { target: unknown }) => void) | null;

class Request<T = unknown> {
  result: T | undefined = undefined;
  error: Error | null = null;
  onsuccess: Handler = null;
  onerror: Handler = null;
  onupgradeneeded: Handler = null;
  /** Settle on a later tick, so the caller has assigned its handlers. */
  settle(run: () => T): void {
    setImmediate(() => {
      try {
        this.result = run();
      } catch (e) {
        this.error = e instanceof Error ? e : new Error(String(e));
        this.onerror?.({ target: this });
        return;
      }
      this.onsuccess?.({ target: this });
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
  put(value: Record<string, unknown>): Request {
    const req = new Request();
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
  get(key: string): Request {
    const req = new Request();
    req.settle(() => (this.records.has(key) ? structuredClone(this.records.get(key)) : undefined));
    return req;
  }
  delete(key: string): Request {
    const req = new Request();
    req.settle(() => {
      this.records.delete(key);
      fs.rmSync(this.file(key), { force: true });
      return undefined;
    });
    return req;
  }
  openCursor(): Request {
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
  transaction(name: string): { objectStore: (n: string) => FileStore } {
    return {
      objectStore: (n: string) => {
        const s = this.stores.get(n ?? name);
        if (!s) throw new Error(`no object store ${n}`);
        return s;
      },
    };
  }
  close(): void {}
}

/**
 * Put the file-backed database in place of the missing IndexedDB: records go under `dir`
 * (`dir/metadata/*.json`, `dir/plans/*.json`).
 */
export function installFileIndexedDb(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
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
