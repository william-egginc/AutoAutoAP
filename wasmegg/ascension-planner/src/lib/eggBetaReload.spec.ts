/** The egg-beta timed reload (lib/eggBetaReload.ts): who reloads, when, and who never does. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EGG_BETA_HOST,
  EGG_BETA_RELOADED_KEY,
  countdownText,
  eggBetaDecision,
  pacificTime,
  startEggBetaReload,
  type EggBetaState,
} from './eggBetaReload';

const RELOAD_AT = '2026-11-01T22:00:00.000Z';
const LIVE_BUILT = '2026-11-01T19:00:00.000Z';
const OLD_TAB = '2026-11-01T18:00:00.000Z';
const live = { index: 'assets/index-NEW.js', eggBeta: { reloadAt: RELOAD_AT, builtAt: LIVE_BUILT } };
const ms = (iso: string) => Date.parse(iso);

describe('the deadline: Sun Nov 1 2026, 2:00 pm Pacific', () => {
  it('is 22:00Z (DST ended at 2:00 am that day, so PST, UTC-8)', () => {
    const at = new Date('2026-11-01T22:00:00Z');
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(at);
    expect(parts).toBe('Nov 1, 2026, 2:00 PM PST');
    // An hour earlier is still 1:00 pm PST, not 2:00 pm PDT: the fall-back was at 2:00 am.
    expect(pacificTime('2026-11-01T21:00:00Z')).toBe('1:00 pm');
    expect(pacificTime(RELOAD_AT)).toBe('2:00 pm');
  });
});

describe('countdownText (lib/duration compactDuration, seconds in the last minute)', () => {
  it.each([
    [72 * 60_000, '1h 12m'],
    [42_000, '42s'],
    [60_000, '1m'],
    [500, '1s'],
    [0, '0s'],
  ])('%i ms -> %s', (left, text) => expect(countdownText(left)).toBe(text));
});

describe('eggBetaDecision', () => {
  const base = { host: EGG_BETA_HOST, live, ownBuildTime: OLD_TAB, busy: false, reloadedFor: null as string | null };

  it('older tab on egg-beta before the deadline: countdown', () => {
    const d = eggBetaDecision({ ...base, nowMs: ms(RELOAD_AT) - 3600_000 });
    expect(d).toEqual({ kind: 'countdown', reloadAt: RELOAD_AT, msLeft: 3600_000 });
  });

  it('at the deadline: reload, or wait while a search runs', () => {
    expect(eggBetaDecision({ ...base, nowMs: ms(RELOAD_AT) }).kind).toBe('reload');
    expect(eggBetaDecision({ ...base, nowMs: ms(RELOAD_AT), busy: true }).kind).toBe('waiting');
  });

  it('another host: nothing, even with the field', () => {
    for (const host of ['egg.williamstest.fyi', 'localhost', 'egg-beta.williamstest.fyi.evil.com', ''])
      expect(eggBetaDecision({ ...base, host, nowMs: ms(RELOAD_AT) }).kind).toBe('none');
  });

  it('no field, or a broken one: nothing', () => {
    for (const l of [{ index: 'x' }, null, { eggBeta: {} }, { eggBeta: { reloadAt: 'x', builtAt: LIVE_BUILT } }, { eggBeta: { reloadAt: RELOAD_AT } }])
      expect(eggBetaDecision({ ...base, live: l, nowMs: ms(RELOAD_AT) }).kind).toBe('none');
  });

  it('a tab built at or after the live build never reloads (no loop), nor one with no build time', () => {
    for (const own of [LIVE_BUILT, '2026-11-01T20:00:00.000Z', ''])
      expect(eggBetaDecision({ ...base, ownBuildTime: own, nowMs: ms(RELOAD_AT) }).kind).toBe('none');
  });

  it('already reloaded for this reloadAt in this tab: nothing; for another reloadAt: reload', () => {
    expect(eggBetaDecision({ ...base, reloadedFor: RELOAD_AT, nowMs: ms(RELOAD_AT) }).kind).toBe('none');
    expect(eggBetaDecision({ ...base, reloadedFor: '2026-10-31T22:00:00.000Z', nowMs: ms(RELOAD_AT) }).kind).toBe('reload');
  });

  it('more than 6 h after the deadline: nothing', () => {
    expect(eggBetaDecision({ ...base, nowMs: ms(RELOAD_AT) + 6 * 3600_000 }).kind).toBe('reload');
    expect(eggBetaDecision({ ...base, nowMs: ms(RELOAD_AT) + 6 * 3600_000 + 1 }).kind).toBe('none');
  });
});

describe('startEggBetaReload (fake timers, fixed clock)', () => {
  let store: Map<string, string>;
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(ms(RELOAD_AT) - 90_000);
    store = new Map();
  });
  afterEach(() => vi.useRealTimers());

  function start(opts: { host?: string; busy?: () => boolean; liveBody?: unknown; ownBuildTime?: string } = {}) {
    const reload = vi.fn();
    const states: EggBetaState[] = [];
    const fetchLive = vi.fn(async () => (opts.liveBody === undefined ? live : opts.liveBody));
    const { stop } = startEggBetaReload({
      host: opts.host ?? EGG_BETA_HOST,
      ownBuildTime: opts.ownBuildTime ?? OLD_TAB,
      busy: opts.busy ?? (() => false),
      fetchLive,
      reload,
      storage,
      onState: s => states.push(s),
    });
    return { reload, states, stop, fetchLive, last: () => states.at(-1) };
  }

  it('counts down, then reloads once at the deadline and marks the tab', async () => {
    const t = start();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.last()).toMatchObject({ kind: 'countdown', msLeft: 90_000 });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.last()).toMatchObject({ kind: 'countdown', msLeft: 30_000 });
    expect(t.reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(t.reload).toHaveBeenCalledTimes(1);
    expect(store.get(EGG_BETA_RELOADED_KEY)).toBe(RELOAD_AT);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(t.reload).toHaveBeenCalledTimes(1);
    t.stop();
  });

  it('a search running at the deadline: waits (polling every 15 s), reloads when it ends', async () => {
    let busy = true;
    const t = start({ busy: () => busy });
    await vi.advanceTimersByTimeAsync(90_000);
    expect(t.reload).not.toHaveBeenCalled();
    expect(t.last()).toMatchObject({ kind: 'waiting' });
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(t.reload).not.toHaveBeenCalled();
    busy = false;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(t.reload).toHaveBeenCalledTimes(1);
    t.stop();
  });

  it('reloads at most once per reloadAt in a tab (the sessionStorage mark survives the reload)', async () => {
    store.set(EGG_BETA_RELOADED_KEY, RELOAD_AT);
    const t = start();
    await vi.advanceTimersByTimeAsync(3 * 60_000);
    expect(t.reload).not.toHaveBeenCalled();
    t.stop();
  });

  it('another host: never fetches, never reloads', async () => {
    const t = start({ host: 'egg.williamstest.fyi' });
    await vi.advanceTimersByTimeAsync(3 * 3600_000);
    expect(t.fetchLive).not.toHaveBeenCalled();
    expect(t.reload).not.toHaveBeenCalled();
    expect(t.states.every(s => s.kind === 'none')).toBe(true);
    t.stop();
  });

  it('no field, or a tab as new as the live build: nothing, never reloads', async () => {
    for (const o of [{ liveBody: { index: 'x' } }, { ownBuildTime: LIVE_BUILT }]) {
      const t = start(o);
      await vi.advanceTimersByTimeAsync(3 * 3600_000);
      expect(t.reload).not.toHaveBeenCalled();
      expect(t.states.every(s => s.kind === 'none')).toBe(true);
      t.stop();
    }
  });

  it('a version.json that later drops the field turns it off', async () => {
    let body: unknown = live;
    const reload = vi.fn();
    const states: EggBetaState[] = [];
    const { stop } = startEggBetaReload({
      host: EGG_BETA_HOST,
      ownBuildTime: OLD_TAB,
      busy: () => false,
      fetchLive: async () => body,
      reload,
      storage,
      onState: s => states.push(s),
    });
    vi.setSystemTime(ms(RELOAD_AT) - 3600_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(states.at(-1)?.kind).toBe('countdown');
    body = { index: 'x' };
    await vi.advanceTimersByTimeAsync(2 * 3600_000);
    expect(reload).not.toHaveBeenCalled();
    expect(states.at(-1)?.kind).toBe('none');
    stop();
  });

  it('storage that throws does not stop the reload', async () => {
    const reload = vi.fn();
    const { stop } = startEggBetaReload({
      host: EGG_BETA_HOST,
      ownBuildTime: OLD_TAB,
      busy: () => false,
      fetchLive: async () => live,
      reload,
      storage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
      onState: () => undefined,
    });
    await vi.advanceTimersByTimeAsync(90_000);
    expect(reload).toHaveBeenCalledTimes(1);
    stop();
  });
});
