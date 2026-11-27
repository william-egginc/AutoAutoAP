/**
 * The time a search says it will take, on a phone (tester report, R7 live, 9 Nov 2026: Fastest to 490 TE,
 * Fast, on a phone; "about 36 hours" before Start, then 20 min, 10 min, 20 min while it ran; it took about 20).
 *
 * 1. Before Start, the How long line and the "~N here" on Fast price the search at this device's MEASURED speed
 *    when it has one (store `smartEstimate`), and that speed is the one kept from the last run
 *    (`noteRate` -> lib/chainBenchmarkCache.ts) and restored on the next visit (`restoreBenchmark`). A
 *    phone that goes to the background mid-run (screen off, another app) freezes the page: the batch
 *    that spans the pause is charged every minute of it, the EMA takes 30% of it, and the kept speed
 *    is minutes a route instead of seconds. One 20-minute pause in the first five batches is enough
 *    for "hours" before the next Start.
 * 2. While it runs, a Smart search's time left is (upper bound - done) x the per-batch EMA. A cheap
 *    batch (the last stop's re-solve) and a dear one (an early stop's sweep, every later ascension
 *    simulated again) differ several times over per route, so the time left jumps up and down with
 *    each batch. A Full sweep already uses the windowed rate (search/sweepEstimate.ts).
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
const { sweepSeconds } = await import('@/search/speed');

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

/** 200 chains: one checkpoint each from 200 to 399, then the target (7 batches of 32 chains). */
const SPACE200 = { lo: 200, hi: 399, step: 1, minAsc: 2, maxAsc: 2 };
const PAUSE_MS = 20 * 60_000;

describe('the speed kept for the next estimate', () => {
  it('does not count a pause (a phone in the background) as the routes being slow', async () => {
    const store = useChainSearchStore();
    // Batch 2, after its fifth chain: the page is frozen for 20 minutes, as a phone's is when the screen goes off.
    let paused = false;
    onChain = n => {
      if (batches === 2 && n === 5 && !paused) {
        paused = true;
        vi.setSystemTime(Date.now() + PAUSE_MS);
      }
    };
    await store.startExhaustive('P', SPACE200);
    expect(store.error).toBeNull();
    expect(paused).toBe(true);
    // Each route really took 0.5 s on the one worker; what is kept for next time says so.
    const kept = loadChainBenchmark('P')!;
    expect(kept).not.toBeNull();
    expect(kept.secondsPerChain).toBeLessThan(0.5 * 1.5);
  });

  it('the next visit: Fast before Start is priced near the real speed, not hours', async () => {
    const store = useChainSearchStore();
    let paused = false;
    onChain = n => {
      if (batches === 2 && n === 5 && !paused) {
        paused = true;
        vi.setSystemTime(Date.now() + PAUSE_MS);
      }
    };
    await store.startExhaustive('P', SPACE200);
    // A new visit on the same phone: the store starts empty and restores the kept speed (InsanePanel's mount).
    setActivePinia(createPinia());
    const next = useChainSearchStore();
    next.pinPlanStart(SAVE_AT + 600);
    loadSave(196);
    next.restoreBenchmark('P');
    const e = next.smartEstimate('quick');
    // What those routes really cost here: 0.5 s each on one worker, so 0.5 worker-seconds.
    const real = sweepSeconds(e.chains, next.workerBudget, 0.5);
    expect(e.seconds).toBeLessThan(real * 3);
  });

  it('a speed kept by R7 (which counted pauses) is not trusted on the next visit', () => {
    // As R7 wrote it after a run with a 20-minute pause in its first batches: 142 s a route on 4 workers,
    // the figure that reads "about 36 hours" for Fast's ~915 routes.
    localStorage.setItem(
      'chain_benchmark_v1:P',
      JSON.stringify({
        secondsPerChain: 142,
        source: 'live',
        at: Date.now() - 86400_000,
        chainCount: 90,
        workers: 4,
        currentTE: 196,
        finalTE: 490,
      })
    );
    const store = useChainSearchStore();
    store.restoreBenchmark('P');
    const e = store.smartEstimate('quick');
    expect(e.seconds / 3600).toBeLessThan(5);
  });
});

describe("a Smart search's time left", () => {
  it('does not swing with each batch when cheap and dear batches alternate', async () => {
    const store = useChainSearchStore();
    // Odd batches cheap (0.2 s a route: the last stop re-solved), even ones dear (1.5 s: an early stop's sweep).
    chainMs = () => (batches % 2 ? 200 : 1500);
    const t0 = Date.now();
    const seen: { at: number; left: number }[] = [];
    onChain = () => {
      const p = store.runProgress;
      if (!p || p.kind !== 'smart' || p.secondsLeft === null || p.measuring) return;
      seen.push({ at: (Date.now() - t0) / 1000, left: p.secondsLeft });
    };
    await store.start('P');
    expect(store.error).toBeNull();
    // Past the first 3 minutes (the time left is a blend with the planned speed until 2 minutes are measured).
    const settled = seen.filter(s => s.at > 180);
    expect(settled.length).toBeGreaterThan(20);
    // A time left that only follows the work goes down; one that follows each batch's pace jumps back up.
    let worstRise = 0;
    for (let i = 1; i < settled.length; i++) worstRise = Math.max(worstRise, settled[i].left / settled[i - 1].left);
    expect(worstRise).toBeLessThan(1.25);
  });
  it('right after a pause, says about what it said before it, not hours', async () => {
    const store = useChainSearchStore();
    let before: number | null = null;
    let paused = false;
    const after: number[] = [];
    onChain = n => {
      const p = store.runProgress;
      if (!p || p.kind !== 'smart') return;
      if (batches === 6 && n === 2 && !paused) {
        before = p.secondsLeft;
        paused = true;
        vi.setSystemTime(Date.now() + PAUSE_MS);
        return;
      }
      if (paused && batches === 6 && p.secondsLeft !== null) after.push(p.secondsLeft);
    };
    await store.start('P');
    expect(store.error).toBeNull();
    expect(before).not.toBeNull();
    expect(after.length).toBeGreaterThan(0);
    for (const a of after) expect(a).toBeLessThan(before! * 2);
  });
});
