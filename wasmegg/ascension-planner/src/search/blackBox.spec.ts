import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beat,
  clearUnfinished,
  diagnosticsSummary,
  end,
  formatMB,
  memoryPhrase,
  pageClosing,
  pageShown,
  readUnfinished,
  summarizeWorkerHeaps,
  sumMemoEntries,
  workersNote,
} from './blackBox';

describe('black box', () => {
  beforeEach(() => {
    const backing = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => void backing.set(k, v),
    });
    pageShown();
  });

  it('reports a phase that never finished, with its last beat', () => {
    beat({ phase: 'search', detail: 'pricing every chain', done: 100, total: 58459 });
    beat({ phase: 'submit', detail: 'building the CSV' });
    const got = readUnfinished();
    expect(got?.last).toMatchObject({ phase: 'submit', detail: 'building the CSV' });
    expect(got?.history.length).toBe(2);
  });

  it('says nothing once the phase finished, or once dismissed', () => {
    beat({ phase: 'submit' });
    end('submit');
    expect(readUnfinished()).toBeNull();
    beat({ phase: 'search' });
    clearUnfinished();
    expect(readUnfinished()).toBeNull();
  });

  it('tells a reload or close apart from a crash', () => {
    beat({ phase: 'search' });
    expect(readUnfinished()?.last.pageClosed).toBeUndefined();
    pageClosing();
    expect(readUnfinished()?.last.pageClosed).toBe(true);
  });

  it('keeps a reload a reload when a beat lands after pagehide', () => {
    // A reload mid-run: pagehide, then the tab-hidden beat (visibilitychange) rewrites the open beat.
    beat({ phase: 'search', done: 10 });
    pageClosing();
    beat({ phase: 'search', done: 11 });
    expect(readUnfinished()?.last).toMatchObject({ done: 11, pageClosed: true });
    // Back from the back/forward cache: live again, so a later crash is still a crash.
    pageShown();
    beat({ phase: 'search', done: 12 });
    expect(readUnfinished()?.last.pageClosed).toBeUndefined();
  });

  it("keeps the workers' memory and the machine facts with the beat", () => {
    beat({ phase: 'deadline search', workersHeapMB: 2150, workerHeapMaxMB: 140, workersReporting: 19 });
    const got = readUnfinished();
    expect(got?.last).toMatchObject({ workersHeapMB: 2150, workerHeapMaxMB: 140, workersReporting: 19 });
    expect(got?.env).toHaveProperty('deviceMemoryGB');
    expect(got?.env).toHaveProperty('crossOriginIsolated');
  });
});

