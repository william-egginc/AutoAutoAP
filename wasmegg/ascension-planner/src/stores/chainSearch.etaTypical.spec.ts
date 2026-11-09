/**
 * Fast's time from what Fast really prices, not from its upper bound (decision, 9 Nov 2026, after the tester's
 * R7 report: "about 36 hours" before Start, a search of about 20 minutes). Fast's route count (`estimateChains`,
 * ~915 on a 5-ascension route) is an UPPER bound: descent stops as soon as nothing moves, and a Fast run priced
 * 492-602 of ~915 in the browser repro (aaap-tools/notes/eta-swing-2026-11-09.md). Priced at the bound, How long
 * read about twice the real time, and the time left ended a run with ~15 min still showing.
 *
 * The typical count: what this device's finished runs at this level really priced, as a share of their bound,
 * applied to this run's bound. On a device's first Fast run, a built-in share measured from real Fast runs
 * (`DEFAULT_FAST_SHARE`, lib/fastTypical.ts), not the bound.
 *
 * The pool is a stub on fake time: nothing runs, nothing is sent.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const db = new Map<string, unknown>();
vi.mock('@/lib/storage/db', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/storage/db')>()),
  saveMetadata: vi.fn(async (hash: string, key: string, value: unknown) => void db.set(`${hash}/${key}`, value)),
  loadMetadata: vi.fn(async (hash: string, key: string) => db.get(`${hash}/${key}`) ?? null),
  hashID: vi.fn(async (id: string) => id),
}));

/** Each chain takes 0.5 s of (fake) wall clock on the one worker; `onChain` sees the store mid-batch. */
let onChain: ((chainsInBatch: number) => void) | null = null;
const MS_PER_CHAIN = 500;
/** Each chain's (fake) cost; a test may make the first batch faster, as the coarse scan is. */
let chainMs: () => number = () => MS_PER_CHAIN;
/** Batches the pool has been handed this test. */
let batches = 0;
vi.mock('@/search/pool', async importOriginal => ({
  ...(await importOriginal<typeof import('@/search/pool')>()),
  createChainSearchPool: vi.fn(async () => ({
    size: 1,
    resize: () => 1,
    warm: () => {},
    terminate: () => {},
    integrityWait: async () => {
      // Starting the workers and the integrity check take a while; none of it is a chain's cost.
      vi.setSystemTime(Date.now() + 20_000);
      return null;
    },
    evaluate: async (chains: number[][], progress?: (done: number, total: number) => void) => {
      const results = [];
      batches++;
      for (let i = 0; i < chains.length; i++) {
        vi.setSystemTime(Date.now() + chainMs());
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
const { loadChainBenchmark } = await import('@/lib/chainBenchmarkCache');
const { DEFAULT_FAST_SHARE } = (await import('@/lib/fastTypical')) as unknown as { DEFAULT_FAST_SHARE: number };
const { sweepSeconds, workerSecondsFromRate, workerSecondsPerChain } = await import('@/search/speed');

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
function earned(te: number) {
  const c = Math.min(98, te);
  const i = Math.min(98, te - c);
  return { curiosity: c, integrity: i, humility: te - c - i, resilience: 0, kindness: 0 };
}
function loadSave(te: number): void {
  const iss = useInitialStateStore();
  const e = earned(te);
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

/** 100 chains: one checkpoint each from 200 to 299, then the target. */
const SPACE = { lo: 200, hi: 299, step: 1, minAsc: 2, maxAsc: 2 };

beforeEach(() => {
  db.clear();
  onChain = null;
  chainMs = () => MS_PER_CHAIN;
  batches = 0;
  installStubs();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(SAVE_AT * 1000 + 3600_000);
  setActivePinia(createPinia());
  useChainSearchStore().pinPlanStart(SAVE_AT + 600);
  loadSave(196);
});
afterEach(() => vi.useRealTimers());

/** A finished Fast run with the stub pool: its routes priced and the bound it ran against. */
async function fastRun() {
  const store = useChainSearchStore();
  await store.start('P');
  expect(store.error).toBeNull();
  expect(store.finishedCleanly).toBe(true);
  return { priced: store.chainsDone, bound: store.chainsEstimated };
}

/** The next visit on this device: a fresh store, the kept speed restored (InsanePanel's mount). */
function nextVisit() {
  setActivePinia(createPinia());
  const next = useChainSearchStore();
  next.pinPlanStart(SAVE_AT + 600);
  loadSave(196);
  next.restoreBenchmark('P');
  return next;
}

describe("Fast's How long before Start", () => {
  it("a first run on a device: Fast's built-in typical share of the bound, not the bound", () => {
    const store = useChainSearchStore();
    const e = store.smartEstimate('quick');
    expect(e.measured).toBe(false);
    const typical = Math.round(e.chains * DEFAULT_FAST_SHARE);
    expect(e.typical).toBe(typical);
    expect(e.seconds).toBeCloseTo(
      sweepSeconds(typical, store.workerBudget, workerSecondsPerChain(store.seedChain.length)),
      6
    );
  });

  it('after a finished run: priced at what Fast really prices here, not at the bound', async () => {
    const { priced, bound } = await fastRun();
    // The stub's descent stops well short of the bound, as real Fast runs do.
    expect(priced).toBeLessThan(bound * 0.8);
    const next = nextVisit();
    const e = next.smartEstimate('quick');
    expect(e.measured).toBe(true);
    const atBound = sweepSeconds(
      e.chains,
      next.workerBudget,
      workerSecondsFromRate(next.secondsPerChain, next.rateWorkers)
    );
    const share = priced / bound;
    // The same share of this bound, at the kept speed: within 10% of it, and well under the bound's time.
    expect(e.seconds).toBeGreaterThan(atBound * share * 0.9);
    expect(e.seconds).toBeLessThan(atBound * share * 1.1);
  });
});

describe("a Fast run's time left", () => {
  it('runs out with the run, not with ~15 min still showing', async () => {
    await fastRun();
    // The second run on this device knows what Fast prices here.
    setActivePinia(createPinia());
    const store = useChainSearchStore();
    store.pinPlanStart(SAVE_AT + 600);
    loadSave(196);
    const seen: { at: number; left: number | null }[] = [];
    onChain = () => {
      const p = store.runProgress;
      if (p && p.kind === 'smart' && !p.measuring) seen.push({ at: Date.now(), left: p.secondsLeft });
    };
    await store.start('P');
    expect(store.error).toBeNull();
    const end = Date.now();
    // Over the last quarter of the run, the time left is never more than twice the real time left plus a minute.
    const t0 = seen[0].at;
    const late = seen.filter(s => s.at - t0 > 0.75 * (end - t0));
    expect(late.length).toBeGreaterThan(5);
    for (const s of late) expect(s.left ?? 0).toBeLessThan(2 * ((end - s.at) / 1000) + 60);
  });
});
