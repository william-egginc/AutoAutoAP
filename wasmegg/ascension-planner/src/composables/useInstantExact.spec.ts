/**
 * The instant answer's route worked out exactly in the background (composables/useInstantExact.ts, R10 option C) with
 * a stand-in chain worker: the route's prefixes in one run with the hour handoff, the inputs built only in the run,
 * progress per ascension, the newest route wins, never while a search runs, stop(), a failure is final for the key,
 * a kept record is used at once, By a date's spare against the deadline, and when it is wanted at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import {
  EXACT_RECORD_KEY,
  exactWanted,
  setExactRunner,
  setExactTiming,
  useInstantExact,
  type ExactRequest,
  type ExactRunner,
} from './useInstantExact';
import type { Availability } from '@/search/availability';
import type { ChainResult, LegSummary, SearchInputs } from '@/search/types';

const T0 = 1_800_000_000;
let mem: Map<string, string>;
interface Run {
  inputs: SearchInputs;
  chains: number[][];
  opts: { handoff?: string };
  onDone: (done: number, total: number) => void;
  resolve: (r: ChainResult[]) => void;
  reject: (e: Error) => void;
}
let runs: Run[];
let terminated: number;
let built: number;

beforeEach(() => {
  mem = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  runs = [];
  terminated = 0;
  built = 0;
  setExactTiming({ delayMs: 0 });
  setExactRunner(
    (): ExactRunner => ({
      run: (inputs, chains, opts, onDone) =>
        new Promise((resolve, reject) => runs.push({ inputs, chains, opts, onDone, resolve, reject })),
      terminate: () => void terminated++,
    })
  );
});
afterEach(() => {
  vi.useRealTimers();
  setExactTiming(null);
  setExactRunner(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const HOURS: Availability = { days: [0, 1, 2, 3, 4, 5, 6], fromHour: 7, toHour: 23, timezone: 'America/Denver' };

function req(chain = [226, 277, 490], extra: Partial<ExactRequest> = {}): ExactRequest {
  return {
    key: `acct|${T0}|${chain.join(',')}|setup`,
    chain,
    inputs: () => {
      built++;
      return { planStart: T0 } as unknown as SearchInputs;
    },
    ...extra,
  };
}
const leg = (endTE: number, end: number) =>
  ({ key: '1-sale', endTE, durationSeconds: end - T0, maxELR: 1, endTime: end, startTime: T0 }) as LegSummary;
/** The simulator's answer for every prefix of `chain`: ascension i ends at `ends[i]`. */
function answer(chain: number[], ends: number[]): ChainResult[] {
  return chain.map((_, i) => ({
    chain: chain.slice(0, i + 1),
    seconds: ends[i] - T0,
    legs: chain.slice(0, i + 1).map((te, j) => leg(te, ends[j])),
  }));
}
const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
  }
};

function mount(r: ExactRequest | null, busy = false, trigger: 'auto' | 'manual' = 'auto') {
  const request = ref<ExactRequest | null>(r);
  const isBusy = ref(busy);
  const how = ref(trigger);
  const scope = effectScope();
  const api = scope.run(() => useInstantExact(request, isBusy, how))!;
  return { request, isBusy, how, scope, ...api };
}