describe('black box memory helpers', () => {
  it('sums and maxes the worker heaps, skipping workers that could not say', () => {
    expect(summarizeWorkerHeaps([100, null, 250, undefined, 50])).toEqual({
      workersHeapMB: 400,
      workerHeapMaxMB: 250,
      workersReporting: 3,
    });
  });

  it('says unknown, not zero, when no worker could report', () => {
    expect(summarizeWorkerHeaps([null, null])).toEqual({
      workersHeapMB: null,
      workerHeapMaxMB: null,
      workersReporting: 0,
    });
    expect(summarizeWorkerHeaps([]).workersHeapMB).toBeNull();
  });

  it('formats MB and GB', () => {
    expect(formatMB(73)).toBe('73 MB');
    expect(formatMB(2150)).toBe('2.1 GB');
    expect(formatMB(1024)).toBe('1.0 GB');
  });

  it('phrases what is known for the crash notice', () => {
    expect(memoryPhrase({ heapMB: 73, workersHeapMB: 2150, workersReporting: 19 })).toBe(
      "73 MB on the page's main thread, 2.1 GB in 19 workers"
    );
    expect(memoryPhrase({ heapMB: 73, workersHeapMB: null, workersReporting: 0 })).toBe(
      "73 MB on the page's main thread"
    );
    expect(memoryPhrase({ workersHeapMB: 90, workersReporting: 1 })).toBe('90 MB in 1 worker');
    expect(memoryPhrase({})).toBe('');
  });

  it("says the workers' memory is not reported, and how full their caches were", () => {
    expect(sumMemoEntries([1200, null, 3000])).toBe(4200);
    expect(sumMemoEntries([null, undefined])).toBeNull();
    expect(workersNote({ workers: 2, workersHeapMB: null, workersMemoEntries: 4200 })).toBe(
      "The browser doesn't report how much memory the 2 workers used; their caches held 4,200 partial routes (6,000 when full)."
    );
    // A By a date run sizes its memos for the run: the workers say how big, and that is "full".
    expect(workersNote({ workers: 2, workersHeapMB: null, workersMemoEntries: 4200, workersMemoCapacity: 5172 })).toBe(
      "The browser doesn't report how much memory the 2 workers used; their caches held 4,200 partial routes (5,172 when full)."
    );
    expect(workersNote({ workers: 1, workersHeapMB: null })).toBe(
      "The browser doesn't report how much memory the 1 worker used."
    );
    expect(workersNote({ workers: 3, workersHeapMB: 400 })).toBe('');
    expect(workersNote({ workersHeapMB: null })).toBe('');
    beat({ phase: 'search', workers: 2, workersMemoEntries: 4200 });
    expect(readUnfinished()?.last.workersMemoEntries).toBe(4200);
  });

  describe('diagnosticsSummary', () => {
    beforeEach(() => {
      const backing = new Map<string, string>();
      vi.stubGlobal('localStorage', {
        getItem: (k: string) => backing.get(k) ?? null,
        setItem: (k: string, v: string) => void backing.set(k, v),
      });
      pageShown();
    });
    it('is a compact line of numbers and short labels, with the peaks over the beats', () => {
      beat({ phase: 'search', workers: 8, workersHeapMB: 900, workerHeapMaxMB: 150, workersMemoEntries: 12000, runNote: 'my secret note' });
      beat({ phase: 'search', workers: 6, workersHeapMB: 1200, workerHeapMaxMB: 200, workersMemoEntries: 9000 });
      const got = diagnosticsSummary({ browser: 'chrome on mac', cores: 10, workers: 6, carryOns: 1, crashed: null });
      expect(got).toMatchObject({
        browser: 'chrome on mac',
        cores: 10,
        workers: 6,
        carryOns: 1,
        lastVisitCrashed: false,
        peakWorkers: 8,
        peakWorkersHeapMB: 1200,
        peakWorkerHeapMaxMB: 200,
        peakMemoEntries: 12000,
      });
      const text = JSON.stringify(got);
      expect(text).not.toContain('secret');
      expect(text).not.toMatch(/EI\d{16}/);
      expect(text.length).toBeLessThan(800);
    });

    it('peaks cover only this run, not beats from before it started', () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(1_000_000);
        beat({ phase: 'search', workers: 19, workersHeapMB: 3000, workersMemoEntries: 45220 });
        vi.setSystemTime(2_000_000);
        beat({ phase: 'search', workers: 4, workersHeapMB: 100, workersMemoEntries: 500 });
        const got = diagnosticsSummary({
          browser: 'edge on windows', cores: 20, workers: 4, carryOns: 0, crashed: null, runStartedAt: 1_500_000,
        });
        expect(got.peakWorkers).toBe(4);
        expect(got.peakMemoEntries).toBe(500);
        expect(got.peakWorkersHeapMB).toBe(100);
      } finally {
        vi.useRealTimers();
      }
    });

    it('names the phase the last visit died in', () => {
      beat({ phase: 'submit', detail: 'building the CSV', workers: 4 });
      const crashed = readUnfinished()!.last;
      const got = diagnosticsSummary({ browser: 'safari on mac', cores: 8, workers: 4, carryOns: 0, crashed });
      expect(got.lastVisitCrashed).toBe(true);
      expect(got.crash).toMatchObject({ phase: 'submit', detail: 'building the CSV', workers: 4 });
    });
  });
});
