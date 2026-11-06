import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveMetadata } from './db';

/** Just enough of IndexedDB for one put: the test fires the put's success and the commit itself. */
function fakeIDB() {
  const tx: Record<string, unknown> & { oncomplete?: () => void; onabort?: () => void } = {};
  const request: { onsuccess?: () => void; onerror?: () => void; error: null } = { error: null };
  tx.objectStore = () => ({ put: () => request });
  const db = { transaction: () => tx, objectStoreNames: { contains: () => true } };
  vi.stubGlobal('indexedDB', {
    open: () => {
      const r: { result: unknown; onsuccess?: () => void } = { result: db };
      queueMicrotask(() => r.onsuccess?.());
      return r;
    },
  });
  return { tx, request };
}

const tick = () => new Promise(r => setTimeout(r, 0));

describe('saveMetadata', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('resolves when the transaction commits, not when the put succeeds', async () => {
    const { tx, request } = fakeIDB();
    let done = false;
    const p = saveMetadata('h', 'k', { a: 1 }).then(() => (done = true));
    await tick();
    request.onsuccess?.();
    await tick();
    expect(done).toBe(false);
    tx.oncomplete?.();
    await p;
    expect(done).toBe(true);
  });

  it('rejects when the transaction aborts after the put succeeded', async () => {
    const { tx, request } = fakeIDB();
    const p = saveMetadata('h', 'k', { a: 1 });
    await tick();
    request.onsuccess?.();
    tx.onabort?.();
    await expect(p).rejects.toThrow(/aborted/);
  });
});

/**
 * Red team 6 Nov 2026, R1: `indexedDB.open` that never answers (blocked storage, WebKit's known hang) left every
 * caller waiting for good, the page's startup among them. Now it is told there is no database after 5 s, later
 * calls fail at once while that open is still out, and a database that was only slow is used again once it answers.
 */
describe('openDB that does not answer', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function hangingIDB(stored: Record<string, unknown>) {
    const opens: { result?: unknown; onsuccess?: () => void; onerror?: () => void }[] = [];
    let closed = 0;
    const db = {
      objectStoreNames: { contains: () => true },
      close: () => void closed++,
      transaction: () => ({
        objectStore: () => ({
          get: (key: string) => {
            const r: { result?: unknown; onsuccess?: () => void } = {};
            queueMicrotask(() => {
              r.result = key in stored ? { value: stored[key] } : undefined;
              r.onsuccess?.();
            });
            return r;
          },
        }),
      }),
    };
    vi.stubGlobal('indexedDB', {
      open: () => {
        const r: (typeof opens)[number] = {};
        opens.push(r);
        return r;
      },
    });
    /** The first open still out answers now, late. */
    const answer = () => {
      const r = opens.find(o => o.result === undefined)!;
      r.result = db;
      r.onsuccess?.();
    };
    return { opens, answer, closed: () => closed };
  }

  it('rejects after the timeout, fails at once while the open is out, and works again once it answers late', async () => {
    vi.useFakeTimers();
    const idb = hangingIDB({ h_k: { mine: 1 } });
    const { loadMetadata } = await import('./db');

    const first = loadMetadata('h', 'k');
    const settled = vi.fn();
    first.then(settled, settled);
    await vi.advanceTimersByTimeAsync(4900);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    // Told by 5 s (before: never, and the page's startup waited with it).
    expect(settled).toHaveBeenCalledTimes(1);
    await expect(first).rejects.toThrow(/did not open within 5 s/);

    // No-DB mode: no second 5 s wait, and no second open.
    await expect(loadMetadata('h', 'k')).rejects.toThrow(/not answering/);
    expect(idb.opens).toHaveLength(1);

    // It was only slow: its late connection is closed, nothing was written, and the next call reads the data.
    idb.answer();
    expect(idb.closed()).toBe(1);
    const again = loadMetadata('h', 'k');
    await vi.advanceTimersByTimeAsync(0);
    idb.answer();
    await expect(again).resolves.toEqual({ mine: 1 });
  });
});
