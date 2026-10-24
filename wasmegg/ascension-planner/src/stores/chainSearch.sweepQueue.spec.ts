/**
 * A Full sweep queue (several chains from one click) used to live only in memory: after a crash or a
 * reload, Carry on ran the chain that was running and the rest of the queue was silently lost. The
 * queue now rides in the running chain's checkpoint, so it survives the reload and the carry-on goes
 * on with it; a fresh run clears it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const db = new Map<string, unknown>();
vi.mock('@/lib/storage/db', () => ({
  saveMetadata: vi.fn(async (hash: string, key: string, value: unknown) => void db.set(`${hash}/${key}`, value)),
  loadMetadata: vi.fn(async (hash: string, key: string) => db.get(`${hash}/${key}`) ?? null),
  hashID: vi.fn(async (id: string) => id),
}));

let onChain: ((chainsInBatch: number) => void) | null = null;
vi.mock('@/search/pool', () => ({
  createChainSearchPool: vi.fn(async () => ({
    size: 1,
    resize: () => 1,
    terminate: () => {},
    integrityWait: async () => null,
    evaluate: async (chains: number[][], progress?: (done: number, total: number) => void) => {
      const results = [];
      for (let i = 0; i < chains.length; i++) {
        vi.setSystemTime(Date.now() + 500);
        results.push({ chain: chains[i], seconds: 100 * 86400 + chains[i][0], legs: [] });
        progress?.(i + 1, chains.length);
        onChain?.(i + 1);
      }
      return { results };
    },
  })),
}));

const { useChainSearchStore } = await import('./chainSearch');
const { useInitialStateStore } = await import('./initialState');
const { useActionsStore } = await import('./actions');
const { loadAnyCheckpoint } = await import('@/search/persistence');

function installStubs(): void {
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
}

const SAVE_AT = 1_790_000_000;
function loadSave(te: number): void {
  const iss = useInitialStateStore();
  const c = Math.min(98, te);
  const i = Math.min(98, te - c);
  const e = { curiosity: c, integrity: i, humility: te - c - i, resilience: 0, kindness: 0 };
  iss.rawBackup = {
    approxTime: SAVE_AT,
    farms: [],
    virtue: { eovEarned: [e.curiosity, e.integrity, e.humility, 0, 0] },
    game: {},
  } as never;
  iss.initialTeEarned = e;
  iss.epicResearchLevels = { cheaper_research: 1 } as never;
  const a = useActionsStore();
  a.actions[0].endState = { ...a.actions[0].endState, teEarned: e };
  a._initialSnapshot = { ...a.initialSnapshot, teEarned: e };
}

/** A fresh page on the same browser: new stores, same IndexedDB. */
function reload(): ReturnType<typeof useChainSearchStore> {
  setActivePinia(createPinia());
  const store = useChainSearchStore();
  store.pinPlanStart(SAVE_AT + 600);
  loadSave(196);
  return store;
}

/** Four chains of 100 each (one checkpoint, from a different hundred each), then the target. */
const CHAINS = [0, 1, 2, 3].map(k => ({
  label: `Chain ${k + 1} · 2 ascensions`,
  spec: { lo: 200 + 100 * k, hi: 299 + 100 * k, step: 1, minAsc: 2, maxAsc: 2, minGap: 0 },
  count: 100,
  ascensions: 2,
}));

/** As the panel sets the queue up for chain `at` (search/sweepQueueRun.ts). */
function queueAt(store: ReturnType<typeof useChainSearchStore>, at: number): void {
  Object.assign(store.sweepQueue, {
    at,
    total: CHAINS.length,
    chains: CHAINS,
    counts: CHAINS.map(c => c.count),
    ascensions: CHAINS.map(c => c.ascensions),
    submit: true,
    name: 'Jo',
    results: [{ label: CHAINS[0].label, chain: [200, 490], days: 100, stopped: false, finish: 1 }],
  });
}

beforeEach(() => {
  db.clear();
  onChain = null;
  installStubs();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(SAVE_AT * 1000 + 3600_000);
  reload();
});
afterEach(() => vi.useRealTimers());

