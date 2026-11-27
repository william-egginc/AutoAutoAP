/**
 * spec-stuck3 (7 Nov 2026): the spill worker's asks are bounded (lib/legSpillOpfs.ts `SpillWorker`). A worker that never
 * answers (an OPFS call that never returns, a worker that never loaded) used to keep the spill's open waiting for good,
 * and with it a run's start with the running flags set. Now the open rejects after the bound (or at once on the
 * worker's error), the page goes on with no spill (as when another tab holds the file), and the next open makes a new
 * worker.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lastSpillOpenFailure, openPageLegSpill, resetSpillWorker, setSpillAskMs } from './legSpillOpfs';

/** What the fake worker does with each request. */
let behaviour: 'silent' | 'answer' | 'error' = 'silent';
const made: FakeWorker[] = [];
class FakeWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message: string; preventDefault?: () => void }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  constructor() {
    made.push(this);
    if (behaviour === 'error') setTimeout(() => this.onerror?.({ message: 'failed to load', preventDefault: () => {} }), 10);
  }
  postMessage(m: { id: number }): void {
    if (behaviour === 'answer') setTimeout(() => this.onmessage?.({ data: { id: m.id, ok: true, size: 0 } }), 10);
  }
  terminate(): void {
    this.terminated = true;
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  made.length = 0;
  behaviour = 'silent';
  resetSpillWorker();
  setSpillAskMs(null);
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('navigator', { storage: { getDirectory: async () => ({}) } });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  setSpillAskMs(null);
  resetSpillWorker();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the spill worker never keeps a caller waiting for good', () => {
  it('a worker that never answers: the open gives up after 30 s with no spill, and the worker is let go', async () => {
    let settled: unknown = 'pending';
    void openPageLegSpill('deadline', 'a'.repeat(64), 'UTC').then(s => (settled = s));
    await vi.advanceTimersByTimeAsync(29_000);
    expect(settled).toBe('pending');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(settled).toBeNull();
    expect(lastSpillOpenFailure()).toBe('error');
    expect(made[0].terminated).toBe(true);
    expect(console.warn).toHaveBeenCalled();
  });

  it('a worker that fails to load: the open gives up at once', async () => {
    behaviour = 'error';
    let settled: unknown = 'pending';
    void openPageLegSpill('fastest', 'b'.repeat(64), 'UTC').then(s => (settled = s));
    await vi.advanceTimersByTimeAsync(100);
    expect(settled).toBeNull();
    expect(made[0].terminated).toBe(true);
  });

  it('after a worker was let go, the next open makes a new one, and a worker that answers opens', async () => {
    void openPageLegSpill('fastest', 'c'.repeat(64), 'UTC');
    await vi.advanceTimersByTimeAsync(31_000);
    behaviour = 'answer';
    let settled: unknown = 'pending';
    void openPageLegSpill('fastest', 'c'.repeat(64), 'UTC').then(s => (settled = s));
    await vi.advanceTimersByTimeAsync(100);
    expect(made).toHaveLength(2);
    expect(settled).not.toBeNull();
    expect(settled).not.toBe('pending');
  });
});
