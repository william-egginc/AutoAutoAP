/**
 * A run's start TE and its priced save must come from the same place (board row 07e3dbf0: "from 135
 * TE", priced from 196). Covers the start TE, the refusal while the save settles, a By a date
 * carry-on and saved answers keeping their own save, and the board flagging rows that contradict
 * themselves.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { DeadlineOutcome, DeadlineRoute, DeadlineSpec } from '@/search/deadline';
import type { SearchInputs } from '@/search/types';
import type { BoardRow } from '@/lib/leaderboardRank';

const db = new Map<string, unknown>();
vi.mock('@/lib/storage/db', async () => (await import('@/test/memoryDb')).memoryDbModule(db));

/** What the workers were handed, per run. */
const pooled: SearchInputs[] = [];
vi.mock('@/search/pool', () => ({
  createChainSearchPool: vi.fn(async (inputs: SearchInputs) => {
    pooled.push(inputs);
    return { size: 1, resize: () => {}, terminate: () => {}, evaluate: async () => ({ results: [] }) };
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

const { useChainSearchStore, startContradictsSave, SAVE_STILL_LOADING, START_MISMATCH_NOT_SENT } =
  await import('./chainSearch');
const { useInitialStateStore } = await import('./initialState');
const { useActionsStore } = await import('./actions');
const { saveDeadlineCheckpoint, loadDeadlineCheckpoint } = await import('@/search/deadlineStore');
const { groupPlayers } = await import('@/lib/leaderboardRank');

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

/** The planner's own TE (the action snapshot): what `currentTE` used to read. */
/** The planner's "now" (its initial snapshot and start action) at `te`: what the save rebuilds into. */
function plannerAt(te: number): void {
  const a = useActionsStore();
  a.actions[0].endState = { ...a.actions[0].endState, teEarned: earned(te) };
  a._initialSnapshot = { ...a.initialSnapshot, teEarned: earned(te) };
}

/** A plan in the Manual Planner: steps after the start, the last of them ending at `te`. */
function planEndingAt(te: number): void {
  const a = useActionsStore();
  const start = a.actions[0];
  a.actions = [
    start,
    { ...start, id: 'shift-1', type: 'shift', endState: { ...start.endState, teEarned: earned(te - 20) } },
    { ...start, id: 'wait-1', type: 'wait_for_te', endState: { ...start.endState, teEarned: earned(te) } },
  ] as never;
}

function spec() {
  return { deadline: PLAN_START + 365 * 86400, minStops: 2, maxStops: 2, lastHi: 300, step: 1, ascendNeeded: false };
}

async function finishedRun(store: ReturnType<typeof useChainSearchStore>) {
  await store.startDeadline('P', spec());
  expect(store.error).toBeNull();
  const r = store.deadlineResult!;
  expect(r).not.toBeNull();
  return r;
}

beforeEach(() => {
  db.clear();
  pooled.length = 0;
  specs.length = 0;
  gate = null;
  stopEarly = false;
  installStubs();
  setActivePinia(createPinia());
  useChainSearchStore().pinPlanStart(PLAN_START);
});

describe('a run starts from the TE it is priced from', () => {
  it('refuses to start while the planner still shows another TE, and reads the save for "Your TE now"', async () => {
    const store = useChainSearchStore();
    loadSave(196, SAVE_AT);
    plannerAt(135); // the old start action, kept while the planner rebuilds

    expect(store.currentTE).toBe(196);
    expect(store.saveNotReady).toMatch(/doesn't match your loaded save/);
    await store.startDeadline('P', spec());
    expect(specs).toHaveLength(0);
    expect(pooled).toHaveLength(0);
    expect(store.error).toBe(store.saveNotReady);
  });

  it('does not block on a plan held in the planner: only its start is "now"', async () => {
    const store = useChainSearchStore();
    loadSave(196, SAVE_AT);
    plannerAt(196);
    planEndingAt(255); // "Simulate this plan", or a plan built by hand
    expect(useActionsStore().effectiveSnapshot.teEarned).toEqual(earned(255));
    expect(store.plannerTE).toBe(196);
    expect(store.saveNotReady).toBe('');
    expect(store.setupIssues.map(i => i.kind)).not.toContain('te-mismatch');
    const r = await finishedRun(store);
    expect(pooled[0].currentTE).toBe(196);
    expect(r.te).toBe(196);
  });

  it('falls back to the start action when the planner has no initial snapshot yet', () => {
    const store = useChainSearchStore();
    loadSave(196, SAVE_AT);
    const a = useActionsStore();
    a._initialSnapshot = null;
    a.actions[0].endState = { ...a.actions[0].endState, teEarned: earned(135) };
    planEndingAt(255);
    a.actions[0].endState = { ...a.actions[0].endState, teEarned: earned(135) };
    expect(store.plannerTE).toBe(135);
    expect(store.saveNotReady).toMatch(/doesn't match your loaded save/);
  });

  it('refuses to start while the planner is initialising or recalculating', async () => {
    const store = useChainSearchStore();
    loadSave(196, SAVE_AT);
    plannerAt(196);
    const a = useActionsStore();
    for (const flag of ['isPlanInitializing', 'isRecalculating', 'pendingRecalculate'] as const) {
      a[flag] = true;
      expect(store.saveNotReady).toBe(SAVE_STILL_LOADING);
      await store.startDeadline('P', spec());
      await store.startExhaustive('P', { lo: 200, hi: 200, step: 1, minAsc: 2, maxAsc: 2 });
      expect(pooled).toHaveLength(0);
      expect(store.error).toBe(SAVE_STILL_LOADING);
      a[flag] = false;
    }
    expect(store.saveNotReady).toBe('');
  });

  it('once settled, prices from the save and sends that TE as both start and save TE', async () => {
    const store = useChainSearchStore();
    loadSave(196, SAVE_AT);
    plannerAt(196);
    const r = await finishedRun(store);

    expect(pooled[0].currentTE).toBe(196);
    expect(Object.values(pooled[0].baseState.teEarned).reduce((x, y) => x + y, 0)).toBe(196);
    expect(specs[0].currentTE).toBe(196);
    const sub = store.buildDeadlineSubmission(r.routes[0])!;
    expect(sub.currentTE).toBe(196);
    expect(sub.backupTE).toBe(196);
    expect(sub.backupAgeHours).toBeCloseTo((PLAN_START - SAVE_AT) / 3600, 1);
  });
});

describe('By a date keeps its own save', () => {
  it('a carry-on after a newer save landed sends the original save time and TE', async () => {
    const store = useChainSearchStore();
    loadSave(196, SAVE_AT);
    plannerAt(196);
    stopEarly = true;
    await finishedRun(store);
    expect(store.deadlineUnfinished).not.toBeNull();

    // The tab loads a newer save at a higher TE before the carry-on.
    loadSave(201, NEWER_AT);
    plannerAt(201);
    stopEarly = false;
    await store.resumeDeadline('P');
    expect(store.error).toBeNull();
    const r = store.deadlineResult!;
    expect(r.te).toBe(196);
    const sub = store.buildDeadlineSubmission(r.routes[0])!;
    expect(sub.currentTE).toBe(196);
    expect(sub.backupTE).toBe(196);
    // backupAgeHours is plan start minus the save the submission names: the run's own, not the newer.
    expect(sub.backupAgeHours).toBeCloseTo((PLAN_START - SAVE_AT) / 3600, 1);
  });

  it('a carry-on from a checkpoint saved before it kept an account takes the save fields from its stored save', async () => {
    const store = useChainSearchStore();
    loadSave(196, SAVE_AT);
    plannerAt(196);
    stopEarly = true;
    await finishedRun(store);
    const cp = (await loadDeadlineCheckpoint('P'))!;
    delete cp.account;
    await saveDeadlineCheckpoint('P', cp);

    loadSave(201, NEWER_AT);
    plannerAt(201);
    stopEarly = false;
    await store.resumeDeadline('P');
    const sub = store.buildDeadlineSubmission(store.deadlineResult!.routes[0])!;
    expect(sub.currentTE).toBe(196);
    expect(sub.backupTE).toBe(196);
    expect(sub.backupAgeHours).toBeCloseTo((PLAN_START - SAVE_AT) / 3600, 1);
  });

  it('opening a saved answer during a run leaves the run alone', async () => {
    const store = useChainSearchStore();
    loadSave(170, SAVE_AT - 86400);
    plannerAt(170);
    await finishedRun(store);
    await store.saveCurrentAnswer('P', 'older');
    const saved = store.savedAnswers[0];
    expect(saved).toBeTruthy();

    loadSave(196, SAVE_AT);
    plannerAt(196);
    let release!: () => void;
    gate = new Promise<void>(res => (release = res));
    const running = store.startDeadline('P', spec());
    await vi.waitFor(() => expect(specs).toHaveLength(2));
    expect(store.deadlineRunning).toBe(true);

    store.openSavedAnswer(saved.id); // one click mid-run
    expect(store.deadlineResult).toBeNull();

    // And a newer save lands before the run ends.
    loadSave(201, NEWER_AT);
    plannerAt(201);
    release();
    await running;

    const sub = store.buildDeadlineSubmission(store.deadlineResult!.routes[0])!;
    expect(sub.currentTE).toBe(196);
    expect(sub.backupTE).toBe(196);
    expect(sub.backupAgeHours).toBeCloseTo((PLAN_START - SAVE_AT) / 3600, 1);
  });

  it('a saved answer round-trips its account snapshot', async () => {
    const store = useChainSearchStore();
    loadSave(196, SAVE_AT);
    plannerAt(196);
    const r = await finishedRun(store);
    expect(r.account).toBeTruthy();
    expect(r.backupTE).toBe(196);
    expect(r.backupAt).toBe(SAVE_AT);
    expect(r.inputsKey).toBeTruthy();
    await store.saveCurrentAnswer('P', 'mine');

    // A new session on a newer save: the answer comes back from storage with its own save.
    setActivePinia(createPinia());
    const fresh = useChainSearchStore();
    loadSave(201, NEWER_AT);
    plannerAt(201);
    await fresh.refreshSavedAnswers('P');
    fresh.openSavedAnswer(fresh.savedAnswers[0].id);
    expect(fresh.deadlineResult!.account).toEqual(r.account);
    let sub = fresh.buildDeadlineSubmission(fresh.deadlineResult!.routes[0])!;
    expect([sub.currentTE, sub.backupTE]).toEqual([196, 196]);

    // The last result, as the panel loads it on opening, does the same.
    await fresh.loadDeadlineState('P');
    sub = fresh.buildDeadlineSubmission(fresh.deadlineResult!.routes[0])!;
    expect([sub.currentTE, sub.backupTE]).toEqual([196, 196]);
    expect(sub.backupAgeHours).toBeCloseTo((PLAN_START - SAVE_AT) / 3600, 1);
  });

  it('a saved answer from before it kept one falls back to the loaded save, and is not sent if that contradicts it', async () => {
    const store = useChainSearchStore();
    loadSave(196, SAVE_AT);
    plannerAt(196);
    await finishedRun(store);
    await store.saveCurrentAnswer('P', 'legacy');
    const key = 'P/chainSearchDeadlineSaved';
    const list = JSON.parse(JSON.stringify(db.get(key))) as { result: Record<string, unknown> }[];
    for (const a of list) for (const f of ['account', 'inputsKey', 'backupAt', 'backupTE']) delete a.result[f];
    db.set(key, list);

    loadSave(201, NEWER_AT);
    plannerAt(201);
    await store.refreshSavedAnswers('P');
    store.openSavedAnswer(store.savedAnswers[0].id);
    const sub = store.buildDeadlineSubmission(store.deadlineResult!.routes[0])!;
    expect([sub.currentTE, sub.backupTE]).toEqual([196, 201]);
    expect(startContradictsSave(sub)).toBe(START_MISMATCH_NOT_SENT);
  });
});

describe('a submission that contradicts its own save is not sent', () => {
  it('flags a start far from its save TE, or a first stop at or below the start', () => {
    expect(startContradictsSave({ currentTE: 135, backupTE: 196, chain: [197, 490] })).toBe(START_MISMATCH_NOT_SENT);
    expect(startContradictsSave({ currentTE: 196, backupTE: 196, chain: [196, 490] })).toBe(START_MISMATCH_NOT_SENT);
    expect(startContradictsSave({ currentTE: 196, backupTE: 194, chain: [197, 490] })).toBe('');
    expect(startContradictsSave({ currentTE: 196, backupTE: null, chain: [197, 490] })).toBe('');
  });

  it('never posts one', async () => {
    vi.stubEnv('VITE_SUBMIT_URL', 'https://collector.test/submit');
    vi.resetModules();
    setActivePinia(createPinia());
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { useChainSearchStore: fresh } = await import('./chainSearch');
    const res = await fresh().sendSubmission({
      schema: 8,
      currentTE: 135,
      backupTE: 196,
      chain: [197, 490],
    } as never);
    expect(res).toEqual({ ok: false, message: START_MISMATCH_NOT_SENT });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});

describe('the board', () => {
  const row = (over: Record<string, unknown>) => ({
    id: 'r',
    nickname: 'someone',
    chain: [197, 490],
    durationDays: 500,
    startLocal: '2026-09-25 13:52',
    timezone: 'America/Chicago',
    currentTE: 196,
    backupTE: 196,
    finalTE: 490,
    window: null,
    effort: 'deadline',
    holdShifts: true,
    forceContinue: true,
    schema: 8,
    submittedAt: '2026-09-25T20:01:58.115Z',
    backupAgeHours: 0,
    artifacts: [],
    legs: [
      { te: 197, days: 10 },
      { te: 490, days: 490 },
    ],
    ...over,
  });
  const judge = (rows: ReturnType<typeof row>[]) =>
    Object.fromEntries(
      groupPlayers(rows as unknown as BoardRow[], {
        target: 490,
        now: Date.parse('2026-09-26T00:00:00Z'),
      })[0].plans.map(p => [p.row.id, [p.state, p.reason]])
    );

  it('flags a row that starts well below its own save (07e3dbf0)', () => {
    expect(judge([row({ id: 'bad', currentTE: 135, backupTE: 196, chain: [197, 490] })])).toEqual({
      bad: ['what-if', 'contradicts itself: planned from TE 135, but the save it was made from is at TE 196'],
    });
  });

  it('flags a row whose first stop is not above its start', () => {
    expect(judge([row({ id: 'flat', currentTE: 196, backupTE: undefined, chain: [190, 490] })]).flat).toEqual([
      'what-if',
      'contradicts itself: its first stop (TE 190) is not above its start (TE 196)',
    ]);
  });

  it('keeps a consistent row, and the bad row is no evidence against it', () => {
    const judged = judge([
      row({ id: 'good', startLocal: '2026-09-20 10:00', submittedAt: '2026-09-20T15:05:00Z' }),
      row({ id: 'bad', currentTE: 135, backupTE: 196, chain: [140, 490] }),
    ]);
    expect(judged.good[0]).toBe('current');
    expect(judged.bad[0]).toBe('what-if');
  });
});

describe('the end of a By a date run (the 9 Oct crash)', () => {
  it("a finished run's leftover checkpoint is cleared, not offered as unfinished", async () => {
    const store = useChainSearchStore();
    loadSave(196, SAVE_AT);
    plannerAt(196);
    const r = await finishedRun(store);
    expect(await loadDeadlineCheckpoint('P')).toBeNull();
    // A checkpoint write that landed after the clear (or a clear that failed): same run, older.
    await saveDeadlineCheckpoint('P', {
      spec: { ...spec(), startedAt: 1 },
      inputsKey: r.inputsKey!,
      planStart: r.planStart,
      te: r.te,
      entries: [['197,217', 86400, []]],
      updatedAt: r.at - 1000,
    });
    await store.loadDeadlineState('P');
    expect(store.deadlineUnfinished).toBeNull();
    expect(await loadDeadlineCheckpoint('P')).toBeNull();
  });

  it('a stopped Find and submit run keeps its intent to send, for its carry-on', async () => {
    const store = useChainSearchStore();
    loadSave(196, SAVE_AT);
    plannerAt(196);
    stopEarly = true;
    store.submitsWhenDone = true;
    store.beginBestSoFar('deadline', { nickname: 'Allan' });
    await store.startDeadline('P', spec());
    store.submitsWhenDone = false;
    store.endBestSoFar();
    await store.loadDeadlineState('P');
    expect(store.deadlineUnfinished?.submit).toMatchObject({ whenDone: true, nickname: 'Allan' });
  });

  it('a long run defaults to 12 workers, unless the count was set by hand', () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 20 });
    const store = useChainSearchStore();
    store.workerBudget = 19;
    store.fitWorkersToRun(3 * 3600);
    expect(store.workerBudget).toBe(12);
    expect(store.longRunWorkers).toBe(12);
    store.fitWorkersToRun(3600);
    expect(store.workerBudget).toBe(19);
    expect(store.longRunWorkers).toBeNull();
    store.setWorkersByHand(17);
    store.fitWorkersToRun(3 * 3600);
    expect(store.workerBudget).toBe(17);
    expect(store.longRunWorkers).toBeNull();
  });

  it('says so when the count is set by hand above the default, and the note never claims a count not in use', () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 20 });
    const store = useChainSearchStore();
    store.workerBudget = 19;
    store.fitWorkersToRun(3 * 3600);
    expect(store.longRunNote).toEqual({ kind: 'default', workers: 12 });
    expect(store.workerBudget).toBe(12);
    // moved to 19 by hand (Setup's buttons now go through setWorkersByHand)
    store.setWorkersByHand(19);
    expect(store.longRunNote).toEqual({ kind: 'hand', have: 19 });
    store.fitWorkersToRun(3 * 3600);
    expect(store.workerBudget).toBe(19);
    store.useLongRunWorkers();
    expect(store.workerBudget).toBe(12);
    expect(store.longRunNote).toBeNull();
  });
});

describe('a finished result kept until it is sent', () => {
  it('keeps the payload and the gzipped CSV, and survives a reload', async () => {
    (globalThis as { __AAP_SUBMIT_URL__?: string }).__AAP_SUBMIT_URL__ = 'https://collector.invalid/submit';
    try {
      setActivePinia(createPinia());
      const store = useChainSearchStore();
      store.pinPlanStart(PLAN_START);
      loadSave(196, SAVE_AT);
      plannerAt(196);
      const r = await finishedRun(store);
      await vi.waitFor(() => expect(store.pendingSends).toHaveLength(1), { timeout: 5000 });
      const p = store.pendingSends[0];
      expect(p.kind).toBe('deadline');
      expect(p.key).toBe(`deadline:${r.at}`);
      expect(p.payload.finalTE).toBe(r.routes[0].chain[r.routes[0].chain.length - 1]);
      expect(p.payload.nickname).toBeUndefined();
      expect(p.csvGz?.byteLength).toBeGreaterThan(100);
      expect(p.inputsKey).toBe(r.inputsKey);

      // A reload: a new store reads it back from storage.
      setActivePinia(createPinia());
      const again = useChainSearchStore();
      await again.loadDeadlineState('P');
      expect(again.pendingSends.map(x => x.key)).toEqual([p.key]);
    } finally {
      delete (globalThis as { __AAP_SUBMIT_URL__?: string }).__AAP_SUBMIT_URL__;
    }
  });
});
