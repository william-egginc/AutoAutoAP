/**
 * Review 7 Nov 2026, finding 9: a run whose storage timed out at its start (spec-stuck3, abandonRunStart) never ran,
 * but the run watcher read its end as the player's Stop: the long-run alert sent `start` then `stop` 'cancelled', and
 * the step-away mark was ended 'stopped'. It is reported as failed now (the alert's stop says 'failed'), never as
 * stopped, and never as a crash to carry on: the screen keeps its words (RUN_STORAGE_STUCK).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const db = new Map<string, unknown>();
/** The account's hash never answers. */
let hangHash = false;
vi.mock('@/lib/storage/db', () => ({
  saveMetadata: vi.fn(async (hash: string, key: string, value: unknown) => void db.set(`${hash}/${key}`, value)),
  loadMetadata: vi.fn(async (hash: string, key: string) => db.get(`${hash}/${key}`) ?? null),
  hashID: vi.fn((id: string) => (hangHash ? new Promise(() => undefined) : Promise.resolve(id))),
}));
const beacon = vi.hoisted(() => ({
  runBeaconRunStarted: vi.fn(),
  runBeaconRunEnded: vi.fn(),
  runBeaconPageClosing: vi.fn(),
}));
vi.mock('@/lib/runBeacon', () => beacon);
const stepAwayEnded = vi.hoisted(() => vi.fn());
vi.mock('@/composables/useStepAway', async () => {
  const real = await vi.importActual<typeof import('@/composables/useStepAway')>('@/composables/useStepAway');
  return {
    ...real,
    stepAwayRunEnded: (how: Parameters<typeof real.stepAwayRunEnded>[0]) => {
      stepAwayEnded(how);
      real.stepAwayRunEnded(how);
    },
  };
});
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
const { RUN_KEY } = await import('@/search/stepAway');
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
  hangHash = false;
  for (const f of Object.values(beacon)) f.mockClear();
  stepAwayEnded.mockClear();
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

describe('a run whose storage timed out at its start (review 7 Nov, finding 9)', () => {
  it('is not reported as a cancelled run: the alert never says cancelled, the step-away mark is never ended stopped', async () => {
    backing.set(RUN_KEY, mark({}));
    hangHash = true;
    const store = useChainSearchStore();
    void store.startExhaustive('P', SPACE);
    await vi.advanceTimersByTimeAsync(41_000);
    expect(store.isRunning).toBe(false);
    expect(store.error).toBe(RUN_STORAGE_STUCK);
    expect(evaluated).not.toHaveBeenCalled();
    // Failed, or nothing sent; never the player's Stop.
    expect(beacon.runBeaconRunEnded).not.toHaveBeenCalledWith('stopped');
    if (beacon.runBeaconRunStarted.mock.calls.length) expect(beacon.runBeaconRunEnded).toHaveBeenCalledWith('failed');
    expect(stepAwayEnded).not.toHaveBeenCalledWith('stopped');
    // And no crash for the watcher to carry on into the same wait: the mark is gone.
    expect(backing.has(RUN_KEY)).toBe(false);
  });

  it('a run the player stops still ends stopped', async () => {
    const store = useChainSearchStore();
    const run = store.startExhaustive('P', SPACE);
    store.stop();
    await vi.advanceTimersByTimeAsync(5_000);
    await run;
    expect(beacon.runBeaconRunEnded).toHaveBeenCalledWith('stopped');
  });
});
