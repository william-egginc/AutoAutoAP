/**
 * The integrity check ahead of Start holds the instant answer back while it runs (InstantRoute.vue `integrityHold`).
 * A check whose worker never answers (it never started, or the browser took it away without an error, as Safari
 * does) held the answer behind "Checking whether this account can build…" for as long as the page stayed open:
 * after a reload in Safari the instant answer was gone (Jordan, 23 Oct 2026). Now it gives up after
 * INTEGRITY_PROBE_MS, counts as not measured (which never holds the answer) and lets the worker go.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { INTEGRITY_PROBE_MS, probeLimit, PROBE_TOO_LONG } from '@/search/instantIntegrity';

vi.mock('@/lib/storage/db', () => ({
  saveMetadata: vi.fn(async () => {}),
  loadMetadata: vi.fn(async () => null),
  hashID: vi.fn(async (id: string) => id),
}));

/** What the probe's worker does: answer with this many seconds, or never answer. */
let answer: number | null | 'never' = 'never';
const terminated = vi.fn();
vi.mock('@/search/pool', async () => {
  const real = await vi.importActual<typeof import('@/search/pool')>('@/search/pool');
  return {
    WorkerLostError: real.WorkerLostError,
    createChainSearchPool: vi.fn(async () => ({
      size: 1,
      terminate: terminated,
      integrityWait: () => (answer === 'never' ? new Promise<number | null>(() => {}) : Promise.resolve(answer)),
      integrityLowTe: () => null,
    })),
  };
});

const { useChainSearchStore } = await import('./chainSearch');
const { useInitialStateStore } = await import('./initialState');

beforeEach(() => {
  const backing = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => void backing.set(key, String(value)),
    removeItem: (key: string) => void backing.delete(key),
    clear: () => backing.clear(),
    key: (index: number) => [...backing.keys()][index] ?? null,
    get length() {
      return backing.size;
    },
  });
  setActivePinia(createPinia());
  useInitialStateStore().rawBackup = { approxTime: 1_790_000_000, farms: [], game: {} } as never;
  terminated.mockClear();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('probeIntegrity', () => {
  it('stops holding the answer once the check has run INTEGRITY_PROBE_MS without a reply', async () => {
    answer = 'never';
    const store = useChainSearchStore();
    const done = store.probeIntegrity('EI1234567890123456');
    await vi.advanceTimersByTimeAsync(0);
    expect(store.integrityChecking).toBe(true);
    await vi.advanceTimersByTimeAsync(INTEGRITY_PROBE_MS - 1000);
    expect(store.integrityChecking).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    await done;
    expect(store.integrityChecking).toBe(false);
    // Not measured: never a reason to hold the answer (instantIntegrity null).
    expect(store.integrityWait).toBeNull();
    expect(terminated).toHaveBeenCalled();
  });

  it('a check that answers in time is kept as before', async () => {
    answer = 7200;
    const store = useChainSearchStore();
    await store.probeIntegrity('EI1234567890123456');
    expect(store.integrityChecking).toBe(false);
    expect(store.integrityWait).toBe(7200);
    expect(terminated).toHaveBeenCalled();
  });
});

describe('probeLimit', () => {
  it('passes a result through, and rejects with PROBE_TOO_LONG past the limit', async () => {
    await expect(probeLimit(Promise.resolve(3), 10)).resolves.toBe(3);
    const late = probeLimit(new Promise(() => {}), 10);
    const caught = expect(late).rejects.toThrow(PROBE_TOO_LONG);
    await vi.advanceTimersByTimeAsync(10);
    await caught;
  });
});
