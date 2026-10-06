import { describe, expect, it } from 'vitest';
import {
  HOUR_MS,
  REOPEN_GRACE_MS,
  STALE_MS,
  autoCarryOnVerdict,
  canReopen,
  carryOnWorkers,
  clock12,
  fewerWorkersCap,
  heartbeatAge,
  memoryHigh,
  nextReopenAllowedAt,
  rateSlow,
  readOptions,
  readRunMark,
  stepDown,
  stepDownDecision,
  watchVerdict,
  writeOptions,
  writeRunMark,
  type RateSample,
  type RunMark,
} from './stepAway';

const T0 = Date.UTC(2026, 9, 5, 7, 0, 0);
const MIN = 60_000;

function mark(over: Partial<RunMark> = {}): RunMark {
  return {
    version: 1,
    kind: 'deadline',
    url: 'https://example.test/ascension-planner/#/auto/by-date',
    account: 'acct',
    startedAt: T0 - HOUR_MS,
    beatAt: T0,
    status: 'running',
    autoCarryOn: true,
    watch: true,
    fewerWorkers: false,
    workers: 19,
    reopens: [],
    autoCarries: [],
    ...over,
  };
}

function memStore(): Pick<Storage, 'getItem' | 'setItem'> {
  const m = new Map<string, string>();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

describe('options and run mark storage', () => {
  it('defaults every option off, and remembers what is ticked', () => {
    const s = memStore();
    expect(readOptions(s)).toEqual({ autoCarryOn: false, watch: false, fewerWorkers: false });
    writeOptions({ autoCarryOn: true, watch: false, fewerWorkers: true }, s);
    expect(readOptions(s)).toEqual({ autoCarryOn: true, watch: false, fewerWorkers: true });
  });

  it('survives unreadable or missing storage', () => {
    const broken = { getItem: () => '{nope', setItem: () => {} };
    expect(readOptions(broken).watch).toBe(false);
    expect(readRunMark(broken)).toBeNull();
    expect(readOptions(null).autoCarryOn).toBe(false);
  });

  it('round-trips a run mark', () => {
    const s = memStore();
    writeRunMark(mark(), s);
    expect(readRunMark(s)).toMatchObject({ kind: 'deadline', status: 'running', workers: 19 });
  });
});

describe('heartbeat staleness', () => {
  it('is fresh within 2 minutes and stale after', () => {
    expect(watchVerdict(mark(), T0 + STALE_MS - 1000)).toBe('watching');
    expect(watchVerdict(mark(), T0 + STALE_MS + 1000)).toBe('reopen');
  });

  it('gives a reopened page its grace before calling it stale again', () => {
    const m = mark({ beatAt: T0 - 10 * MIN, reopens: [T0] });
    expect(heartbeatAge(m, T0 + REOPEN_GRACE_MS - 1000)).toBeLessThanOrEqual(STALE_MS);
    expect(watchVerdict(m, T0 + REOPEN_GRACE_MS - 1000)).toBe('watching');
    expect(watchVerdict(m, T0 + REOPEN_GRACE_MS + 1000)).toBe('reopen');
  });

  it('stands down when the run ends, is stopped, closed or stuck, or the watcher is off', () => {
    const late = T0 + 10 * MIN;
    expect(watchVerdict(mark({ status: 'finished' }), late)).toBe('finished');
    expect(watchVerdict(mark({ status: 'stopped' }), late)).toBe('stopped');
    expect(watchVerdict(mark({ status: 'closed' }), late)).toBe('closed');
    expect(watchVerdict(mark({ status: 'stuck' }), late)).toBe('stuck');
    expect(watchVerdict(mark({ watch: false }), late)).toBe('idle');
    expect(watchVerdict(null, late)).toBe('idle');
  });
  it('leaves alone a run that was already quiet when the watcher started', () => {
    // Last beat at T0; a watcher opened 10 minutes later finds it stale: an old crash, not news.
    const opened = T0 + 10 * 60_000;
    expect(watchVerdict(mark(), opened + 1000, STALE_MS, opened)).toBe('waiting');
    // Opened while the run still beat: it was fresh while watched, so a stall is reopened.
    const early = T0 + 60_000;
    expect(watchVerdict(mark(), T0 + STALE_MS + 1000, STALE_MS, early)).toBe('reopen');
    // A run that starts after the watcher opened is watched as usual.
    expect(watchVerdict(mark({ beatAt: opened + 5000 }), opened + 6000, STALE_MS, opened)).toBe('watching');
  });

  it('waits, rather than reporting an old run as closed or finished, when the box is ticked before a run', () => {
    // The last run here was closed (or finished, stopped, stuck) before this watcher opened.
    const opened = T0 + 10 * MIN;
    for (const status of ['closed', 'finished', 'stopped', 'stuck'] as const) {
      const old = mark({ status, endedAt: T0 });
      expect(watchVerdict(old, opened + 1000, STALE_MS, opened)).toBe('waiting');
      // Even if its end was written after this tab opened: this tab never saw it run.
      expect(watchVerdict(mark({ status, endedAt: opened + 500 }), opened + 1000, STALE_MS, opened)).toBe('waiting');
    }
    // A new run starts: watching.
    const fresh = mark({ startedAt: opened + 60_000, beatAt: opened + 65_000 });
    expect(watchVerdict(fresh, opened + 70_000, STALE_MS, opened)).toBe('watching');
  });

  it('reports the end of a run this watcher watched', () => {
    const opened = T0 + 10 * MIN;
    // Started after the watcher opened.
    const after = mark({ startedAt: opened + 60_000, beatAt: opened + 5 * MIN, status: 'finished' });
    expect(watchVerdict(after, opened + 6 * MIN, STALE_MS, opened)).toBe('finished');
    // Already going when it opened, and seen running.
    const before = mark({ startedAt: T0 - HOUR_MS, beatAt: opened + 5 * MIN, status: 'closed' });
    expect(watchVerdict(before, opened + 6 * MIN, STALE_MS, opened, before.startedAt)).toBe('closed');
    expect(watchVerdict({ ...before, status: 'stopped' }, opened + 6 * MIN, STALE_MS, opened, before.startedAt)).toBe(
      'stopped'
    );
    // Seen running was a different run.
    expect(watchVerdict(before, opened + 6 * MIN, STALE_MS, opened, before.startedAt + 1)).toBe('waiting');
  });
});

describe('reopen guard', () => {
  it('allows 3 an hour, then waits for the oldest to age out', () => {
    const three = [T0 - 50 * MIN, T0 - 20 * MIN, T0 - 5 * MIN];
    expect(canReopen(three.slice(0, 2), T0)).toBe(true);
    expect(canReopen(three, T0)).toBe(false);
    expect(nextReopenAllowedAt(three, T0)).toBe(T0 + 10 * MIN);
    expect(canReopen(three, T0 + 11 * MIN)).toBe(true);
  });

  it('says guarded instead of reopening a fourth time', () => {
    const m = mark({ beatAt: T0 - 10 * MIN, reopens: [T0 - 40 * MIN, T0 - 30 * MIN, T0 - 20 * MIN] });
    expect(watchVerdict(m, T0)).toBe('guarded');
  });
});

describe('worker counts', () => {
  it('caps at about half the cores, at least 1', () => {
    expect(fewerWorkersCap(20)).toBe(10);
    expect(fewerWorkersCap(7)).toBe(3);
    expect(fewerWorkersCap(1)).toBe(1);
  });

  it('steps down about a quarter, at least one, never below the floor', () => {
    expect(stepDown(19)).toBe(14);
    expect(stepDown(3)).toBe(2);
    expect(stepDown(2)).toBe(1);
    expect(stepDown(1)).toBe(1);
    expect(stepDown(10, 5)).toBe(7);
    expect(stepDown(6, 5)).toBe(5);
    expect(stepDown(5, 5)).toBe(5);
  });

  it('carries on after a crash with fewer workers, and option 3 caps that too', () => {
    expect(carryOnWorkers(19, 20, false)).toBe(14);
    expect(carryOnWorkers(19, 20, true)).toBe(10);
    expect(carryOnWorkers(1, 20, false)).toBe(1);
    expect(carryOnWorkers(0, 4, false)).toBe(1);
  });
});

describe('memory rule', () => {
  it('counts the page and the workers against what is sensible', () => {
    expect(memoryHigh({ heapMB: 100, workersHeapMB: 2000 }, 4096)).toBe(false);
    expect(memoryHigh({ heapMB: 100, workersHeapMB: 2900 }, 4096)).toBe(true);
    // Workers that can't report count as nothing, not as a reason.
    expect(memoryHigh({ heapMB: 100, workersHeapMB: null }, 4096)).toBe(false);
    // The main heap near its own limit.
    expect(memoryHigh({ heapMB: 3000, heapLimitMB: 4000 }, 100_000)).toBe(true);
  });
});

/** Beats every `every` ms from `from` to `to`, at `rate` chains/min per worker. */
function beats(from: number, to: number, rate: number, workers = 10, every = 15_000, start = 0): RateSample[] {
  const out: RateSample[] = [];
  let done = start;
  for (let at = from; at <= to; at += every) {
    out.push({ at, done: Math.round(done), workers });
    done += (rate * workers * every) / MIN;
  }
  return out;
}

describe('speed rule', () => {
  const now = T0;
  it('fires after 5+ minutes under 40% of its own recent median', () => {
    const fast = beats(now - 35 * MIN, now - 5 * MIN, 10);
    const slow = beats(now - 5 * MIN + 15_000, now, 2, 10, 15_000, fast[fast.length - 1].done);
    expect(rateSlow([...fast, ...slow], now)).toBe(true);
  });

  it('does not fire on a short dip, a modest slowdown, or without history', () => {
    const fast = beats(now - 35 * MIN, now - 2 * MIN, 10);
    const dip = beats(now - 2 * MIN + 15_000, now, 1, 10, 15_000, fast[fast.length - 1].done);
    expect(rateSlow([...fast, ...dip], now)).toBe(false);
    const fast2 = beats(now - 35 * MIN, now - 5 * MIN, 10);
    const modest = beats(now - 5 * MIN + 15_000, now, 6, 10, 15_000, fast2[fast2.length - 1].done);
    expect(rateSlow([...fast2, ...modest], now)).toBe(false);
    expect(rateSlow(beats(now - 6 * MIN, now, 1), now)).toBe(false);
  });

  it('treats a frozen-tab gap as a gap, not as slowness', () => {
    const fast = beats(now - 60 * MIN, now - 30 * MIN, 10);
    const after = beats(now - 4 * MIN, now, 10, 10, 15_000, fast[fast.length - 1].done + 10);
    expect(rateSlow([...fast, ...after], now)).toBe(false);
  });

  it('is per worker, so fewer workers is not "slow"', () => {
    const fast = beats(now - 35 * MIN, now - 5 * MIN, 10, 16);
    const fewer = beats(now - 5 * MIN + 15_000, now, 10, 4, 15_000, fast[fast.length - 1].done);
    expect(rateSlow([...fast, ...fewer], now)).toBe(false);
  });
});

describe('step-down decision', () => {
  const base = {
    now: T0,
    workers: 10,
    cap: 10,
    lastStepAt: T0 - HOUR_MS,
    sensibleMB: 4096,
    samples: [] as RateSample[],
  };
  it('steps down on two high-memory beats, not one', () => {
    expect(stepDownDecision({ ...base, memory: [{ heapMB: 3500 }] })).toBeNull();
    expect(stepDownDecision({ ...base, memory: [{ heapMB: 3500 }, { heapMB: 3600 }] })).toEqual({
      to: 7,
      reason: 'memory',
    });
  });
  it('waits out the cooldown, and stops at half the cap', () => {
    const high = [{ heapMB: 3500 }, { heapMB: 3600 }];
    expect(stepDownDecision({ ...base, lastStepAt: T0 - MIN, memory: high })).toBeNull();
    expect(stepDownDecision({ ...base, workers: 5, memory: high })).toBeNull();
    expect(stepDownDecision({ ...base, workers: 6, memory: high })?.to).toBe(5);
  });
});

describe('automatic carry-on', () => {
  const crash = { phase: 'deadline search', at: T0 };
  const ok = {
    mark: mark(),
    kind: 'deadline' as const,
    account: 'acct',
    now: T0 + 5 * MIN,
    crash,
    lockHeld: false,
    canCarryOn: true,
  };
  it('goes for the same kind and account after a crash', () => {
    expect(autoCarryOnVerdict(ok)).toEqual({ go: true });
  });
  it('does nothing when off, closed on purpose, another kind or account, alive, or unable', () => {
    expect(autoCarryOnVerdict({ ...ok, mark: mark({ autoCarryOn: false }) })).toMatchObject({ why: 'off' });
    expect(autoCarryOnVerdict({ ...ok, mark: mark({ status: 'finished' }) })).toMatchObject({ why: 'off' });
    expect(autoCarryOnVerdict({ ...ok, crash: { ...crash, pageClosed: true } })).toMatchObject({ why: 'no-crash' });
    expect(autoCarryOnVerdict({ ...ok, crash: null })).toMatchObject({ why: 'no-crash' });
    expect(autoCarryOnVerdict({ ...ok, kind: 'sweep' })).toMatchObject({ why: 'other-kind' });
    expect(autoCarryOnVerdict({ ...ok, crash: { phase: 'submit', at: T0 } })).toMatchObject({ why: 'other-kind' });
    expect(autoCarryOnVerdict({ ...ok, account: 'other' })).toMatchObject({ why: 'other-account' });
    expect(autoCarryOnVerdict({ ...ok, now: T0 + 25 * HOUR_MS })).toMatchObject({ why: 'too-old' });
    expect(autoCarryOnVerdict({ ...ok, lockHeld: true })).toMatchObject({ why: 'alive' });
    expect(autoCarryOnVerdict({ ...ok, canCarryOn: false })).toMatchObject({ why: 'cannot' });
  });
  it('stops carrying on by itself after 3 in an hour', () => {
    const m = mark({ autoCarries: [T0 - 30 * MIN, T0 - 20 * MIN, T0 - 10 * MIN] });
    expect(autoCarryOnVerdict({ ...ok, mark: m })).toMatchObject({ why: 'guard' });
  });
});

describe('clock12', () => {
  it('writes 12-hour times', () => {
    const d = new Date(2026, 9, 5, 0, 7);
    expect(clock12(d.getTime())).toBe('12:07 am');
    expect(clock12(new Date(2026, 9, 5, 15, 30).getTime())).toBe('3:30 pm');
    expect(clock12(new Date(2026, 9, 5, 12, 0).getTime())).toBe('12:00 pm');
  });
});