describe('useInstantExact', () => {
  it('runs every prefix of the route once, with the hour handoff and inputs built in the run; progress per ascension; done gives each ascension’s exact end', async () => {
    const m = mount(req());
    expect(m.state.value).toMatchObject({ status: 'waiting' });
    await flush();
    expect(runs).toHaveLength(1);
    expect(built).toBe(1);
    expect(runs[0].chains).toEqual([[226], [226, 277], [226, 277, 490]]);
    expect(runs[0].opts).toEqual({ handoff: 'hour' });
    expect(m.state.value).toMatchObject({ status: 'running', done: 0, total: 3 });
    expect((m.state.value as { startedAt: number }).startedAt).toBeGreaterThan(0);
    runs[0].onDone(2, 3);
    expect(m.state.value).toMatchObject({ status: 'running', done: 2, total: 3 });
    runs[0].resolve(answer([226, 277, 490], [T0 + 100, T0 + 200, T0 + 900]));
    await flush();
    expect(m.state.value).toMatchObject({
      key: req().key,
      status: 'done',
      end: T0 + 900,
      legs: [T0 + 100, T0 + 200, T0 + 900],
      spare: null,
    });
    expect(terminated).toBe(1);
    m.scope.stop();
  });

  it('keeps the record: the next mount is done at once without a run', async () => {
    const m = mount(req());
    await flush();
    runs[0].resolve(answer([226, 277, 490], [T0 + 100, T0 + 200, T0 + 900]));
    await flush();
    m.scope.stop();
    expect(JSON.parse(mem.get(EXACT_RECORD_KEY)!)).toHaveLength(1);
    const again = mount(req());
    expect(again.state.value).toMatchObject({ status: 'done', end: T0 + 900, legs: [T0 + 100, T0 + 200, T0 + 900] });
    await flush();
    expect(runs).toHaveLength(1);
    again.scope.stop();
  });

  it('a record kept before the 22 Nov fix (no version: it may be from today’s start, not the answer’s) is not used; it runs again', async () => {
    const old = { key: req().key, status: 'done', end: T0 + 1, legs: [T0 + 1], spare: null, routes: [], faster: 0 };
    mem.set(EXACT_RECORD_KEY, JSON.stringify([old]));
    const m = mount(req());
    await flush();
    expect(runs).toHaveLength(1);
    m.scope.stop();
  });

  it('By a date: the spare is the deadline less the exact end, reached counting (negative: the route misses it)', async () => {
    const end = T0 + 600;
    const hit = mount(req([300], { deadline: end + 3600 }));
    await flush();
    runs[0].resolve(answer([300], [end]));
    await flush();
    expect(hit.state.value).toMatchObject({ status: 'done', end, spare: 3600 });
    hit.scope.stop();
    const miss = mount(req([301], { deadline: end - 60 }));
    await flush();
    runs[1].resolve(answer([301], [end]));
    await flush();
    expect(miss.state.value).toMatchObject({ status: 'done', end, spare: -60 });
    miss.scope.stop();
  });

  it('manual: idle until start(), then runs', async () => {
    const m = mount(req(), false, 'manual');
    await flush();
    expect(m.state.value).toMatchObject({ status: 'idle' });
    expect(runs).toHaveLength(0);
    m.start();
    await flush();
    expect(runs).toHaveLength(1);
    expect(m.state.value).toMatchObject({ status: 'running' });
    m.scope.stop();
  });

  it('never while a search runs: waits, starts when it ends; a search that starts lets the run go and it starts again after', async () => {
    const m = mount(req(), true);
    await flush();
    expect(m.state.value).toMatchObject({ status: 'waiting' });
    expect(runs).toHaveLength(0);
    m.isBusy.value = false;
    await flush();
    expect(runs).toHaveLength(1);
    m.isBusy.value = true;
    await flush();
    expect(terminated).toBe(1);
    expect(m.state.value).toMatchObject({ status: 'waiting' });
    runs[0].resolve(answer([226, 277, 490], [T0 + 1, T0 + 2, T0 + 3]));
    await flush();
    expect(m.state.value).toMatchObject({ status: 'waiting' });
    m.isBusy.value = false;
    await flush();
    expect(runs).toHaveLength(2);
    m.scope.stop();
  });

  it('the newest route wins: a change lets the running one go and its late answer is dropped', async () => {
    const m = mount(req());
    await flush();
    m.request.value = req([230, 490]);
    await flush();
    expect(terminated).toBe(1);
    expect(runs).toHaveLength(2);
    runs[0].resolve(answer([226, 277, 490], [T0 + 1, T0 + 2, T0 + 3]));
    await flush();
    expect(m.state.value).toMatchObject({ key: req([230, 490]).key, status: 'running' });
    runs[1].resolve(answer([230, 490], [T0 + 5, T0 + 9]));
    await flush();
    expect(m.state.value).toMatchObject({ key: req([230, 490]).key, status: 'done', end: T0 + 9 });
    m.request.value = null;
    await flush();
    expect(m.state.value).toBeNull();
    m.scope.stop();
  });

  it('stop(): the run is let go and not started again for that route (start() asks again)', async () => {
    const m = mount(req());
    await flush();
    m.stop();
    await flush();
    expect(terminated).toBe(1);
    expect(m.state.value).toMatchObject({ status: 'idle' });
    m.isBusy.value = true;
    await flush();
    m.isBusy.value = false;
    await flush();
    expect(runs).toHaveLength(1);
    m.start();
    await flush();
    expect(runs).toHaveLength(2);
    m.scope.stop();
  });

  it('a failure is final for the route on this page: said, not asked again, nothing kept', async () => {
    const m = mount(req());
    await flush();
    runs[0].reject(new Error('out of memory'));
    await flush();
    expect(m.state.value).toMatchObject({ status: 'failed', error: 'out of memory' });
    m.isBusy.value = true;
    await flush();
    m.isBusy.value = false;
    await flush();
    expect(runs).toHaveLength(1);
    expect(mem.get(EXACT_RECORD_KEY)).toBeUndefined();
    m.scope.stop();
  });

  it('a route the simulator cannot finish fails (the whole route missing from the answer)', async () => {
    const m = mount(req());
    await flush();
    runs[0].resolve(answer([226, 277, 490], [T0 + 1, T0 + 2, T0 + 3]).slice(0, 2));
    await flush();
    expect(m.state.value).toMatchObject({ status: 'failed' });
    m.scope.stop();
  });

  it('a run silent past stallMs fails; a word from the worker restarts the clock', async () => {
    vi.useFakeTimers();
    setExactTiming({ delayMs: 0, stallMs: 1000 });
    const m = mount(req());
    await vi.advanceTimersByTimeAsync(1);
    expect(runs).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(800);
    runs[0].onDone(1, 3);
    await vi.advanceTimersByTimeAsync(800);
    expect(m.state.value).toMatchObject({ status: 'running', done: 1 });
    await vi.advanceTimersByTimeAsync(300);
    expect(m.state.value).toMatchObject({ status: 'failed' });
    expect(terminated).toBe(1);
    m.scope.stop();
  });
});