describe('a Full sweep queue across a reload', () => {
  it('survives: the carry-on offer knows the chain, the rest, the results and the submit intent', async () => {
    let store = useChainSearchStore();
    queueAt(store, 1);
    // Chain 2 prices a batch, then the page dies (stopped here, with no panel to end the queue).
    onChain = n => n === 32 && store.stop();
    await store.startExhaustive('P', CHAINS[1].spec);
    expect(store.error).toBeNull();

    store = reload();
    expect(store.sweepQueue.at).toBe(-1); // memory is gone
    await store.checkResumable('P');
    expect(store.crashedRun).not.toBeNull();
    const q = store.crashedQueue!;
    expect(q.next).toBe(1);
    expect(q.record.at).toBe(1);
    expect(q.record.handled).toBe(false);
    expect(q.record.chains.map(c => c.spec.lo)).toEqual([200, 300, 400, 500]);
    expect(q.record.results.map(r => r.label)).toEqual([CHAINS[0].label]);
    expect(q.record.submit).toBe(true);
    expect(q.record.name).toBe('Jo');
  });

  it('a chain that finished and was recorded: the offer stays, for the next chain, which the carry-on runs', async () => {
    let store = useChainSearchStore();
    queueAt(store, 1);
    await store.startExhaustive('P', CHAINS[1].spec);
    expect(store.stoppedEarly).toBe(false);
    // The panel, once the chain is recorded, sent and saved.
    await store.persistQueue('P', true);

    store = reload();
    await store.checkResumable('P');
    // Finished, so not an unfinished run on its own: offered for the queue's sake.
    expect(store.crashedRun?.complete).toBe(true);
    expect(store.crashedQueue?.next).toBe(2);

    // Carry on into chain 3, as the panel does (with the queue set up again from the record).
    queueAt(store, 2);
    expect(await store.resumeCrashedRun('P', CHAINS[2].spec)).toBe(true);
    expect(store.error).toBeNull();
    expect(store.searchSpace?.range).toEqual({ lo: 400, hi: 499, step: 1 });
    expect(store.bestChain[0]).toBe(400);
    // Its checkpoint carries the queue on, at chain 3.
    expect((await loadAnyCheckpoint('P'))?.queue).toMatchObject({ at: 2, handled: false });
  });

  it('the whole queue for the time left after the carry-on', async () => {
    let store = useChainSearchStore();
    queueAt(store, 1);
    onChain = n => n === 32 && store.stop();
    await store.startExhaustive('P', CHAINS[1].spec);
    store = reload();
    await store.checkResumable('P');
    queueAt(store, store.crashedQueue!.next);
    let total = 0;
    onChain = () => (total = store.sweepLeft?.chainsTotal ?? total);
    expect(await store.resumeCrashedRun('P')).toBe(true);
    expect(total).toBe(400);
  });

  it('the queue being over (or a fresh run) clears it: the carry-on runs that chain alone', async () => {
    let store = useChainSearchStore();
    queueAt(store, 1);
    onChain = n => n === 32 && store.stop();
    await store.startExhaustive('P', CHAINS[1].spec);
    store = reload();
    await store.checkResumable('P');
    expect(store.crashedQueue).not.toBeNull();
    // A fresh click clears it first (InsanePanel `start`).
    await store.persistQueue('P', null);
    expect(store.crashedQueue).toBeNull();
    expect(store.crashedRun).not.toBeNull();
    expect((await loadAnyCheckpoint('P'))?.queue).toBeUndefined();
  });

  it('a fresh single run writes no queue over the slot', async () => {
    let store = useChainSearchStore();
    queueAt(store, 1);
    onChain = n => n === 32 && store.stop();
    await store.startExhaustive('P', CHAINS[1].spec);
    expect((await loadAnyCheckpoint('P'))?.queue).toBeDefined();
    store = reload();
    onChain = null;
    await store.startExhaustive('P', CHAINS[1].spec);
    expect((await loadAnyCheckpoint('P'))?.queue).toBeUndefined();
  });
});
