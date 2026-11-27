/**
 * The long-run alert's store hooks (lib/runBeacon.ts): the run watcher in stores/chainSearch.ts tells the beacon when a run
 * starts and how it ended (finished, stopped, failed), and the page's pagehide tells it the tab is closing. The beacon
 * itself decides whether anything is sent (runBeacon.spec.ts); here only that the hooks are called, once each, with the
 * build's own collector (never the board setting). That the hooks never throw or wait is runBeacon.spec.ts's (the real
 * functions, with fetch, sendBeacon and crypto failing); the calls are also last in their branches of the watcher.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

const db = new Map<string, unknown>();
vi.mock('@/lib/storage/db', () => ({
  saveMetadata: vi.fn(async (hash: string, key: string, value: unknown) => void db.set(`${hash}/${key}`, value)),
  loadMetadata: vi.fn(async (hash: string, key: string) => db.get(`${hash}/${key}`) ?? null),
  hashID: vi.fn(async (id: string) => id),
}));

const beacon = vi.hoisted(() => ({
  runBeaconRunStarted: vi.fn(),
  runBeaconRunEnded: vi.fn(),
  runBeaconPageClosing: vi.fn(),
}));
vi.mock('@/lib/runBeacon', () => beacon);

/** The batch (1-based) on which the worker is lost; 0 never. */
let loseOnBatch = 0;
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
        hurry: () => {},
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

const SUBMIT = 'https://collector.example.workers.dev/submit';
(globalThis as { __AAP_SUBMIT_URL__?: string }).__AAP_SUBMIT_URL__ = SUBMIT;

const { useChainSearchStore } = await import('./chainSearch');
const { useInitialStateStore } = await import('./initialState');
const { useActionsStore } = await import('./actions');

const SAVE_AT = 1_790_000_000;
function loadSave(te: number): void {
  const iss = useInitialStateStore();
  const e = { curiosity: Math.min(98, te), integrity: te - Math.min(98, te), humility: 0, resilience: 0, kindness: 0 };
  iss.rawBackup = {
    approxTime: SAVE_AT,
    farms: [],
    virtue: { eovEarned: [e.curiosity, e.integrity, 0, 0, 0] },
    game: {},
  } as never;
  iss.initialTeEarned = e;
  iss.epicResearchLevels = { cheaper_research: 1 } as never;
  const a = useActionsStore();
  a.actions[0].endState = { ...a.actions[0].endState, teEarned: e };
  a._initialSnapshot = { ...a.initialSnapshot, teEarned: e };
}

const SPACE = { lo: 200, hi: 299, step: 1, minAsc: 2, maxAsc: 2 };
let pagehide: Array<() => void>;

beforeEach(() => {
  db.clear();
  loseOnBatch = 0;
  onBatch = null;
  for (const f of Object.values(beacon)) f.mockClear();
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
  pagehide = [];
  vi.stubGlobal('window', {
    location: { href: 'https://planner.example/#/auto' },
    addEventListener: (type: string, fn: () => void) => {
      if (type === 'pagehide') pagehide.push(fn);
    },
    removeEventListener: () => {},
  });
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: () => {}, removeEventListener: () => {} });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(SAVE_AT * 1000 + 3600_000);
  setActivePinia(createPinia());
  useChainSearchStore().pinPlanStart(SAVE_AT + 600);
  loadSave(196);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await nextTick();
}

describe('the long-run alert hooks in the store', () => {
  it('a run that finishes: started with the build’s collector, then ended "finished", once each', async () => {
    const store = useChainSearchStore();
    await store.startExhaustive('EI1234567890123456', SPACE);
    await settle();
    expect(store.stage).not.toBe('failed');
    expect(beacon.runBeaconRunStarted).toHaveBeenCalledTimes(1);
    expect(beacon.runBeaconRunStarted).toHaveBeenCalledWith(SUBMIT);
    expect(beacon.runBeaconRunEnded).toHaveBeenCalledTimes(1);
    expect(beacon.runBeaconRunEnded).toHaveBeenCalledWith('finished');
    // No player ID reaches the beacon.
    expect(JSON.stringify([...Object.values(beacon)].map(f => f.mock.calls))).not.toMatch(/EI\d{16}/);
  });

  it('a run stopped by the player: ended "stopped"', async () => {
    const store = useChainSearchStore();
    onBatch = () => store.stop();
    await store.startExhaustive('EI1234567890123456', SPACE);
    await settle();
    expect(beacon.runBeaconRunStarted).toHaveBeenCalledTimes(1);
    expect(beacon.runBeaconRunEnded).toHaveBeenCalledTimes(1);
    expect(beacon.runBeaconRunEnded).toHaveBeenCalledWith('stopped');
  });

  it('a run that fails: ended "failed"', async () => {
    const store = useChainSearchStore();
    loseOnBatch = 1;
    await store.startExhaustive('EI1234567890123456', SPACE);
    await settle();
    expect(store.stage).toBe('failed');
    expect(beacon.runBeaconRunStarted).toHaveBeenCalledTimes(1);
    expect(beacon.runBeaconRunEnded).toHaveBeenCalledTimes(1);
    expect(beacon.runBeaconRunEnded).toHaveBeenCalledWith('failed');
  });

  it('pagehide tells the beacon the tab is closing', () => {
    useChainSearchStore();
    expect(pagehide.length).toBeGreaterThan(0);
    for (const fn of pagehide) fn();
    expect(beacon.runBeaconPageClosing).toHaveBeenCalledTimes(1);
  });
});
