/**
 * A run that ends with an error ('failed') is treated as the crash it is: the watcher reopens it and
 * the reopened page carries it on by itself, within the 3-an-hour guard. And a run starting in a
 * second tab never writes over a run mark that is still alive in the first.
 */
import { describe, expect, it } from 'vitest';
import {
  HOUR_MS,
  REOPEN_GRACE_MS,
  autoCarryOnVerdict,
  markHeldElsewhere,
  watchVerdict,
  type RunMark,
} from './stepAway';

const T0 = Date.UTC(2026, 9, 10, 7, 0, 0);
const MIN = 60_000;

function mark(over: Partial<RunMark> = {}): RunMark {
  return {
    version: 1,
    kind: 'deadline',
    url: 'https://example.test/#/auto/by-date',
    account: 'acct',
    startedAt: T0 - HOUR_MS,
    beatAt: T0 - MIN,
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

describe('the watcher and a failed run', () => {
  const failed = mark({ status: 'failed', endedAt: T0 - MIN });
  it('reopens a run it watched that failed, even though its page lives on', () => {
    expect(watchVerdict(failed, T0, undefined, T0 - 2 * HOUR_MS)).toBe('reopen');
  });
  it('waits for the reopened page rather than opening another every check', () => {
    const reopened = { ...failed, reopens: [T0 - 30_000] };
    expect(watchVerdict(reopened, T0, undefined, T0 - 2 * HOUR_MS)).toBe('watching');
    expect(watchVerdict(reopened, T0 + REOPEN_GRACE_MS, undefined, T0 - 2 * HOUR_MS)).toBe('reopen');
  });
  it('keeps to the guard: three an hour', () => {
    const often = { ...failed, reopens: [T0 - 50 * MIN, T0 - 40 * MIN, T0 - 30 * MIN] };
    expect(watchVerdict(often, T0, undefined, T0 - 2 * HOUR_MS)).toBe('guarded');
  });
  it('leaves alone a failure from before it began watching', () => {
    expect(watchVerdict(failed, T0, undefined, T0)).toBe('waiting');
  });
  it('still says finished only for a finished run', () => {
    expect(watchVerdict(mark({ status: 'finished' }), T0, undefined, T0 - 2 * HOUR_MS)).toBe('finished');
  });
});

describe('carrying on by itself after a failed run', () => {
  const base = { kind: 'deadline' as const, account: 'acct', now: T0, lockHeld: false, canCarryOn: true };
  it('goes without a crash record: the failure is the crash', () => {
    expect(autoCarryOnVerdict({ ...base, mark: mark({ status: 'failed' }), crash: null })).toEqual({ go: true });
    // Even when the failed page was closed afterwards.
    expect(
      autoCarryOnVerdict({ ...base, mark: mark({ status: 'failed' }), crash: { phase: 'x', at: T0, pageClosed: true } })
    ).toEqual({ go: true });
  });
  it('but not for another kind, another account, or past the guard', () => {
    expect(autoCarryOnVerdict({ ...base, kind: 'smart', mark: mark({ status: 'failed' }), crash: null }).go).toBe(
      false
    );
    expect(autoCarryOnVerdict({ ...base, account: 'other', mark: mark({ status: 'failed' }), crash: null }).go).toBe(
      false
    );
    const guard = mark({ status: 'failed', autoCarries: [T0 - 3 * MIN, T0 - 2 * MIN, T0 - MIN] });
    expect(autoCarryOnVerdict({ ...base, mark: guard, crash: null })).toEqual({ go: false, why: 'guard' });
  });
  it('and never for a finished or stopped one', () => {
    for (const status of ['finished', 'stopped'] as const)
      expect(
        autoCarryOnVerdict({ ...base, mark: mark({ status }), crash: { phase: 'deadline search', at: T0 } }).go
      ).toBe(false);
  });
});

describe("another tab's run mark", () => {
  const live = mark({ beatAt: T0 - 10_000, startedAt: T0 - HOUR_MS });
  it('is left alone while its run holds the lock, or beats, in that tab', () => {
    expect(markHeldElsewhere({ mark: live, now: T0, ownStartedAt: 0, lock: 'other' })).toBe(true);
    expect(markHeldElsewhere({ mark: live, now: T0, ownStartedAt: 0, lock: 'unknown' })).toBe(true);
  });
  it('is taken over when this page has the lock (the other run is gone), or it is stale or ended', () => {
    expect(markHeldElsewhere({ mark: live, now: T0, ownStartedAt: 0, lock: 'ours' })).toBe(false);
    expect(
      markHeldElsewhere({ mark: { ...live, beatAt: T0 - 10 * MIN }, now: T0, ownStartedAt: 0, lock: 'unknown' })
    ).toBe(false);
    expect(markHeldElsewhere({ mark: { ...live, status: 'finished' }, now: T0, ownStartedAt: 0, lock: 'other' })).toBe(
      false
    );
    expect(markHeldElsewhere({ mark: null, now: T0, ownStartedAt: 0, lock: 'other' })).toBe(false);
  });
});
