/**
 * Check exactly (exactCheck.ts): the loop mirrors Joo's generate() (engine calls mocked: which are
 * made, with what, and what is picked), shift times as his AscensionOverview times them, the check's
 * states, and the exact times merged into the row and the saved entry.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const calls: string[] = [];
let durations: Record<string, number> = {};

vi.mock('@/auto/ascension', () => ({
  runUntilShift: (state: { te: number }, ctx: { ascensionStartTime: number }) => {
    calls.push(`untilC3 te=${state.te} at=${ctx.ascensionStartTime}`);
    return { actions: [], state: { ...state, researchLevels: {} }, elapsedSeconds: 0 };
  },
  runAscensionFromC3Variant: (_b: unknown, _p: unknown, v: { saleCount: number; attemptTier13Unlock: boolean }, _c: unknown, start: number, id: string, te: number) => {
    const key = `${v.saleCount}-sale${v.attemptTier13Unlock ? '-tier13' : ''}`;
    calls.push(`variant ${id} ${key} te=${te}`);
    const d = durations[key] ?? 100;
    return {
      actions: [
        { type: 'start_ascension', payload: { initialEgg: 'curiosity' } },
        { type: 'wait_for_time', totalTimeSeconds: 10, payload: {} },
        { type: 'shift', payload: { toEgg: 'kindness' } },
        { type: 'buy_research', payload: {} },
        { type: 'wait_for_te', totalTimeSeconds: 0, payload: { totalTimeSeconds: 20 } },
        { type: 'shift', payload: { toEgg: 'humility' } },
      ],
      summary: { startTime: start, endTime: start + d, endTE: te, totalDurationSeconds: d },
    };
  },
  runContinueCurrent: (_s: unknown, _c: unknown, start: number, elr: number, te: number, id: string) => {
    calls.push(`continue ${id} elr=${elr} te=${te}`);
    const d = durations.continue ?? 100;
    return { actions: [], summary: { startTime: start, endTime: start + d, endTE: te, totalDurationSeconds: d } };
  },
  deriveNextStartState: (prev: { endTE: number }, base: object) => {
    calls.push(`next from ${prev.endTE}`);
    return { ...base, te: prev.endTE };
  },
}));
vi.mock('@/auto/shifts/c3', () => ({
  runC3Variants: (_s: unknown, _c: unknown, max: number, skip13: boolean) => {
    calls.push(`c3 max=${max} skip13=${skip13}`);
    return [
      { saleCount: 2, attemptTier13Unlock: false, impossible: false },
      { saleCount: 1, attemptTier13Unlock: true, impossible: true },
      { saleCount: 1, attemptTier13Unlock: false, impossible: false },
    ];
  },
}));
vi.mock('@/engine/compute', () => ({ computeSnapshot: () => ({ elr: 5 }) }));

const {
  ERROR_MAX,
  MESSAGE_ERROR_TEXT,
  checkKey,
  describeError,
  diffText,
  elapsedText,
  errorText,
  exactOfEntry,
  exactTimes,
  futureShifts,
  nextCheckState,
  nextShift,
  runExactCheck,
  runningText,
  shiftTimes,
  withExact,
  workerErrorText,
} = await import('./exactCheck');
type ExactInputs = import('./exactCheck').ExactInputs;
type ExactResult = import('./exactCheck').ExactResult;
type PlanEntry = import('./plansOnDevice').PlanEntry;

const NOW = 1_800_000_000;
const inputs = (over: Partial<ExactInputs> = {}): ExactInputs => ({
  chain: [160, 200],
  a1: '',
  start: NOW,
  now: NOW,
  context: { epicResearchLevels: {}, ascensionStartTime: 0, planStartOffset: 0 } as never,
  backupBase: { te: 150, currentEgg: 'kindness', population: 9, bankValue: 9, researchLevels: { a: 1 } } as never,
  continueState: null,
  currentTE: 150,
  ...over,
});

beforeEach(() => {
  calls.length = 0;
  durations = {};
});

describe('the check repeats generate()’s loop', () => {
  it('per ascension: to C3 once, every surviving build, the fastest picked, the next start from it', async () => {
    durations = { '2-sale': 300, '1-sale': 200 };
    const progress: string[] = [];
    const r = await runExactCheck(inputs(), p => progress.push(`${p.ascension}/${p.of} ${p.step}`));
    expect(calls).toEqual([
      `untilC3 te=150 at=${NOW}`,
      'c3 max=3 skip13=true',
      'variant asc_0 2-sale te=160',
      'variant asc_0 1-sale te=160',
      'next from 160',
      `untilC3 te=160 at=${NOW + 200}`,
      'c3 max=3 skip13=true',
      'variant asc_1 2-sale te=200',
      'variant asc_1 1-sale te=200',
    ]);
    expect(r.ascensions.map(a => [a.to, a.variant, a.start, a.end])).toEqual([
      [160, '1-sale', NOW, NOW + 200],
      [200, '1-sale', NOW + 200, NOW + 400],
    ]);
    expect(progress[0]).toBe('1/2 build phase');
    expect(progress).toContain('2/2 build 2 of 2');
  });

  it('A1 pinned to the row’s build (as Import into the planner pins it); later ones his fastest', async () => {
    durations = { '2-sale': 300, '1-sale': 200 };
    const r = await runExactCheck(inputs({ a1: '2-sale' }));
    expect(r.ascensions.map(a => a.variant)).toEqual(['2-sale', '1-sale']);
  });

  it('A1 Continue Current only with a farm and a start within the hour, with his ELR', async () => {
    durations = { continue: 50 };
    const farm = { te: 150 } as never;
    let r = await runExactCheck(inputs({ continueState: farm, chain: [160] }));
    expect(calls).toContain('continue asc_0_continue elr=5 te=160');
    expect(r.ascensions[0].variant).toBe('continue');
    calls.length = 0;
    r = await runExactCheck(inputs({ continueState: farm, chain: [160], start: NOW + 3601 }));
    expect(calls.some(c => c.startsWith('continue'))).toBe(false);
    expect(r.ascensions[0].variant).not.toBe('continue');
  });

  it('tier 13 skipped below 190 TE, tried from 190 (his TIER_13_MIN_STARTING_TE)', async () => {
    await runExactCheck(inputs({ currentTE: 190, chain: [195] }));
    expect(calls).toContain('c3 max=3 skip13=false');
  });

  it('A1 starts fresh from his base (curiosity, one chicken, no bank, no research)', async () => {
    let seen: unknown;
    const mod = await import('@/auto/ascension');
    const spy = vi.spyOn(mod, 'runUntilShift').mockImplementationOnce((s: unknown) => {
      seen = s;
      return { actions: [], state: s, elapsedSeconds: 0 } as never;
    });
    await runExactCheck(inputs({ chain: [160] }));
    expect(seen).toMatchObject({ currentEgg: 'curiosity', population: 1, bankValue: 0, researchLevels: {}, te: 150 });
    spy.mockRestore();
  });

  it('refuses a route whose stops do not rise', async () => {
    await expect(runExactCheck(inputs({ chain: [200, 180] }))).rejects.toThrow(/not above/);
    await expect(runExactCheck(inputs({ chain: [] }))).rejects.toThrow(/no route/);
  });

  it('shift times as his AscensionOverview: the start plus every wait before the shift', () => {
    const v = {
      summary: { startTime: 1000 } as never,
      actions: [
        { type: 'start_ascension', payload: {} },
        { type: 'wait_for_time', totalTimeSeconds: 10, payload: {} },
        { type: 'shift', payload: { toEgg: 'kindness' } },
        { type: 'wait_for_te', payload: { timeSeconds: 30 } },
        { type: 'shift', payload: { toEgg: 'humility' } },
      ] as never,
    };
    expect(shiftTimes(v)).toEqual([
      { egg: 'Kindness', at: 1010 },
      { egg: 'Humility', at: 1040 },
    ]);
  });
});

describe('the check’s states', () => {
  const result: ExactResult = { checkedAt: NOW, ascensions: [] };
  it('idle -> running -> done, error or cancelled; stray events ignored', () => {
    let s = nextCheckState({ kind: 'idle' }, { kind: 'progress', progress: { ascension: 1, of: 2, step: 'x' } });
    expect(s).toEqual({ kind: 'idle' });
    s = nextCheckState(s, { kind: 'start', atMs: 1000 });
    expect(s).toEqual({ kind: 'running', startedMs: 1000, progress: null });
    expect(nextCheckState(s, { kind: 'start', atMs: 5000 })).toBe(s);
    s = nextCheckState(s, { kind: 'progress', progress: { ascension: 2, of: 4, step: 'build 1 of 3' } });
    expect(runningText(s as never, 66_000)).toBe('1:05 so far · ascension 2 of 4 (build 1 of 3)');
    expect(nextCheckState(s, { kind: 'done', result, atMs: 61_000 })).toEqual({ kind: 'done', result, ms: 60_000 });
    expect(nextCheckState(s, { kind: 'error', message: 'x' })).toEqual({ kind: 'error', message: 'x' });
    expect(nextCheckState(s, { kind: 'cancel' })).toEqual({ kind: 'cancelled' });
    expect(nextCheckState({ kind: 'cancelled' }, { kind: 'done', result, atMs: 1 })).toEqual({ kind: 'cancelled' });
    expect(nextCheckState({ kind: 'error', message: 'x' }, { kind: 'start', atMs: 9 }).kind).toBe('running');
  });

  it('words: elapsed, error', () => {
    expect(elapsedText(0)).toBe('0:00');
    expect(elapsedText(125_400)).toBe('2:05');
    expect(errorText('out of memory')).toBe('The check couldn’t finish: out of memory');
  });

  it('the exact finish against the estimate', () => {
    expect(diffText(1000, 1000 + 3 * 3600)).toBe('3 hours later');
    expect(diffText(1000, 1000 - 3600)).toBe('1 hour earlier');
    expect(diffText(1000, 1000 + 6.7 * 86400)).toBe('6.7 days later');
    expect(diffText(1000, 1000 + 600)).toBe('about the same');
  });
});

describe('exact times into the row and the saved entry', () => {
  const r: ExactResult = {
    checkedAt: NOW,
    ascensions: [
      { to: 160, start: NOW - 100, end: NOW + 5000, variant: 'continue', endTE: 160, shifts: [{ egg: 'Integrity', at: NOW - 50 }, { egg: 'Kindness', at: NOW + 100 }] },
      { to: 200, start: NOW + 5000, end: NOW + 9000, variant: '2-sale', endTE: 201, shifts: [{ egg: 'Humility', at: NOW + 6000 }] },
    ],
  };
  const entry: PlanEntry = {
    chain: [160, 200],
    goal: 'Egg Day 2027',
    dated: true,
    deadline: NOW + 99999,
    savedAt: NOW * 1000,
    start: NOW,
    a1: 'continue',
    ascensions: [
      { to: 160, start: NOW, end: NOW + 4000, kind: 'estimate' },
      { to: 200, start: NOW + 4000, end: NOW + 8000, kind: 'estimate' },
    ],
    simVersion: 's',
    gear: 'maxed gear',
    te: 200,
    finishAt: NOW + 8000,
    next: { egg: 'Stale', at: 1 },
  };

  it('the row’s table rows', () => {
    expect(exactTimes(r)).toEqual([
      { n: 1, to: 160, start: NOW - 100, end: NOW + 5000 },
      { n: 2, to: 200, start: NOW + 5000, end: NOW + 9000 },
    ]);
  });

  it('next shift: the first one ahead in the CURRENT ascension only; future-only filter', () => {
    expect(nextShift(r, NOW)).toEqual({ egg: 'Kindness', at: NOW + 100 });
    expect(nextShift(r, NOW + 200)).toBeUndefined();
    expect(futureShifts(r.ascensions[0].shifts, NOW)).toEqual([{ egg: 'Kindness', at: NOW + 100 }]);
    expect(futureShifts(undefined, NOW)).toEqual([]);
  });

  it('the saved entry: kind exact with shifts, finish and TE from the check, next set', () => {
    const e = withExact(entry, r, NOW, NOW - 600);
    expect(e.ascensions.every(a => a.kind === 'exact')).toBe(true);
    expect(e.ascensions[0].shifts).toHaveLength(2);
    expect(e.finishAt).toBe(NOW + 9000);
    expect(e.te).toBe(201);
    expect(e.start).toBe(NOW - 100);
    expect(e.saveTime).toBe(NOW - 600);
    expect(e.next).toEqual({ egg: 'Kindness', at: NOW + 100 });
    // No shift ahead: no next (never a stale one kept).
    expect(withExact(entry, r, NOW + 200).next).toBeUndefined();
    // And back, for the calendar.
    expect(exactOfEntry(e)?.ascensions[0].shifts).toEqual(r.ascensions[0].shifts);
    expect(exactOfEntry(entry)).toBeNull();
  });

  it('kept in memory per save, goal, route and first build', () => {
    expect(checkKey({ saveTime: 5, goal: 'Egg Day 2027', chain: [160, 200], a1: 'continue' })).toBe('5|Egg Day 2027|160 200|continue');
  });
});

describe('an error says its real cause (never a stock phrase)', () => {
  it('a thrown error: our own plain message as it is; other errors with their name', () => {
    expect(describeError(new Error('ascension 1 already reaches 223 TE, past the next stop (197)'))).toBe(
      'ascension 1 already reaches 223 TE, past the next stop (197)'
    );
    expect(describeError(new TypeError('x is not a function'))).toBe('TypeError: x is not a function');
    expect(describeError(new RangeError(''))).toBe('RangeError: (no message)');
    expect(describeError('plain words')).toBe('plain words');
    expect(describeError(undefined)).toMatch(/unknown error/);
  });
  it('a DataCloneError (a DOMException-like object) says so in plain words', () => {
    const e = { name: 'DataCloneError', message: "Failed to execute 'postMessage' on 'Worker': #<Object> could not be cloned." };
    expect(describeError(e)).toBe(
      "DataCloneError: Failed to execute 'postMessage' on 'Worker': #<Object> could not be cloned. (the route couldn’t be copied to the simulator)"
    );
  });
  it('a worker error event: message and where; with no message, that the script failed to load', () => {
    expect(
      workerErrorText({ message: 'Uncaught ReferenceError: window is not defined', filename: 'https://x.test/ascension-planner/assets/exact.worker-abc.js', lineno: 3, colno: 17 })
    ).toBe('the simulator stopped: Uncaught ReferenceError: window is not defined (/ascension-planner/assets/exact.worker-abc.js:3:17)');
    expect(workerErrorText({ error: new SyntaxError("Unexpected token '<'") })).toBe("the simulator stopped: SyntaxError: Unexpected token '<'");
    expect(workerErrorText({ message: '', filename: '' })).toMatch(/^the simulator didn’t start: its script failed to load or run \(no file or line was given\)/);
    expect(MESSAGE_ERROR_TEXT).toMatch(/messageerror/);
  });
  it('long errors are cut to about 300 characters, on one line', () => {
    const t = describeError(new Error('a\nb ' + 'x'.repeat(1000)));
    expect(t.length).toBe(ERROR_MAX);
    expect(t.startsWith('a b ')).toBe(true);
    expect(t.endsWith('…')).toBe(true);
  });
  it('the client: every way a check can fail ends with the real cause and logs the full error', () => {
    const src = readFileSync(join(__dirname, 'exactClient.ts'), 'utf8');
    expect(src).not.toMatch(/the simulator stopped'/);
    expect(src).toMatch(/w\.onerror = e => \{[\s\S]*?workerErrorText\(e\)/);
    expect(src).toMatch(/w\.onmessageerror = /);
    expect(src).toMatch(/try \{\s*w\.postMessage\(/);
    expect(src).toMatch(/try \{\s*w = new Worker\(/);
    expect(src).toMatch(/console\.error\(/);
    const worker = readFileSync(join(__dirname, 'exact.worker.ts'), 'utf8');
    expect(worker).toMatch(/message: describeError\(err\)/);
  });
});

describe('nothing is sent anywhere (no-network scan of the check and calendar files)', () => {
  const files = [
    ...['exactCheck.ts', 'exactInputs.ts', 'exactClient.ts', 'exact.worker.ts', 'calendarEvents.ts', 'device.ts'].map(f => join(__dirname, f)),
    ...['ExactCheck.vue', 'CalendarButton.vue'].map(f => join(__dirname, '..', 'components', 'instant', f)),
  ];
  it.each(files)('%s makes no request', f => {
    const src = readFileSync(f, 'utf8');
    expect(src).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|new WebSocket|EventSource/);
  });
  it('the folder still has them all', () => {
    expect(readdirSync(__dirname)).toEqual(expect.arrayContaining(['exactCheck.ts', 'calendarEvents.ts']));
  });
});
