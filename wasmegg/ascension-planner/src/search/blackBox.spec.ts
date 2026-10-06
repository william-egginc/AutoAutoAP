import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beat,
  clearUnfinished,
  end,
  formatMB,
  memoryPhrase,
  pageClosing,
  readUnfinished,
  summarizeWorkerHeaps,
} from './blackBox';

describe('black box', () => {
  beforeEach(() => {
    const backing = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => void backing.set(k, v),
    });
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
      '73 MB on the page, 2.1 GB in 19 workers'
    );
    expect(memoryPhrase({ heapMB: 73, workersHeapMB: null, workersReporting: 0 })).toBe('73 MB on the page');
    expect(memoryPhrase({ workersHeapMB: 90, workersReporting: 1 })).toBe('90 MB in 1 worker');
    expect(memoryPhrase({})).toBe('');
  });
});
