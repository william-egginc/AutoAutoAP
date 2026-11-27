/**
 * The store's side of Safari's starting worker count (lib/safariWorkers.ts, 15 Nov 2026): Safari on 8 cores starts at
 * 5 even with 7 stored, the stored choice stays 7, other browsers start at 7, the last crash's carry-on count is the
 * next Safari start, and setting a count by hand clears it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const db = new Map<string, unknown>();
vi.mock('@/lib/storage/db', async () => (await import('@/test/memoryDb')).memoryDbModule(db));

const { useChainSearchStore, WORKERS_KEY } = await import('./chainSearch');
const { SAFARI_CRASH_WORKERS_KEY } = await import('@/lib/safariWorkers');

const SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15';
const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

beforeEach(() => {
  const backing = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => void backing.set(k, String(v)),
    removeItem: (k: string) => void backing.delete(k),
    clear: () => backing.clear(),
    key: (i: number) => [...backing.keys()][i] ?? null,
    get length() {
      return backing.size;
    },
  });
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: () => {}, removeEventListener: () => {} });
});

const start = (ua: string) => {
  vi.stubGlobal('navigator', { hardwareConcurrency: 8, userAgent: ua });
  setActivePinia(createPinia());
  return useChainSearchStore();
};

describe('Safari starting workers, in the store', () => {
  it('Safari on 8 cores with 7 stored starts at 5; the stored 7 is kept and Setup is told', () => {
    localStorage.setItem(WORKERS_KEY, '7');
    const s = start(SAFARI);
    expect(s.workerBudget).toBe(5);
    expect(localStorage.getItem(WORKERS_KEY)).toBe('7');
    expect(s.safariStart).toEqual({ workers: 5, chosen: 7 });
  });

  it('Chrome on the same machine starts at the stored 7', () => {
    localStorage.setItem(WORKERS_KEY, '7');
    const s = start(CHROME);
    expect(s.workerBudget).toBe(7);
    expect(s.safariStart).toBeNull();
  });

  it("the last Safari crash's carry-on count is the next start; a count set by hand clears it", () => {
    localStorage.setItem(WORKERS_KEY, '7');
    localStorage.setItem(SAFARI_CRASH_WORKERS_KEY, '4');
    const s = start(SAFARI);
    expect(s.workerBudget).toBe(4);
    s.setWorkersByHand(6);
    expect(s.workerBudget).toBe(6);
    expect(localStorage.getItem(SAFARI_CRASH_WORKERS_KEY)).toBeNull();
    expect(s.safariStart).toBeNull();
  });
});
