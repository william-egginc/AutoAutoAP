/**
 * By a date with no instant answer (search/autoWiden.ts), the store's half: the quick scan runs as the
 * coarse pass alone, each run of the fallback carries what it did into its answer, Stop & keep best can
 * put an earlier round's answer back, and the rounds it went past stop waiting to be sent.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { DeadlineOutcome, DeadlineRoute, DeadlineSpec } from '@/search/deadline';
import type { SearchInputs } from '@/search/types';

const db = new Map<string, unknown>();
vi.mock('@/lib/storage/db', async () => (await import('@/test/memoryDb')).memoryDbModule(db));

/** What the workers were handed, per run. */
const pooled: SearchInputs[] = [];
/** What the pool's integrity check measures: seconds on the first Integrity shift (null: none). */
let integritySeconds: number | null = null;
vi.mock('@/search/pool', () => ({
  createChainSearchPool: vi.fn(async (inputs: SearchInputs) => {
    pooled.push(inputs);
    return {
      size: 1,
      resize: () => {},
      terminate: () => {},
      evaluate: async () => ({ results: [] }),
      integrityWait: async () => integritySeconds,
    };
  }),
}));

/** The deadline search itself, replaced: these tests are about what goes in and what is sent. */
let gate: Promise<void> | null = null;
let stopEarly = false;
const specs: DeadlineSpec[] = [];
vi.mock('@/search/deadline', async orig => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    runDeadlineSearch: vi.fn(async (spec: DeadlineSpec): Promise<DeadlineOutcome> => {
      specs.push(spec);
      if (gate) await gate;
      const first = Math.floor(spec.currentTE) + 1;
      const route: DeadlineRoute = {
        chain: [first, first + 20],
        reachAt: spec.planStart + 30 * 86400,
        ascendAt: spec.planStart + 30 * 86400,
        spare: 0,
        legs: [],
      };
      return {
        routes: [route],
        byStops: new Map([[2, route]]),
        step: 1,
        shapes: 1,
        priced: 1,
        stoppedEarly: stopEarly,
        all: new (real.PricedRoutes as new () => DeadlineOutcome['all'])(),
      };
    }),
  };
});

const { useChainSearchStore } = await import('./chainSearch');
const { useInitialStateStore } = await import('./initialState');
const { useActionsStore } = await import('./actions');
const { loadDeadlineResult } = await import('@/search/deadlineStore');
const { hashID } = await import('@/lib/storage/db');
const { quickScanSpec } = await import('@/search/autoWiden');

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

const SAVE_AT = 1_790_000_000;
const NEWER_AT = SAVE_AT + 18 * 3600;
const PLAN_START = SAVE_AT + 600;

/** Per-virtue TE adding up to `te`. */
function earned(te: number) {
  const c = Math.min(98, te);
  const i = Math.min(98, te - c);
  return { curiosity: c, integrity: i, humility: te - c - i, resilience: 0, kindness: 0 };
}

/** A loaded save at `te`, taken at `at`. */
function loadSave(te: number, at: number): void {
  const iss = useInitialStateStore();
  const e = earned(te);
  iss.rawBackup = {
    approxTime: at,
    farms: [],
    virtue: { eovEarned: [e.curiosity, e.integrity, e.humility, 0, 0] },
    game: {},
  } as never;
  iss.initialTeEarned = e;
  iss.epicResearchLevels = { cheaper_research: 1 } as never;
}

function plannerAt(te: number): void {
  const a = useActionsStore();
  a.actions[0].endState = { ...a.actions[0].endState, teEarned: earned(te) };
  a._initialSnapshot = { ...a.initialSnapshot, teEarned: earned(te) };
}

const DEADLINE = PLAN_START + 365 * 86400;
function nearby(extra: Record<string, unknown> = {}) {
  return {
    deadline: DEADLINE,
    minStops: 3,
    maxStops: 3,
    lastLo: 79,
    lastHi: 200,
    step: 1,
    ascendNeeded: false,
    extend: true,
    bandSets: [
      [
        [79, 80, 81],
        [94, 95, 96],
      ],
    ],
    simple: true,
    ...extra,
  };
}

beforeEach(() => {
  db.clear();
  pooled.length = 0;
  specs.length = 0;
  integritySeconds = null;
  gate = null;
  stopEarly = false;
  installStubs();
  setActivePinia(createPinia());
  useChainSearchStore().pinPlanStart(PLAN_START);
  loadSave(78, SAVE_AT);
  plannerAt(78);
});

describe('the no-instant-answer fallback in the store (search/autoWiden.ts)', () => {
  it('runs the quick scan as the coarse pass alone, with no boxes, and marks its answer', async () => {
    const store = useChainSearchStore();
    await store.startDeadline(
      'P',
      quickScanSpec({ currentTE: 78, deadline: DEADLINE, guessHi: 193, ascendNeeded: false, level: 'quick' })
    );
    expect(store.error).toBeNull();
    expect(specs).toHaveLength(1);
    expect(specs[0].refine).toBe(false);
    expect(specs[0].bandSets).toBeUndefined();
    expect(specs[0].minStops).toBe(1);
    expect(specs[0].maxStops).toBe(5);
    expect(store.deadlineResult?.fallback).toEqual({ scanned: true, widenRounds: 0 });
    expect(store.deadlineResult?.simple).toBe(true);
  });

  it('a widening round carries its round into the answer; an ordinary run has neither', async () => {
    const store = useChainSearchStore();
    await store.startDeadline('P', nearby({ fallback: { scanned: true, widenRounds: 2 } }));
    expect(specs[0].refine).toBeUndefined();
    expect(store.deadlineResult?.fallback).toEqual({ scanned: true, widenRounds: 2 });
    await store.startDeadline('P', nearby());
    expect(store.deadlineResult?.fallback).toBeUndefined();
  });

  it('Stop & keep best: an earlier answer goes back on screen and into its saved slot', async () => {
    const store = useChainSearchStore();
    await store.startDeadline('P', nearby({ fallback: { scanned: true, widenRounds: 0 } }));
    const first = JSON.parse(JSON.stringify(store.deadlineResult));
    stopEarly = true;
    await store.startDeadline('P', nearby({ fallback: { scanned: true, widenRounds: 1 } }));
    expect(store.deadlineResult?.stoppedEarly).toBe(true);
    await store.restoreDeadlineResult(first);
    expect(store.deadlineResult?.stoppedEarly).toBe(false);
    expect(store.deadlineResult?.fallback).toEqual({ scanned: true, widenRounds: 0 });
    const saved = await loadDeadlineResult(await hashID('P'));
    expect(saved?.stoppedEarly).toBe(false);
    expect(saved?.fallback).toEqual({ scanned: true, widenRounds: 0 });
  });

  it('forgets the kept sends of the rounds it went past, and only those', async () => {
    const store = useChainSearchStore();
    const kept = (id: string, at: number) =>
      ({ id, kind: 'deadline', key: `deadline:${at}`, label: '', createdAt: at, payload: {} }) as never;
    store.pendingSends = [kept('a', 1), kept('b', 2), kept('c', 3)];
    await store.dropDeadlineSends([1, 2]);
    expect(store.pendingSends.map((p: { id: string }) => p.id)).toEqual(['c']);
  });
});