describe('useInstantExact: two routes (Jordan, 21 Nov 2026: B changed the pick)', () => {
  const alt = [230, 277, 490];
  it('runs both routes’ prefixes in one batch, a shared prefix once; one total; done gives both, the request’s first and top-level', async () => {
    const m = mount(req([226, 277, 490], { alt: [226, 300, 490] }));
    await flush();
    expect(runs).toHaveLength(1);
    expect(built).toBe(1);
    expect(runs[0].chains).toEqual([[226], [226, 277], [226, 277, 490], [226, 300], [226, 300, 490]]);
    expect(m.state.value).toMatchObject({ status: 'running', done: 0, total: 5 });
    runs[0].onDone(4, 5);
    expect(m.state.value).toMatchObject({ status: 'running', done: 4, total: 5 });
    runs[0].resolve([
      ...answer([226, 277, 490], [T0 + 100, T0 + 200, T0 + 9000]),
      ...answer([226, 300, 490], [T0 + 100, T0 + 300, T0 + 5000]).slice(1),
    ]);
    await flush();
    expect(m.state.value).toMatchObject({
      status: 'done',
      end: T0 + 9000,
      legs: [T0 + 100, T0 + 200, T0 + 9000],
      spare: null,
      routes: [
        { chain: [226, 277, 490], end: T0 + 9000, legs: [T0 + 100, T0 + 200, T0 + 9000], spare: null },
        { chain: [226, 300, 490], end: T0 + 5000, legs: [T0 + 100, T0 + 300, T0 + 5000], spare: null },
      ],
      faster: 1,
    });
    m.scope.stop();
  });

  it('faster is the other route only when it ends at least an hour sooner (a tie or less keeps the request’s route)', async () => {
    const m = mount(req([226, 277, 490], { alt }));
    await flush();
    runs[0].resolve([
      ...answer([226, 277, 490], [T0 + 1, T0 + 2, T0 + 7200]),
      ...answer(alt, [T0 + 1, T0 + 2, T0 + 3601]),
    ]);
    await flush();
    expect(m.state.value).toMatchObject({ status: 'done', faster: 0 });
    m.request.value = req([226, 277, 491], { alt });
    await flush();
    runs[1].resolve([
      ...answer([226, 277, 491], [T0 + 1, T0 + 2, T0 + 7200]),
      ...answer(alt, [T0 + 1, T0 + 2, T0 + 3600]),
    ]);
    await flush();
    expect(m.state.value).toMatchObject({ status: 'done', faster: 1 });
    m.scope.stop();
  });

  it('By a date: each route’s spare against the deadline', async () => {
    const m = mount(req([300, 490], { alt: [310, 490], deadline: T0 + 1000 }));
    await flush();
    runs[0].resolve([...answer([300, 490], [T0 + 10, T0 + 1060]), ...answer([310, 490], [T0 + 10, T0 + 400])]);
    await flush();
    expect(m.state.value).toMatchObject({
      status: 'done',
      spare: -60,
      routes: [{ spare: -60 }, { spare: 600 }],
      faster: 0,
    });
    m.scope.stop();
  });

  it('By a date (code review 22 Nov 2026, math-exact-3): the other route counts as faster only ending on the same TE, by the date, an hour sooner', async () => {
    const H = 3600;
    // Different last stops: 296 is not 300, however soon.
    const a = mount(req([250, 280, 300], { alt: [260, 296], deadline: T0 + 100 * H }));
    await flush();
    runs[0].resolve([
      ...answer([250, 280, 300], [T0 + H, T0 + 2 * H, T0 + 50 * H]),
      ...answer([260, 296], [T0 + H, T0 + 5 * H]),
    ]);
    await flush();
    expect(a.state.value).toMatchObject({ status: 'done', faster: 0 });
    a.scope.stop();
    // The same last stop, two hours sooner, by the date: faster.
    const b = mount(req([300, 490], { alt: [310, 490], deadline: T0 + 100 * H }));
    await flush();
    runs[1].resolve([...answer([300, 490], [T0 + H, T0 + 50 * H]), ...answer([310, 490], [T0 + H, T0 + 48 * H])]);
    await flush();
    expect(b.state.value).toMatchObject({ status: 'done', faster: 1 });
    b.scope.stop();
    // The same last stop and sooner, but after the date: not.
    const c = mount(req([300, 491], { alt: [310, 491], deadline: T0 + 10 * H }));
    await flush();
    runs[2].resolve([...answer([300, 491], [T0 + H, T0 + 50 * H]), ...answer([310, 491], [T0 + H, T0 + 48 * H])]);
    await flush();
    expect(c.state.value).toMatchObject({ status: 'done', faster: 0 });
    c.scope.stop();
  });

  it('the same stops (or no other route): one route, faster 0', async () => {
    const m = mount(req([226, 277, 490], { alt: [226, 277, 490] }));
    await flush();
    expect(runs[0].chains).toEqual([[226], [226, 277], [226, 277, 490]]);
    runs[0].resolve(answer([226, 277, 490], [T0 + 1, T0 + 2, T0 + 3]));
    await flush();
    expect(m.state.value).toMatchObject({ status: 'done', faster: 0, routes: [{ chain: [226, 277, 490] }] });
    expect((m.state.value as { routes: unknown[] }).routes).toHaveLength(1);
    m.scope.stop();
    const one = mount(req([226, 277, 490], { key: 'other' }));
    await flush();
    runs[1].resolve(answer([226, 277, 490], [T0 + 1, T0 + 2, T0 + 3]));
    await flush();
    expect(one.state.value).toMatchObject({ status: 'done', faster: 0, routes: [{ end: T0 + 3 }] });
    one.scope.stop();
  });

  it('the other route the simulator cannot finish: done with the request’s route alone; the request’s missing: failed', async () => {
    const m = mount(req([226, 277, 490], { alt }));
    await flush();
    runs[0].resolve([
      ...answer([226, 277, 490], [T0 + 1, T0 + 2, T0 + 9000]),
      ...answer(alt, [T0 + 1, T0 + 2, T0 + 3]).slice(0, 2),
    ]);
    await flush();
    expect(m.state.value).toMatchObject({ status: 'done', end: T0 + 9000, faster: 0 });
    expect((m.state.value as { routes: unknown[] }).routes).toHaveLength(1);
    m.scope.stop();
    const n = mount(req([226, 277, 491], { alt }));
    await flush();
    runs[1].resolve(answer(alt, [T0 + 1, T0 + 2, T0 + 3]));
    await flush();
    expect(n.state.value).toMatchObject({ status: 'failed' });
    n.scope.stop();
  });

  it('a kept record of two routes comes back with both', async () => {
    const m = mount(req([226, 277, 490], { alt }));
    await flush();
    runs[0].resolve([
      ...answer([226, 277, 490], [T0 + 1, T0 + 2, T0 + 9000]),
      ...answer(alt, [T0 + 1, T0 + 2, T0 + 3]),
    ]);
    await flush();
    m.scope.stop();
    const again = mount(req([226, 277, 490], { alt }));
    expect(again.state.value).toMatchObject({
      status: 'done',
      faster: 1,
      routes: [{ end: T0 + 9000 }, { end: T0 + 3 }],
    });
    again.scope.stop();
  });
});

describe('exactWanted', () => {
  const mask: Availability = {
    ...HOURS,
    blocked: [...Array.from({ length: 168 }, (_, i) => i).filter(i => i % 24 < 9)],
  };
  it('anyHours: hours that rule something out, with held shifts', () => {
    expect(exactWanted(HOURS, true, 'anyHours')).toBe(true);
    expect(exactWanted(mask, true, 'anyHours')).toBe(true);
    expect(exactWanted(HOURS, false, 'anyHours')).toBe(false);
    expect(exactWanted(null, true, 'anyHours')).toBe(false);
    expect(exactWanted({ ...HOURS, fromHour: 0, toHour: 0 }, true, 'anyHours')).toBe(false);
  });
  it('weeklyOnly: only a weekly mask that is not its own daily window', () => {
    expect(exactWanted(HOURS, true, 'weeklyOnly')).toBe(false);
    expect(exactWanted(mask, true, 'weeklyOnly')).toBe(true);
    expect(exactWanted(mask, false, 'weeklyOnly')).toBe(false);
  });
});
