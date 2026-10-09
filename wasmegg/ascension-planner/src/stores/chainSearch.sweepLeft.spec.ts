/**
 * A Full sweep carried on (the user, 9 Oct: ~4,400 chains replayed, then "about 2 min left", "4.2 h
 * left" and the panel's "8 min left" at once): the chains a carry-on replays are no speed. The time
 * left waits for chains really priced ("measuring"), the bar and the panel read the one figure
 * (`sweepLeft`), and neither the kept benchmark nor the run's cost learns from the replayed chains.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { RunProgress } from './chainSearch';

const db = new Map<string, unknown>();
vi.mock('@/lib/storage/db', () => ({
  saveMetadata: vi.fn(async (hash: string, key: string, value: unknown) => void db.set(`${hash}/${key}`, value)),
  loadMetadata: vi.fn(async (hash: string, key: string) => db.get(`${hash}/${key}`) ?? null),
  hashID: vi.fn(async (id: string) => id),
}));

/** Each chain takes 0.5 s of (fake) wall clock on the one worker; `onChain` sees the store mid-batch. */
let onChain: ((chainsInBatch: number) => void) | null = null;
const MS_PER_CHAIN = 500;
vi.mock('@/search/pool', () => ({
  createChainSearchPool: vi.fn(async () => ({
    size: 1,
    resize: () => 1,
    terminate: () => {},
    integrityWait: async () => {
      // Starting the workers and the integrity check take a while; none of it is a chain's cost.
      vi.setSystemTime(Date.now() + 20_000);
      return null;
    },
    evaluate: async (chains: number[][], progress?: (done: number, total: number) => void) => {
      const results = [];
      for (let i = 0; i < chains.length; i++) {
        vi.setSystemTime(Date.now() + MS_PER_CHAIN);
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
  installStubs();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(SAVE_AT * 1000 + 3600_000);
  setActivePinia(createPinia());
  useChainSearchStore().pinPlanStart(SAVE_AT + 600);
  loadSave(196);
});
afterEach(() => vi.useRealTimers());

describe('a carried-on Full sweep', () => {
  it('replayed chains are no speed: measuring until real work, then the fresh chains rate, one figure', async () => {
    const store = useChainSearchStore();
    // The first run prices one batch (32 chains) and stops: what the carry-on replays.
    onChain = n => {
      if (n === 32) store.stop();
    };
    await store.startExhaustive('P', SPACE);
    expect(store.error).toBeNull();
    expect(store.chainsDone).toBe(32);

    const seen: { done: number; left: number | null; measuring: boolean | undefined }[] = [];
    let atStart: RunProgress | null = null;
    let benchAfterFirst = 0;
    onChain = n => {
      const p = store.runProgress!;
      if (!atStart) atStart = { ...p };
      seen.push({ done: p.done, left: p.secondsLeft, measuring: p.measuring });
      // The first batch is back on the 32nd chain; the benchmark learns from it alone.
      if (n === 1 && store.chainsDone > 32 && !benchAfterFirst) benchAfterFirst = store.benchmarkChainCount;
    };
    await store.startExhaustive('P', SPACE);
    expect(store.error).toBeNull();
    expect(store.chainsReplayed).toBe(32);

    // The first chain after the carry-on: 32 chains "done" in no time, and still no time left given.
    expect(atStart!.kind).toBe('full');
    expect(atStart!.done).toBe(33);
    expect(atStart!.secondsLeft).toBeNull();
    expect(atStart!.measuring).toBe(true);
    // Once the workers have priced a few seconds' worth: the fresh rate, 0.5 s a chain.
    const later = seen.find(s => s.done === 60)!;
    expect(later.left).not.toBeNull();
    expect(later.left!).toBeGreaterThan((100 - 60) * 0.5 * 0.8);
    expect(later.left!).toBeLessThan((100 - 60) * 0.5 * 1.25);
    // Never the replay-inflated pace (elapsed over done, replayed in): under a second a chain left.
    for (const s of seen) if (s.left !== null) expect(s.left).toBeGreaterThanOrEqual((100 - s.done) * 0.4);

    // "Measured on this machine · N chains": the 32 it measured, not the 64 done with the replayed.
    expect(benchAfterFirst).toBe(32);
    // The workers' start and the integrity check (20 s here) are not charged to the chains.
    expect(store.secondsPerChain).toBeCloseTo(0.5, 1);
    // The run's cost per chain is over the 68 chains it priced, not the 100 it holds.
    expect(store.runCost!.secondsPerChain).toBeGreaterThan(0.5);
    expect(store.runCost!.secondsPerChain).toBeCloseTo((store.runCost!.minutes * 60) / 68, 5);
  });

  it('the panel and the bar share one figure, and a queue says which chain is running', async () => {
    const store = useChainSearchStore();
    store.sweepQueue.at = 0;
    store.sweepQueue.total = 3;
    store.sweepQueue.counts = [100, 100, 100];
    store.sweepQueue.ascensions = [2, 2, 2];
    let checked = false;
    onChain = n => {
      if (n !== 20 || store.chainsDone < 32 || checked) return;
      checked = true;
      const p = store.runProgress!;
      const left = store.sweepLeft!;
      expect(p.secondsLeft).toBe(left.seconds);
      expect(p.chain).toEqual({ at: 1, of: 3 });
      expect(p.total).toBe(100);
      expect(left.chainsTotal).toBe(300);
      // The whole queue: what is left of this chain and both chains after it, at 0.5 s a chain.
      expect(left.seconds!).toBeGreaterThan((300 - p.done) * 0.5 * 0.8);
      expect(left.seconds!).toBeLessThan((300 - p.done) * 0.5 * 1.25);
    };
    await store.startExhaustive('P', SPACE);
    expect(checked).toBe(true);
  });
});
