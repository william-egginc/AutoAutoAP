/** spec-stuck3: a run's storage limit (lib/runStorageLimit.ts) is 40 s WITHOUT AN ANSWER, not 40 s in all. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageTimeout, storageLimit } from './runStorageLimit';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('the run storage limit', () => {
  it('a wait that never answers fails at 40 s, once, and every later wait at once', async () => {
    const expired = vi.fn();
    const limit = storageLimit('reading the last run', { onExpire: expired });
    let got: unknown = 'pending';
    limit.within(new Promise(() => undefined)).catch(e => (got = e));
    await vi.advanceTimersByTimeAsync(39_000);
    expect(got).toBe('pending');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(got).toBeInstanceOf(StorageTimeout);
    expect(expired).toHaveBeenCalledTimes(1);
    await expect(limit.within(Promise.resolve(1))).rejects.toBeInstanceOf(StorageTimeout);
  });

  it('a long restore that keeps answering (the spill worker replying) is never cut', async () => {
    let answered = Date.now();
    const limit = storageLimit('opening the search detail file', { progress: () => answered });
    let got: unknown = 'pending';
    const restore = new Promise(r => setTimeout(() => r('done'), 5 * 60_000));
    void limit.within(restore).then(v => (got = v), e => (got = e));
    for (let t = 0; t < 5 * 60; t += 10) {
      await vi.advanceTimersByTimeAsync(10_000);
      answered = Date.now();
    }
    expect(got).toBe('done');
    limit.done();
  });
});
