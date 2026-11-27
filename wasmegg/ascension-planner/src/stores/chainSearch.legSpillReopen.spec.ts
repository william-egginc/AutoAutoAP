/**
 * Review 7 Nov 2026, finding 11 (first bullet): one spill-worker failure turned the spill off for the page. The store
 * kept the failed spill and `legSpillFor[kind]` (its account), so every later run reused the dead spill and never
 * called the opener again; and LegSpill.restore emptied its index before `backend.size()` threw. Now a later run opens
 * the spill again, and a restore that cannot read the file leaves the index as it was.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const db = new Map<string, unknown>();
const hangReads = false;
vi.mock('@/lib/storage/db', () => ({
  saveMetadata: vi.fn(async (hash: string, key: string, value: unknown) => void db.set(`${hash}/${key}`, value)),
  loadMetadata: vi.fn((hash: string, key: string) =>
    hangReads ? new Promise(() => undefined) : Promise.resolve(db.get(`${hash}/${key}`) ?? null)
  ),
  hashID: vi.fn(async (id: string) => id),
}));
const evaluated = vi.fn();
vi.mock('@/search/pool', async () => {
  const real = await vi.importActual<typeof import('@/search/pool')>('@/search/pool');
  return {
    WorkerLostError: real.WorkerLostError,
    createChainSearchPool: vi.fn(async () => ({
      size: 1,
      resize: () => 1,
      terminate: () => {},
      hurry: () => {},
      integrityWait: async () => null,
      evaluate: async (chains: number[][], progress?: (done: number, total: number) => void) => {
        evaluated();
        progress?.(chains.length, chains.length);
        return { results: chains.map(c => ({ chain: c, seconds: 100 * 86400 + c[0], legs: [] })) };
      },
    })),
  };
});

const { useChainSearchStore } = await import('./chainSearch');
const { useInitialStateStore } = await import('./initialState');
const { useActionsStore } = await import('./actions');
const { LegSpill, MemorySpillBackend } = await import('@/search/legSpill');

const SAVE_AT = 1_790_000_000;
const NOW = SAVE_AT * 1000 + 3600_000;
function loadSave(te: number): void {
  const iss = useInitialStateStore();
  const e = { curiosity: Math.min(98, te), integrity: te - Math.min(98, te), humility: 0, resilience: 0, kindness: 0 };
  iss.rawBackup = { approxTime: SAVE_AT, farms: [], virtue: { eovEarned: [e.curiosity, e.integrity, 0, 0, 0] }, game: {} } as never;
  iss.initialTeEarned = e;
  iss.epicResearchLevels = { cheaper_research: 1 } as never;
  const a = useActionsStore();
  a.actions[0].endState = { ...a.actions[0].endState, teEarned: e };
  a._initialSnapshot = { ...a.initialSnapshot, teEarned: e };
}
const SPACE = { lo: 200, hi: 299, step: 1, minAsc: 2, maxAsc: 2 };
let backing: Map<string, string>;

beforeEach(() => {
  db.clear();
  evaluated.mockClear();
  backing = new Map<string, string>();
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
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal('location', { origin: 'https://example.test' });
  vi.useFakeTimers({ now: NOW });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  setActivePinia(createPinia());
  useChainSearchStore().pinPlanStart(SAVE_AT + 600);
  loadSave(196);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A memory spill whose worker can fail: every call throws, as lib/legSpillOpfs.ts's dead worker does. */
function failingBackend() {
  const mem = new MemorySpillBackend();
  const state = { dead: false };
  const guard =
    <A extends unknown[], R>(f: (...a: A) => R) =>
    (...a: A): R => {
      if (state.dead) throw new Error('the spill worker failed (it did not load)');
      return f(...a);
    };
  const backend = {
    append: guard((b: Uint8Array) => mem.append(b)),
    read: guard((at: number, len: number) => mem.read(at, len)),
    sync: guard(() => mem.sync()),
    truncate: guard((n: number) => mem.truncate(n)),
    size: guard(() => mem.size()),
    close: guard(() => mem.close()),
  };
  return { backend, state };
}

describe('one spill-worker failure does not turn the spill off for the page (review 7 Nov, finding 11)', () => {
  it('the worker fails after a run: the next run opens the spill again', async () => {
    const backends: ReturnType<typeof failingBackend>[] = [];
    const opener = vi.fn(async () => {
      const b = failingBackend();
      backends.push(b);
      return new LegSpill(b.backend, 'UTC');
    });
    const store = useChainSearchStore();
    store.setLegSpillOpener(opener);
    await store.startExhaustive('P', SPACE);
    expect(opener).toHaveBeenCalledTimes(1);
    backends[0].state.dead = true;
    await store.startExhaustive('P', SPACE);
    expect(opener).toHaveBeenCalledTimes(2);
    expect(store.error).toBeNull();
  });

  it('the open itself failed: the next run asks again', async () => {
    const opener = vi.fn(async () => null);
    const store = useChainSearchStore();
    store.setLegSpillOpener(opener);
    await store.startExhaustive('P', SPACE);
    await store.startExhaustive('P', SPACE);
    expect(opener).toHaveBeenCalledTimes(2);
  });
});

describe('LegSpill.restore when the file cannot be read (review 7 Nov, finding 11)', () => {
  it('keeps its index: nothing is emptied before the size is known', async () => {
    const { backend, state } = failingBackend();
    const spill = new LegSpill(backend, 'UTC');
    spill.put('200,490', [{ endTE: 200, startTime: 0, endTime: 86400, durationSeconds: 86400, shifts: [] } as never]);
    await spill.commit();
    expect(spill.has('200,490')).toBe(true);
    state.dead = true;
    await expect(spill.restore(spill.bytes)).rejects.toThrow(/spill worker failed/);
    expect(spill.has('200,490')).toBe(true);
    expect(spill.count).toBe(1);
  });
});
