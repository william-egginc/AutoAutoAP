/**
 * A stalled instant-answer download (QA break-it #6, 22 Oct 2026): fetchTable had no limit, so "Loading the
 * instant answer" spun forever. Now 30 s without a byte aborts the request and rejects, and the card shows the
 * same "couldn't be loaded" state with Retry as a missing file (InstantRoute.unloaded.spec.ts).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TABLE_STALLED, TABLE_STALL_MS, fetchTable, tableLoadFailed } from './tableFetch';

afterEach(() => vi.useRealTimers());

async function caught(p: Promise<unknown>): Promise<Error | null> {
  return p.then(
    () => null,
    (e: Error) => e
  );
}

describe('fetchTable gives up on a stalled download', () => {
  it('no answer at all: aborted and rejected at 30 s, without trying the plain file too', async () => {
    vi.useFakeTimers();
    expect(TABLE_STALL_MS).toBe(30_000);
    const signals: AbortSignal[] = [];
    const urls: string[] = [];
    const fetch = vi.fn((url: string, init?: RequestInit) => {
      urls.push(url);
      if (init?.signal) signals.push(init.signal);
      return new Promise<Response>(() => {}); // ignores the abort, as a request held open did
    });
    const p = caught(fetchTable('precompute/t.bin', { fetch }));
    await vi.advanceTimersByTimeAsync(TABLE_STALL_MS - 1);
    expect(signals[0].aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const e = await p;
    expect(e?.message).toBe(TABLE_STALLED);
    expect(tableLoadFailed(e!.message)).toBe(true);
    expect(signals[0].aborted).toBe(true);
    expect(urls).toEqual(['precompute/t.bin.gz']);
  });

  it('headers then silence mid-body: the same, 30 s after the last byte', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new Uint8Array([1, 2, 3])); // then nothing, ever
        },
      });
      return new Response(body, { headers: { 'content-type': 'application/octet-stream' } });
    });
    const p = caught(fetchTable('precompute/t.bin', { fetch }));
    await vi.advanceTimersByTimeAsync(TABLE_STALL_MS);
    expect((await p)?.message).toBe(TABLE_STALLED);
  });

  it('a slow download that keeps arriving is never cut off', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => {
      let pushes = 0;
      const body = new ReadableStream<Uint8Array>({
        async pull(c) {
          await new Promise(r => setTimeout(r, TABLE_STALL_MS - 1000));
          if (++pushes > 4) c.close();
          else c.enqueue(new Uint8Array([0]));
        },
      });
      return new Response(body, { headers: { 'content-type': 'application/octet-stream' } });
    });
    const p = caught(fetchTable('precompute/t.bin', { fetch }));
    await vi.advanceTimersByTimeAsync(12 * TABLE_STALL_MS);
    // Both files read in full (each well past one 30 s window), then refused as not a file: never a stall.
    const e = await p;
    expect(e).toBeInstanceOf(Error);
    expect(e!.message).not.toBe(TABLE_STALLED);
  });

  it('no connection reads as a load failure as well', () => {
    for (const m of ['TypeError: Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed'])
      expect(tableLoadFailed(m)).toBe(true);
    expect(tableLoadFailed('out of memory')).toBe(false);
  });
});
