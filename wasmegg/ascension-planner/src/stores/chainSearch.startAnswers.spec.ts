/**
 * Review 7 Nov 2026, finding 7: the run's start limit (lib/runStorageLimit.ts) is "40 s WITHOUT AN ANSWER", but only
 * the spill worker's messages pushed its clock back. A carry-on whose checkpoint read took 25 s and whose kept save
 * took 20 s more (45 s in all, each answering well within 40 s) was abandoned with "storage didn't answer", and its
 * run mark removed. Every answer counts now: each IndexedDB answer, and the page's own work between the waits.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const db = new Map<string, unknown>();
/** How long the checkpoint read and the kept save's write take (ms). */
let readMs = 0;
let saveMs = 0;
const after = <T>(ms: number, v: T): Promise<T> => (ms ? new Promise(r => setTimeout(() => r(v), ms)) : Promise.resolve(v));
vi.mock('@/lib/storage/db', () => ({
  saveMetadata: vi.fn((hash: string, key: string, value: unknown) =>
    after(key.startsWith('chainSearchRunSave:') ? saveMs : 0, undefined).then(() => void db.set(`${hash}/${key}`, value))
  ),
  loadMetadata: vi.fn((hash: string, key: string) => after(key === 'chainSearchRun' ? readMs : 0, db.get(`${hash}/${key}`) ?? null)),
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
const { RUN_KEY, readRunMark } = await import('@/search/stepAway');
const { RUN_STORAGE_STUCK } = await import('@/lib/runStorageWords');

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

/** A run mark as the page writes it (search/stepAway.ts RunMark). */
function mark(o: Record<string, unknown>): string {
  return JSON.stringify({
    version: 1,
    kind: 'sweep',
    url: 'https://example.test/#/auto/fastest',
    account: 'P',
    startedAt: NOW - 3600_000,
    beatAt: NOW - 40 * 60_000,
    status: 'running',
    autoCarryOn: true,
    watch: false,
    fewerWorkers: false,
    workers: 7,
    reopens: [],
    autoCarries: [],
    ...o,
  });
}

beforeEach(() => {
  db.clear();
  readMs = 0;
  saveMs = 0;
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

const warned = (re: RegExp) => (console.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter(c => re.test(String(c[0])));

describe("the run's start limit is 40 s without an answer (review 7 Nov, finding 7)", () => {
  it('a checkpoint read of 25 s then a kept save of 20 s, no spill: the run starts, its mark kept', async () => {
    backing.set(RUN_KEY, mark({}));
    readMs = 25_000;
    saveMs = 20_000;
    const store = useChainSearchStore();
    void store.startExhaustive('P', SPACE);
    await vi.advanceTimersByTimeAsync(50_000);
    expect(store.error).toBeNull();
    expect(evaluated).toHaveBeenCalled();
    expect(warned(/did not answer within 40 s/)).toHaveLength(0);
    expect(readRunMark()).not.toBeNull();
  });

  it('one wait of over 40 s with no answer is still cut', async () => {
    readMs = 41_000;
    const store = useChainSearchStore();
    void store.startExhaustive('P', SPACE);
    await vi.advanceTimersByTimeAsync(45_000);
    expect(store.error).toBe(RUN_STORAGE_STUCK);
    expect(evaluated).not.toHaveBeenCalled();
  });
});
