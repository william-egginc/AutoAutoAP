/**
 * One browser's IndexedDB shared by several tabs (spec-crosstab, 7 Nov 2026): just enough of it for lib/storage/db.ts,
 * with the one rule that matters across tabs. Transactions on the same store queue behind each other across every
 * connection (a readwrite one is exclusive; readonly ones share with each other), and a transaction ends only when
 * its own page lets it commit. A tab frozen with a readwrite transaction open (`freezeTabHolding`: Safari suspended
 * the page between its put and its commit) therefore keeps every later transaction on that store, in any tab, waiting
 * for good. The open itself still answers at once: the version never changes, so nothing is blocked there.
 *
 * Requests answer as tasks (setTimeout 0), so a spec with fake timers advances them.
 */

type Row = Record<string, unknown>;
interface Range {
  lo: string;
  hi: string;
}
const inRange = (k: string, r: Range) => k >= r.lo && k <= r.hi;
const isRange = (q: unknown): q is Range => !!q && typeof q === 'object' && 'lo' in q && 'hi' in q;

interface FakeRequest {
  result?: unknown;
  error: unknown;
  onsuccess?: ((e: unknown) => void) | null;
  onerror?: ((e: unknown) => void) | null;
}
interface FakeTx {
  mode: 'readonly' | 'readwrite';
  scope: string[];
  state: 'waiting' | 'running' | 'done';
  /** Never commits: its page is frozen. */
  frozen: boolean;
  ops: (() => void)[];
  oncomplete?: (() => void) | null;
  onerror?: (() => void) | null;
  onabort?: (() => void) | null;
  error: unknown;
  objectStore(name: string): unknown;
  abort(): void;
}

export function installSharedIdb() {
  const stores = new Map<string, { keyPath: string; rows: Map<string, Row> }>();
  let created = false;
  const running: FakeTx[] = [];
  const waiting: FakeTx[] = [];
  const opens = { count: 0 };

  const conflicts = (a: FakeTx, b: FakeTx) =>
    (a.mode === 'readwrite' || b.mode === 'readwrite') && a.scope.some(s => b.scope.includes(s));

  function pump(): void {
    for (const tx of [...waiting]) {
      if (running.some(r => conflicts(r, tx)) || waiting.slice(0, waiting.indexOf(tx)).some(w => conflicts(w, tx))) continue;
      waiting.splice(waiting.indexOf(tx), 1);
      tx.state = 'running';
      running.push(tx);
      setTimeout(() => step(tx), 0);
    }
  }
  function finish(tx: FakeTx, how: 'complete' | 'abort'): void {
    if (tx.state === 'done') return;
    const wasWaiting = tx.state === 'waiting';
    tx.state = 'done';
    if (wasWaiting) waiting.splice(waiting.indexOf(tx), 1);
    else running.splice(running.indexOf(tx), 1);
    setTimeout(() => {
      if (how === 'complete') tx.oncomplete?.();
      else {
        tx.error = Object.assign(new Error('The transaction was aborted'), { name: 'AbortError' });
        tx.onabort?.();
      }
      pump();
    }, 0);
  }
  /** Runs the queued requests one task each; commits once none is left, unless its page is frozen. */
  function step(tx: FakeTx): void {
    if (tx.state !== 'running') return;
    const op = tx.ops.shift();
    if (op) {
      op();
      setTimeout(() => step(tx), 0);
    } else if (!tx.frozen) finish(tx, 'complete');
  }

  function request(tx: FakeTx, work: () => unknown): FakeRequest {
    const r: FakeRequest = { error: null };
    tx.ops.push(() => {
      r.result = work();
      r.onsuccess?.({ target: r });
    });
    return r;
  }

  function storeOf(tx: FakeTx, name: string) {
    const s = stores.get(name)!;
    return {
      put: (value: Row) => request(tx, () => void s.rows.set(String(value[s.keyPath]), structuredClone(value))),
      get: (key: string) => request(tx, () => s.rows.get(key)),
      delete: (q: string | Range) =>
        request(tx, () => {
          for (const k of [...s.rows.keys()]) if (isRange(q) ? inRange(k, q) : k === q) s.rows.delete(k);
        }),
      getAll: (q: Range) =>
        request(tx, () =>
          [...s.rows.keys()]
            .filter(k => inRange(k, q))
            .sort()
            .map(k => s.rows.get(k))
        ),
    };
  }

  function connection() {
    let closed = false;
    return {
      objectStoreNames: { contains: (n: string) => stores.has(n) },
      createObjectStore: (n: string, o: { keyPath: string }) => void stores.set(n, { keyPath: o.keyPath, rows: new Map() }),
      close: () => void (closed = true),
      onversionchange: null as unknown,
      transaction(scope: string | string[], mode: 'readonly' | 'readwrite' = 'readonly'): FakeTx {
        if (closed) throw Object.assign(new Error('The database connection is closing.'), { name: 'InvalidStateError' });
        const tx: FakeTx = {
          mode,
          scope: Array.isArray(scope) ? scope : [scope],
          state: 'waiting',
          frozen: false,
          ops: [],
          error: null,
          objectStore: (n: string) => storeOf(tx, n),
          abort: () => {
            if (tx.state === 'done') throw Object.assign(new Error('The transaction is finished.'), { name: 'InvalidStateError' });
            finish(tx, 'abort');
          },
        };
        waiting.push(tx);
        // Started once the page's own code has queued its requests (the end of this task), as a real one is.
        queueMicrotask(pump);
        return tx;
      },
    };
  }

  const indexedDB = {
    open(_name: string, _version: number) {
      opens.count++;
      const req: Record<string, unknown> & {
        result?: unknown;
        onsuccess?: () => void;
        onupgradeneeded?: (e: unknown) => void;
      } = {};
      setTimeout(() => {
        const db = connection();
        req.result = db;
        if (!created) {
          created = true;
          req.onupgradeneeded?.({ target: req });
        }
        req.onsuccess?.();
      }, 0);
      return req;
    },
  };
  const IDBKeyRange = { bound: (lo: string, hi: string): Range => ({ lo, hi }) };

  return {
    indexedDB,
    IDBKeyRange,
    opens,
    stores,
    /** Another tab writes to `store` and is frozen before its transaction commits; `thaw` lets it commit. */
    freezeTabHolding(store: string): { thaw(): void } {
      const tx = connection().transaction([store], 'readwrite');
      tx.frozen = true;
      (tx.objectStore(store) as ReturnType<typeof storeOf>).put({ [stores.get(store)?.keyPath ?? 'key']: 'other-tab', value: 1 });
      return {
        thaw() {
          tx.frozen = false;
          if (tx.state === 'running') setTimeout(() => step(tx), 0);
        },
      };
    },
    /** Transactions still waiting for their turn. */
    waitingCount: () => waiting.length,
  };
}
