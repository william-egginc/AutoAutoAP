/**
 * A carried-on By a date run's route count must not fall below what it had already priced.
 *
 * Seen 13 Nov 2026 (Safari, 7 workers, a 343-set space): the page died in Round 1 at "done 293"; the
 * carry-on's bar then read "104 of ~1,540 routes", which looked like a run that had started over. It
 * had not: the routes in the checkpoint are replayed, but a round is ONE batch (deadline.ts `CHUNK`,
 * at least 1,024 routes), and the bar is `priced + deadlineInBatch`, where `priced` only moves when
 * the batch is back and `deadlineInBatch` counted only the workers' fresh routes. The routes of the
 * batch in flight that came straight back from the checkpoint were in neither, until the whole round
 * was done.
 *
 * Real deadline search (search/deadline.ts) and replay (search/deadlineStore.ts), fake workers.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { ChainResult } from '@/search/types';

const db = new Map<string, unknown>();
vi.mock('@/lib/storage/db', async () => (await import('@/test/memoryDb')).memoryDbModule(db));

/** Called before each route the fake workers price: the batch, and the index about to be priced. */
let beforeEach_: ((chains: number[][], i: number) => void) | null = null;
const PLAN_START = 1_790_000_600;
/** A route's time: four days a TE above 196, so last stops up to ~287 make a date a year out. */
const secondsOf = (c: number[]) => (c[c.length - 1] - 196) * 4 * 86400;

vi.mock('@/search/pool', () => ({
  createChainSearchPool: vi.fn(async () => ({
    size: 1,
    resize: () => {},
    terminate: () => {},
    integrityWait: async () => null,
    evaluate: async (
      chains: number[][],
      onProgress?: (done: number) => void,
      opts?: { onResult?: (c: number[], r: ChainResult) => void; shouldStop?: () => boolean }
    ) => {
      const results: ChainResult[] = [];
      for (let i = 0; i < chains.length; i++) {
        beforeEach_?.(chains, i);
        if (opts?.shouldStop?.()) break;
        const r = { chain: chains[i], seconds: secondsOf(chains[i]), legs: [] } as unknown as ChainResult;
        results.push(r);
        opts?.onResult?.(chains[i], r);
        onProgress?.(i + 1);
      }
      return { results, legSims: results.length };
    },
  })),
}));

const { useChainSearchStore } = await import('./chainSearch');
const { useInitialStateStore } = await import('./initialState');
const { useActionsStore } = await import('./actions');
const { loadDeadlineCheckpoint } = await import('@/search/deadlineStore');

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
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    addEventListener: () => {},
    removeEventListener: () => {},
  });
}

function earned(te: number) {
  const c = Math.min(98, te);
  const i = Math.min(98, te - c);
  return { curiosity: c, integrity: i, humility: te - c - i, resilience: 0, kindness: 0 };
}

function loadSaveAt196(): void {
  const iss = useInitialStateStore();
  const e = earned(196);
  iss.rawBackup = {
    approxTime: PLAN_START - 600,
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

const SPEC = { deadline: PLAN_START + 365 * 86400, minStops: 2, maxStops: 2, lastHi: 300, step: 1, ascendNeeded: false };

beforeEach(() => {
  db.clear();
  beforeEach_ = null;
  installStubs();
  setActivePinia(createPinia());
  useChainSearchStore().pinPlanStart(PLAN_START);
});

describe('a carried-on By a date run counts the routes it replays (13 Nov 2026, "104" after "293")', () => {
  it('the bar never reads fewer routes than the checkpoint held, mid-batch included', async () => {
    const store = useChainSearchStore();
    loadSaveAt196();

    // The first run: the page "dies" half-way through its third batch (a Stop, here, so the
    // checkpoint is written at once rather than after 30 s).
    let batches = 0;
    let lastChains: number[][] | null = null;
    let diedAt = 0;
    beforeEach_ = (chains, i) => {
      if (chains !== lastChains) {
        lastChains = chains;
        batches++;
      }
      if (batches === 3 && i === Math.floor(chains.length / 2)) {
        // What the bar (and the black box's "done") read as the page went.
        diedAt = store.runProgress!.done;
        store.stopDeadline();
      }
    };
    await store.startDeadline('P', SPEC as never);
    expect(store.error).toBeNull();
    const cp = (await loadDeadlineCheckpoint('P'))!;
    expect(cp).not.toBeNull();
    const saved = cp.count ?? cp.entries.length;
    // The checkpoint kept at least what the bar showed (it may hold a route or two the end priced too).
    expect(saved).toBeGreaterThanOrEqual(diedAt);

    // The carry-on: what the bar (and the black box's "done") read when the workers get their first
    // fresh route, which is in the middle of the batch the first run was stopped in.
    let atFirstFresh: { done: number; fresh: number } | null = null;
    beforeEach_ = () => {
      if (atFirstFresh) return;
      const p = store.runProgress!;
      atFirstFresh = { done: p.done, fresh: store.deadlineProgress?.priced ?? 0 };
    };
    await store.resumeDeadline('P');
    expect(store.error).toBeNull();
    expect(atFirstFresh).not.toBeNull();
    // The batch in flight held replayed routes too (the spec is only about that case).
    expect(atFirstFresh!.fresh).toBeLessThan(diedAt);
    // Picked up where it was: not below the count the first page last showed.
    expect(atFirstFresh!.done).toBeGreaterThanOrEqual(diedAt);
  });
});
