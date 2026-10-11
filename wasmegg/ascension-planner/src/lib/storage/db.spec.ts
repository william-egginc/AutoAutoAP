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
