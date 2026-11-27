/**
 * A search worker lost mid-run (red team 21 Oct 2026, data-inputs #5): the run used to freeze, and
 * Stop & keep best counted "Stopping... 120 s" for good. Now the pool fails the lost worker's requests
 * with `WorkerLostError` (pool.spec.ts), and the store ends the run with the best route so far, says a
 * worker stopped, and Stop hurries the pool so it never waits on a worker that is gone.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const db = new Map<string, unknown>();
vi.mock('@/lib/storage/db', () => ({
  saveMetadata: vi.fn(async (hash: string, key: string, value: unknown) => void db.set(`${hash}/${key}`, value)),
  loadMetadata: vi.fn(async (hash: string, key: string) => db.get(`${hash}/${key}`) ?? null),
  hashID: vi.fn(async (id: string) => id),
}));

/** The batch (1-based) on which the worker is lost; 0 never. */
let loseOnBatch = 0;
const hurried = vi.fn();
/** Called at each batch, while the run is in it. */
let onBatch: (() => void) | null = null;
vi.mock('@/search/pool', async () => {
  const real = await vi.importActual<typeof import('@/search/pool')>('@/search/pool');
  let batch = 0;
  return {
    WorkerLostError: real.WorkerLostError,
    createChainSearchPool: vi.fn(async () => {
      batch = 0;
      return {
        size: 1,
        resize: () => 1,
        terminate: () => {},
        hurry: hurried,
        integrityWait: async () => null,
        evaluate: async (chains: number[][], progress?: (done: number, total: number) => void) => {
          batch++;
          onBatch?.();
          if (batch === loseOnBatch) throw new real.WorkerLostError('worker 0 stopped responding: no progress for 45s');
          const results = chains.map(c => ({ chain: c, seconds: 100 * 86400 + c[0], legs: [] }));
          progress?.(chains.length, chains.length);
          return { results };
        },
      };
    }),
  };
});

const { useChainSearchStore } = await import('./chainSearch');
const { useInitialStateStore } = await import('./initialState');
const { useActionsStore } = await import('./actions');

const SAVE_AT = 1_790_000_000;
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

beforeEach(() => {
  db.clear();
  loseOnBatch = 0;
  onBatch = null;
  hurried.mockClear();
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
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: () => {}, removeEventListener: () => {} });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(SAVE_AT * 1000 + 3600_000);
  setActivePinia(createPinia());
  useChainSearchStore().pinPlanStart(SAVE_AT + 600);
  loadSave(196);
});
afterEach(() => vi.useRealTimers());

describe('a worker lost mid-run', () => {
  it('ends the run with the best route so far and says a worker stopped', async () => {
    const store = useChainSearchStore();
    loseOnBatch = 2;
    await store.startExhaustive('P', SPACE);
    expect(store.error).toBeNull();
    expect(store.isRunning).toBe(false);
    expect(store.stage).toBe('stopped');
    expect(store.stoppedEarly).toBe(true);
    expect(store.bestDays).toBeGreaterThan(0);
    expect(store.bestChain.length).toBeGreaterThan(0);
    expect(store.runNotes.join(' ')).toMatch(/A search worker stopped, so the search ended early with the best route/);
  });

  it('with nothing found yet it is still a failure, with the reason', async () => {
    const store = useChainSearchStore();
    loseOnBatch = 1;
    await store.startExhaustive('P', SPACE);
    expect(store.stage).toBe('failed');
    expect(store.error).toMatch(/stopped responding/);
  });

  it('Stop hurries the pool, so it never waits on a worker that is gone', async () => {
    const store = useChainSearchStore();
    onBatch = () => store.stop();
    await store.startExhaustive('P', SPACE);
    expect(hurried).toHaveBeenCalled();
  });
});
