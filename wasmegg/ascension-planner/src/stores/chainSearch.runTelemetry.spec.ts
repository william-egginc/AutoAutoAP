/**
 * Run telemetry (15 Nov 2026, round 2 section 7): a search that starts writes a 'run start' entry to the
 * black box (build, simulator version, start TE, deadline, sets, a fixed micro-benchmark's ms), and a
 * By a date send carries `deadlineRunCost` (the Fastest `run` shape, under another name: the board reads
 * `run` as a chain's speed). On a carry-on the minutes and the route count cover the same span.
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
const { SIM_VERSION } = await import('@/search/simVersion');
const { useInitialStateStore } = await import('./initialState');
const { useActionsStore } = await import('./actions');
const { loadDeadlineCheckpoint, checkpointCount } = await import('@/search/deadlineStore');
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


let tick = 0;
beforeEach(() => {
  // A clock that moves 200 ms on every read, so a run takes measurable time.
  tick = 0;
  const base = 1_790_000_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => base + (tick += 200));
});

describe("a search's start is in the black box", () => {
  it('a By a date run writes one run start entry, before its first beat, with the fixed fields', async () => {
    const store = newPage();
    await store.startDeadline('P', SPEC as never);
    expect(store.error).toBeNull();
    const starts = box().history.filter(e => e.phase === 'run start');
    expect(starts).toHaveLength(1);
    expect(starts[0]).toMatchObject({
      detail: 'deadline search',
      simVersion: SIM_VERSION,
      startTE: 196,
      deadline: SPEC.deadline,
    });
    expect(typeof starts[0].build).toBe('string');
    expect(typeof starts[0].benchMs).toBe('number');
    expect(starts[0].benchMs as number).toBeGreaterThanOrEqual(0);
    const firstBeat = box().history.findIndex(e => e.phase === 'deadline search');
    expect(box().history.findIndex(e => e.phase === 'run start')).toBeLessThan(firstBeat);
  });

  it('a carry-on starts a run too: one more entry', async () => {
    await runThatDied(newPage());
    const before = box().history.filter(e => e.phase === 'run start').length;
    await newPage().resumeDeadline('P');
    expect(box().history.filter(e => e.phase === 'run start')).toHaveLength(before + 1);
  });
});

describe('a By a date send carries deadlineRunCost, never run', () => {
  const sendOf = (store: ReturnType<typeof useChainSearchStore>) => {
    const r = store.deadlineResult!;
    return store.buildDeadlineSubmission(r.routes[0]) as unknown as Record<string, unknown> | null;
  };

  it('a finished run: workers, cores, minutes, seconds per chain over the routes it priced', async () => {
    const store = newPage();
    await store.startDeadline('P', SPEC as never);
    const sub = sendOf(store)!;
    expect(sub.run).toBeUndefined();
    const c = sub.deadlineRunCost as Record<string, number | null>;
    expect(c).toBeDefined();
    expect(c.workers).toBeGreaterThan(0);
    expect(c.minutes).toBeGreaterThan(0);
    const priced = store.deadlineResult!.priced;
    expect(Math.abs((c.secondsPerChain as number) * priced - (c.minutes as number) * 60) / ((c.minutes as number) * 60)).toBeLessThan(0.1);
  });

  it('a carry-on: minutes and routes are this session only, not the replayed routes', async () => {
    const cp = await runThatDied(newPage());
    const replayed = checkpointCount(cp);
    expect(replayed).toBeGreaterThan(0);
    const page = newPage();
    await page.resumeDeadline('P');
    const sub = sendOf(page)!;
    const c = sub.deadlineRunCost as Record<string, number>;
    const priced = page.deadlineResult!.priced;
    expect(priced).toBeGreaterThan(replayed);
    const fresh = priced - replayed;
    // seconds per chain is over the fresh routes, for the minutes this session ran.
    const span = c.minutes * 60;
    expect(Math.abs(c.secondsPerChain * fresh - span) / span).toBeLessThan(0.1);
    // ...and would be visibly off if the replayed ones were counted too.
    expect(Math.abs(c.secondsPerChain * priced - span) / span).toBeGreaterThan(0.1);
  });

  it('a result that did not run here (a replayed or opened one) has none', async () => {
    const store = newPage();
    await store.startDeadline('P', SPEC as never);
    const r = store.deadlineResult!;
    const other = { ...r, at: r.at + 1 };
    const sub = store.buildDeadlineSubmission(r.routes[0], undefined, other) as unknown as Record<string, unknown>;
    expect(sub.deadlineRunCost).toBeUndefined();
  });
});
