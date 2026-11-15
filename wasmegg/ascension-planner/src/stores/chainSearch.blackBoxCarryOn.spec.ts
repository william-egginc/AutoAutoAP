/**
 * The black box across a reload and a carry-on (13 Nov 2026, Safari: the download held the dead page's
 * last beat at 11:31:09 AM and nothing after, so a page that died, reloaded and carried on read as a
 * 4-minute stall; nothing said how the page was opened, whether the carry-on was the countdown's, or
 * what save it carried on from).
 *
 *  1. "Download the black box" carries the box as it is now (`live`), beside the load-time copy.
 *  2. A page that finds an unfinished beat notes how it was opened and how long after that beat.
 *  3. A carry-on notes countdown or click, the watcher's path, the workers from and to, the save's routes.
 *  4. Every By a date beat says when its last save was taken and how many routes it held.
 *
 * Real deadline search (search/deadline.ts) and replay (search/deadlineStore.ts), fake workers. The
 * box is read straight from storage, as the next page would.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { ChainResult } from '@/search/types';

const db = new Map<string, unknown>();
vi.mock('@/lib/storage/db', async () => (await import('@/test/memoryDb')).memoryDbModule(db));

/** Called before each route the fake workers price: the batch, and the index about to be priced. */
let hook: ((chains: number[][], i: number) => void) | null = null;
const PLAN_START = 1_790_000_600;
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
        hook?.(chains, i);
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
const { loadDeadlineCheckpoint, checkpointCount } = await import('@/search/deadlineStore');
const { stepAwayBeginCarryOn } = await import('@/composables/useStepAway');
const { writeRunMark, readRunMark, RUN_KEY } = await import('@/search/stepAway');

const BOX = 'aap.blackBox';
type Entry = Record<string, unknown> & { at: number; phase: string };
type Box = { open: Entry | null; history: Entry[] };

let backing = new Map<string, string>();
let listeners: Record<string, (() => void)[]> = {};
const realPerformance = globalThis.performance;

function installStubs(): void {
  backing = new Map();
  listeners = {};
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
  // A page: the black box and the run mark are read and written only where there is a window.
  const location = { href: 'https://planner.example/#/auto/bydate', origin: 'https://planner.example', hash: '#/auto/bydate' };
  vi.stubGlobal('location', location);
  vi.stubGlobal('window', { location, addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    addEventListener: (type: string, f: () => void) => void (listeners[type] ??= []).push(f),
    removeEventListener: () => {},
  });
}

/** The page "loaded" at `timeOrigin`, opened as `type` (the Navigation Timing entry). */
function pageOpened(timeOrigin: number, type: string): void {
  vi.stubGlobal('performance', {
    timeOrigin,
    now: () => realPerformance.now(),
    mark: () => {},
    measure: () => {},
    getEntriesByType: (t: string) => (t === 'navigation' ? [{ type }] : []),
  });
}

const box = (): Box => JSON.parse(backing.get(BOX) ?? 'null') as Box;

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

/** A fresh page: a new store over the same storage. */
function newPage() {
  setActivePinia(createPinia());
  const store = useChainSearchStore();
  store.pinPlanStart(PLAN_START);
  loadSaveAt196();
  return store;
}

/** A run stopped half-way through its third batch (the page "dying" there), its checkpoint saved. Then
 *  the box is left as a crash leaves it: the last beat still open, no "finished". */
async function runThatDied(store: ReturnType<typeof useChainSearchStore>, onBatch3?: () => void) {
  let batches = 0;
  let last: number[][] | null = null;
  let died: Box | null = null;
  hook = (chains, i) => {
    if (chains !== last) {
      last = chains;
      batches++;
      if (batches === 3) onBatch3?.();
    }
    if (batches === 3 && i === Math.floor(chains.length / 2)) {
      died = box();
      store.stopDeadline();
    }
  };
  await store.startDeadline('P', SPEC as never);
  hook = null;
  expect(store.error).toBeNull();
  expect(died!.open?.phase).toBe('deadline search');
  // What a crash leaves: the box as it was when the page went, and the run mark still "running".
  backing.set(BOX, JSON.stringify(died));
  const m = readRunMark()!;
  writeRunMark({ ...m, status: 'running', endedAt: undefined });
  return (await loadDeadlineCheckpoint('P'))!;
}

beforeEach(() => {
  db.clear();
  hook = null;
  installStubs();
  vi.stubGlobal('performance', realPerformance);
});

