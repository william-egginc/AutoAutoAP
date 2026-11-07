/**
 * spec-stuck3 (7 Nov 2026): a run's start (and end) never leaves the running flags set for good. Between setting
 * isRunning and clearing it a run awaits the browser's storage (the checkpoint read, the leg spill's open and restore);
 * when one of those never answered, isRunning stayed true, My runs' simulation waited "for a search to end" and the
 * Build-up tracker said "working it out" for good. Now: past 40 s with no answer the run does not start, the flags
 * are cleared, the screen says why, the console says why (once), and the run mark is removed (only that one), so
 * nothing carries the run on into the same wait again. And Jordan's real mark (a finished By a date run) pins nothing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const db = new Map<string, unknown>();
/** The checkpoint read never answers. */
let hangReads = false;
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
const { RUN_KEY, autoCarryOnVerdict, runAliveElsewhere, readRunMark } = await import('@/search/stepAway');
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
  hangReads = false;
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

describe("a run's start whose storage never answers", () => {
  it('a stale run mark and a checkpoint read that never answers: not running within 40 s, the mark removed, said once', async () => {
    backing.set(RUN_KEY, mark({}));
    hangReads = true;
    const store = useChainSearchStore();
    let ended = false;
    void store.startExhaustive('P', SPACE).then(() => (ended = true));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(store.isRunning).toBe(true);
    await vi.advanceTimersByTimeAsync(40_000);
    expect(ended).toBe(true);
    expect(store.isRunning).toBe(false);
    expect(store.busy).toBe(false);
    expect(store.error).toBe(RUN_STORAGE_STUCK);
    expect(evaluated).not.toHaveBeenCalled();
    expect(backing.has(RUN_KEY)).toBe(false);
    expect(warned(/did not answer within 40 s/)).toHaveLength(1);
    // The page is usable: the next Run (storage answering again) runs.
    hangReads = false;
    await store.startExhaustive('P', SPACE);
    expect(evaluated).toHaveBeenCalled();
    expect(store.isRunning).toBe(false);
  });

  it("a spill whose open never answers: the same, and another tab's live run keeps its mark", async () => {
    backing.set(RUN_KEY, mark({ beatAt: NOW - 10_000, kind: 'deadline' }));
    const store = useChainSearchStore();
    store.setLegSpillOpener(() => new Promise(() => undefined));
    void store.startExhaustive('P', SPACE);
    await vi.advanceTimersByTimeAsync(41_000);
    expect(store.isRunning).toBe(false);
    expect(store.error).toBe(RUN_STORAGE_STUCK);
    expect(backing.has(RUN_KEY)).toBe(true);
  });

  it('a slow checkpoint read that answers within the limit starts the run as before', async () => {
    const store = useChainSearchStore();
    void store.startExhaustive('P', SPACE);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(store.error).toBeNull();
    expect(evaluated).toHaveBeenCalled();
  });
});

describe("Jordan's real run mark (7 Nov 2026) pins nothing", () => {
  // A By a date run that finished at 1:43 pm, read on a fresh load at 2:47 pm: no `at` field (the mark never had one).
  const JORDAN = () =>
    mark({
      kind: 'deadline',
      url: 'https://example.test/#/auto/by-date',
      startedAt: NOW - 67 * 60_000,
      beatAt: NOW - 64 * 60_000,
      endedAt: NOW - 64 * 60_000 + 12_000,
      status: 'finished',
      autoCarryOn: true,
      watch: true,
      workers: 7,
    });
  it('a fresh store with it sets no running flag, keeps it, and nothing reads it as a run going or to carry on', async () => {
    backing.set(RUN_KEY, JORDAN());
    setActivePinia(createPinia());
    const store = useChainSearchStore();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(store.isRunning).toBe(false);
    expect(store.deadlineRunning).toBe(false);
    expect(store.busy).toBe(false);
    expect(store.resultSending).toBe(false);
    const m = readRunMark();
    expect(m?.status).toBe('finished');
    for (const kind of ['smart', 'sweep', 'deadline'] as const)
      expect(runAliveElsewhere({ mark: m, kind, account: 'P', now: Date.now(), lockHeld: false, runningHere: false })).toBe(false);
    expect(
      autoCarryOnVerdict({ mark: m, kind: 'deadline', account: 'P', now: Date.now(), crash: null, lockHeld: false, canCarryOn: true })
    ).toEqual({ go: false, why: 'off' });
  });
});
