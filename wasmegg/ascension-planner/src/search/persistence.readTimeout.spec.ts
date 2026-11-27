/**
 * Review 7 Nov 2026, finding 2: an IndexedDB read that did not answer must never let a checkpoint write replace an
 * unfinished prior run. `saveCheckpoint` reads the prior record first (to merge it, or to set an unfinished other run
 * aside) and used to treat every read failure as "no prior": before spec-crosstab a stuck read waited for good, so
 * nothing was written; with the 30 s / 5 s transaction bound the read rejects, and if the other tab lets go before the
 * write, the new run's first checkpoint replaced the unfinished one, its priced chains lost.
 *
 * Real lib/storage/db.ts over the shared fake IndexedDB (src/test/sharedIdb.ts), so the error is the one db.ts throws.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installSharedIdb } from '@/test/sharedIdb';

let idb: ReturnType<typeof installSharedIdb>;
let persistence: typeof import('./persistence');

const HASH = 'partition';
const FP_OLD = 'player|1000|175|490|fc';

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  idb = installSharedIdb();
  vi.stubGlobal('indexedDB', idb.indexedDB);
  vi.stubGlobal('IDBKeyRange', idb.IDBKeyRange);
  persistence = await import('./persistence');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function unfinished(fingerprint: string, inputsKey: string, n: number) {
  return persistence.buildCheckpoint({
    fingerprint,
    effort: 'normal',
    seedChain: [195, 490],
    bestChain: [196, 232, 278, 318, 490],
    bestSeconds: 744 * 86400,
    entries: Array.from({ length: n }, (_, i) => ({ key: `k${i}`, seconds: 1000 + i, legs: [] })),
    stage: 'running',
    detail: '',
    chainsDone: n,
    inputsKey,
  });
}

/** A call's value once its requests (answered as timer tasks) have run. */
async function run<T>(p: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(100);
  return p;
}

async function settle<T>(p: Promise<T>, ms: number): Promise<{ done: boolean; error?: unknown }> {
  const out: { done: boolean; error?: unknown } = { done: false };
  p.then(
    () => (out.done = true),
    e => Object.assign(out, { done: true, error: e })
  );
  await vi.advanceTimersByTimeAsync(ms);
  return out;
}

describe('saveCheckpoint when the prior record did not answer (review 7 Nov, finding 2)', () => {
  it('a read timeout skips the write: the unfinished prior is still there (or set aside), never replaced', async () => {
    // An unfinished run of 1,000 priced chains, on another save (a different inputsKey).
    const seeded = settle(persistence.saveCheckpoint(HASH, unfinished(FP_OLD, 'save-A', 1000)), 100);
    expect((await seeded).error).toBeUndefined();

    // Another tab holds the store; the new run's first checkpoint reads the prior, which does not answer within
    // 30 s; the other tab then lets go, so the write itself would go through.
    const other = idb.freezeTabHolding('metadata');
    const write = persistence.saveCheckpoint(HASH, unfinished('player|1000|180|490|fc', 'save-B', 3));
    const timer = setTimeout(() => other.thaw(), 30_000 + 1);
    const out = await settle(write, 31_000);
    clearTimeout(timer);
    await vi.advanceTimersByTimeAsync(100);

    expect(out.done).toBe(true);
    const current = await run(persistence.loadAnyCheckpoint(HASH));
    const aside = await run(persistence.listInterrupted(HASH));
    const kept = [current, ...aside].find(r => r?.inputsKey === 'save-A');
    expect(kept, 'the unfinished run is gone').toBeTruthy();
    expect(kept!.durations.length).toBe(1000);
  });

  it('a genuine "no record" still writes', async () => {
    const out = await settle(persistence.saveCheckpoint(HASH, unfinished(FP_OLD, 'save-A', 3)), 100);
    expect(out.error).toBeUndefined();
    expect((await run(persistence.loadAnyCheckpoint(HASH)))?.inputsKey).toBe('save-A');
  });
});