describe('1. the download carries the box as it is now', () => {
  it("keeps the load-time copy as `unfinished`, and adds `live` with this page's own run", async () => {
    const first = newPage();
    await runThatDied(first);
    const page = newPage();
    const found = JSON.parse(page.blackBoxReport());
    expect(found.unfinished.last.phase).toBe('deadline search');
    const before = found.unfinished.history.length;

    await page.resumeDeadline('P');
    expect(page.error).toBeNull();
    const report = JSON.parse(page.blackBoxReport());
    // The load-time copy is unchanged...
    expect(report.unfinished.history).toHaveLength(before);
    // ...and the live box has the carry-on's run, to its end.
    expect(report.live).toBeDefined();
    const live = report.live.history as Entry[];
    expect(live.at(-1)!.at).toBeGreaterThan(report.unfinished.last.at);
    expect(live.some(e => e.phase === 'deadline search' && e.detail === 'finished')).toBe(true);
    expect(report.live.open).toBeNull();
  });
});

describe('2. a page that finds an unfinished beat says how it was opened, and how long after', () => {
  it('a reload, 4 minutes after the last beat', async () => {
    await runThatDied(newPage());
    const lastBeat = box().open!.at;
    pageOpened(lastBeat + 240_000, 'reload');
    newPage();
    const note = box().history.at(-1)!;
    expect(note.phase).toBe('page load');
    expect(note.load).toBe('reload');
    expect(note.sinceLastBeatMs).toBe(240_000);
    expect(note.reopenedBy).toBeUndefined();
  });

  it('the watcher opened it: a new tab 5 s after its reopen, or its own tab after 25 s', async () => {
    await runThatDied(newPage());
    const lastBeat = box().open!.at;
    const reopenAt = lastBeat + 130_000;
    writeRunMark({ ...readRunMark()!, reopens: [reopenAt] });
    pageOpened(reopenAt + 5_000, 'navigate');
    newPage();
    expect(box().history.at(-1)).toMatchObject({
      phase: 'page load',
      load: 'navigate',
      sinceLastBeatMs: 135_000,
      reopenedBy: 'watcher-new-tab',
      sinceReopenMs: 5_000,
    });
    pageOpened(reopenAt + 25_000, 'navigate');
    newPage();
    expect(box().history.at(-1)).toMatchObject({ reopenedBy: 'watcher-own-tab', sinceReopenMs: 25_000 });
  });

  it('nothing when the previous page finished', async () => {
    newPage();
    expect(backing.get(BOX)).toBeUndefined();
  });
});

describe('3. a carry-on says how, from what save, on how many workers', () => {
  it('a click: the save it carried on from and the workers, from the stopped run to this one', async () => {
    const cp = await runThatDied(newPage());
    const ranWith = readRunMark()!.workers;
    const page = newPage();
    await page.resumeDeadline('P');
    const entry = box().history.find(e => e.phase === 'carry on');
    expect(entry).toMatchObject({
      detail: 'deadline search',
      carryOn: 'click',
      workersFrom: ranWith,
      workersTo: page.workerBudget,
      lastSaveAt: cp.updatedAt,
      lastSaveRoutes: checkpointCount(cp),
    });
  });

  it("Stepping away?'s countdown: automatic, with the watcher's path when it opened the page", async () => {
    await runThatDied(newPage());
    const reopenAt = box().open!.at + 130_000;
    writeRunMark({ ...readRunMark()!, reopens: [reopenAt] });
    pageOpened(reopenAt + 4_000, 'navigate');
    const page = newPage();
    vi.stubGlobal('performance', realPerformance);
    // What the countdown's go() does before it emits the carry-on (StepAwayOptions.vue).
    stepAwayBeginCarryOn();
    await page.resumeDeadline('P');
    const entry = box().history.find(e => e.phase === 'carry on');
    expect(entry).toMatchObject({ carryOn: 'auto', reopenedBy: 'watcher-new-tab', sinceReopenMs: 4_000 });
    // Taken once: a later carry-on by hand is a click.
    await runThatDied(page);
    await newPage().resumeDeadline('P');
    expect(box().history.filter(e => e.phase === 'carry on').at(-1)).toMatchObject({ carryOn: 'click' });
  });
});

describe("4. every By a date beat says when its last save was taken and the routes it held", () => {
  it('null before the first save, then the save; a carry-on starts at the save it carried on from', async () => {
    const store = newPage();
    let seen: Entry | null = null;
    const cp = await runThatDied(store, () => {
      // A beat between batches (a hide/show of the tab beats at once).
      for (const f of listeners.visibilitychange ?? []) f();
      seen = box().open;
    });
    const beats = box().history.filter(e => e.phase === 'deadline search');
    expect(beats[0]).toMatchObject({ lastSaveAt: null, lastSaveRoutes: null });
    expect(typeof seen!.lastSaveAt).toBe('number');
    expect(seen!.lastSaveRoutes as number).toBeGreaterThan(0);
    expect(seen!.lastSaveAt as number).toBeLessThanOrEqual(seen!.at);

    const page = newPage();
    await page.resumeDeadline('P');
    const first = box().history.find(e => e.phase === 'deadline search' && e.at > cp.updatedAt && e.detail !== 'finished');
    expect(first).toMatchObject({ lastSaveAt: cp.updatedAt, lastSaveRoutes: checkpointCount(cp) });
  });
});
