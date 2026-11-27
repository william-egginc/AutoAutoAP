/**
 * spec-crosstab (7 Nov 2026, Safari with four egg-beta tabs, one of them an older build frozen since 5 Nov): the 5 s
 * open timeout (red team R1) bounds `indexedDB.open` only. The database never changes version, so another tab can't
 * block the open; what another tab CAN hold is a transaction. A tab frozen between its write and its commit keeps
 * every later transaction on that store waiting, in every tab, and no call here had a bound after the open: a read or
 * write then never answered. Now each one is told the database did not answer, and works again once it does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installSharedIdb } from '@/test/sharedIdb';

let idb: ReturnType<typeof installSharedIdb>;
let db: typeof import('./db');

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  idb = installSharedIdb();
  vi.stubGlobal('indexedDB', idb.indexedDB);
  vi.stubGlobal('IDBKeyRange', idb.IDBKeyRange);
  db = await import('./db');
  // This tab used the database before (it exists, version 1).
  const seeded = db.saveMetadata('h', 'draft', { a: 1 });
  await vi.advanceTimersByTimeAsync(10);
  await seeded;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** What a promise did within `ms` of fake time. */
async function within<T>(p: Promise<T>, ms: number): Promise<{ done: boolean; value?: T; error?: unknown }> {
  const out: { done: boolean; value?: T; error?: unknown } = { done: false };
  p.then(
    v => Object.assign(out, { done: true, value: v }),
    e => Object.assign(out, { done: true, error: e })
  );
  await vi.advanceTimersByTimeAsync(ms);
  return out;
}

describe('another tab frozen holding a write (spec-crosstab)', () => {
  it('the open still answers at once: only the transactions wait', async () => {
    idb.freezeTabHolding('metadata');
    const read = await within(db.loadMetadataPrefix('h', 'none'), 4_000);
    // Not the open timeout (5 s): the open answered, the transaction is what waits.
    expect(read.done).toBe(false);
    expect(idb.waitingCount()).toBeGreaterThan(0);
  });

  it('a read and a write are told the database did not answer, never left waiting for good', async () => {
    idb.freezeTabHolding('metadata');
    const read = await within(db.loadMetadata('h', 'draft'), 10 * 60_000);
    expect(read.done).toBe(true);
    expect(String(read.error)).toMatch(/did not answer/);
    const write = await within(db.putMetadataRecords('h', [{ key: 'checkpoint', value: { n: 1 } }]), 10 * 60_000);
    expect(write.done).toBe(true);
    expect(String(write.error)).toMatch(/did not answer/);
    const save = await within(db.saveMetadata('h', 'x', 1), 10 * 60_000);
    expect(String(save.error)).toMatch(/did not answer/);
    // Its own waiting transactions were let go: nothing of this tab's is left queued behind the frozen one.
    expect(idb.waitingCount()).toBe(0);
  });

  it('works again once the other tab lets go', async () => {
    const other = idb.freezeTabHolding('metadata');
    await within(db.loadMetadata('h', 'draft'), 10 * 60_000);
    other.thaw();
    await vi.advanceTimersByTimeAsync(10);
    const read = await within(db.loadMetadata('h', 'draft'), 1_000);
    expect(read).toEqual({ done: true, value: { a: 1 } });
  });

  it('a slow but answering database is not cut short', async () => {
    const other = idb.freezeTabHolding('metadata');
    const pending = within(db.loadMetadata('h', 'draft'), 3_000);
    setTimeout(() => other.thaw(), 2_000);
    expect(await pending).toEqual({ done: true, value: { a: 1 } });
  });
});
