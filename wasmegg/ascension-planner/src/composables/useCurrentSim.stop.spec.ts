/**
 * STOPPED → NEVER STUCK ON WORKING (spec-buildstop, 30 Oct 2026; Jordan's main account, My runs: the Build-up tracker
 * said "working it out…" for over a minute, with "pricing the followed route … failed: stopped" the only console line).
 *
 * What it was: the followed route's estimate being stopped and asked again moves Right now's plan (useNowPage
 * `cardPlan`), so the Building badge and the tracker's fold, and with them `wantBuildUp`, flip while the ascension is
 * being simulated. A run started without the plan wanted kept that answer for the whole run: it came back with the
 * leg and no build-up list, the request was the same key and already 'done', and nothing asked again: 'working' for
 * good, no failure said. Also a run stopped from outside (its worker torn down) while only the plan was wanted was
 * said planFailed for the page load (one request per key), never tried again.
 *
 * Fixed clocks (fake timers), a stand-in chain worker whose runs are settled by hand. No wall-clock waits.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { setSimRunner, setSimTiming, useCurrentSim, type SimRequest, type SimRunner } from './useCurrentSim';
import type { LegSummary, SearchInputs } from '@/search/types';
import type { BuildUpList } from '@/search/buildUpActions';

const T0 = 1_800_000_000;
let mem: Map<string, string>;
let runs: { args: unknown[]; resolve: (l: LegSummary | null) => void; reject: (e: Error) => void }[];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0 * 1000);
  mem = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  runs = [];
  setSimTiming({ delayMs: 3000, retryMs: 60_000 });
  setSimRunner(
    (): SimRunner => ({
      run: (...args: unknown[]) => new Promise((resolve, reject) => runs.push({ args, resolve, reject })),
      terminate: () => undefined,
    })
  );
});
afterEach(() => {
  setSimTiming(null);
  setSimRunner(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function req(): SimRequest {
  return {
    key: `acct|${T0}|218,247|setup`,
    account: 'acct',
    backupTime: T0,
    route: [218, 247],
    setup: 'setup',
    inputs: () => ({ planStart: T0, currentTE: 197, currentFarmState: { numSilos: 2 } }) as unknown as SearchInputs,
  };
}
const LIST: BuildUpList = {
  actions: [
    { t: T0 + 60, kind: 'research', label: 'Comfortable Nests', id: 'comfortable_nests', fromLevel: 0, level: 1 },
    { t: T0 + 120, kind: 'shift', label: 'H1', id: 'humility', detail: 'resilience' },
  ],
  start: { egg: 'curiosity', researchLevels: {}, habIds: [0, null, null, null], vehicles: [], siloCount: 1 },
};
const legOf = (withList: boolean) =>
  ({
    key: '1-sale',
    endTE: 218,
    durationSeconds: 3600,
    maxELR: 1,
    endTime: T0 + 3600,
    startTime: T0,
    tier13Unlocked: false,
    buildPhaseEndTime: T0 + 600,
    shifts: [{ at: T0 + 120, egg: 'humility' }],
    ...(withList ? { buildUp: LIST } : {}),
  }) as LegSummary;
/** Settles promises and Vue's queue without moving the clock. */
const settle = async () => {
  for (let i = 0; i < 6; i++) {
    await nextTick();
    await Promise.resolve();
  }
};
function mount(wantStart: boolean) {
  const request = ref<SimRequest | null>(req());
  const want = ref(wantStart);
  const busy = ref(false);
  const scope = effectScope();
  const out = scope.run(() => useCurrentSim(request, busy, want))!;
  return { scope, request, want, busy, ...out };
}
const keepsPurchases = (i: number) => (runs[i].args[2] as { keepPurchases?: boolean } | undefined)?.keepPurchases === true;

describe('useCurrentSim: the plan wanted while a run without it is going', () => {
  it('the run ends with the leg, then the plan is asked at once (the leg on screen), and it ends ready: never working for good', async () => {
    const m = mount(false);
    await settle();
    await vi.advanceTimersByTimeAsync(3000);
    expect(runs).toHaveLength(1);
    expect(keepsPurchases(0)).toBe(false);
    // The fold opens / the Building badge comes while the run goes (the estimate stopped and asked again).
    m.want.value = true;
    await settle();
    runs[0].resolve(legOf(false));
    await settle();
    // The leg is in and the plan is being asked for: not a 'done' that nothing will move.
    expect(m.state.value?.status).toBe('done');
    await vi.advanceTimersByTimeAsync(3000);
    expect(runs).toHaveLength(2);
    expect(keepsPurchases(1)).toBe(true);
    runs[1].resolve(legOf(true));
    await settle();
    const st = m.state.value;
    expect(st?.status === 'done' && st.buildUp?.actions.length).toBe(2);
    m.scope.stop();
  });

  it('wanted again only once: the plan run ends without a list → planFailed (said), not asked a third time', async () => {
    const m = mount(false);
    await settle();
    await vi.advanceTimersByTimeAsync(3000);
    m.want.value = true;
    await settle();
    runs[0].resolve(legOf(false));
    await settle();
    await vi.advanceTimersByTimeAsync(3000);
    runs[1].resolve(legOf(false));
    await settle();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(runs).toHaveLength(2);
    const st = m.state.value;
    expect(st?.status === 'done' && st.planFailed).toBeTruthy();
    m.scope.stop();
  });
});

describe('useCurrentSim: a run stopped from outside (its worker torn down)', () => {
  for (const msg of ['stopped', 'chain search pool was terminated']) {
    it(`only the plan wanted, "${msg}": tried once more at once, ends ready`, async () => {
      const m = mount(false);
      await settle();
      await vi.advanceTimersByTimeAsync(3000);
      runs[0].resolve(legOf(false));
      await settle();
      m.want.value = true;
      await settle();
      await vi.advanceTimersByTimeAsync(3000);
      expect(runs).toHaveLength(2);
      runs[1].reject(new Error(msg));
      await settle();
      // Not planFailed for the page load: asked again.
      const mid = m.state.value;
      expect(mid?.status === 'done' && mid.planFailed).toBeFalsy();
      await vi.advanceTimersByTimeAsync(3000);
      expect(runs).toHaveLength(3);
      runs[2].resolve(legOf(true));
      await settle();
      const st = m.state.value;
      expect(st?.status === 'done' && !!st.buildUp).toBe(true);
      m.scope.stop();
    });
  }

  it('a second stop does not loop: one automatic retry per key, then said failed (stopped)', async () => {
    const m = mount(true);
    await settle();
    await vi.advanceTimersByTimeAsync(3000);
    runs[0].reject(new Error('stopped'));
    await settle();
    await vi.advanceTimersByTimeAsync(3000);
    expect(runs).toHaveLength(2);
    runs[1].reject(new Error('stopped'));
    await settle();
    // The old one-retry-after-a-minute rule may try once more; never more than that.
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    for (const r of runs.slice(2)) r.reject(new Error('stopped'));
    await settle();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(runs.length).toBeLessThanOrEqual(3);
    expect(m.state.value?.status).toBe('failed');
    expect(m.state.value?.status === 'failed' && m.state.value.reason).toMatch(/stopped/);
    m.scope.stop();
  });

  it('retry(): a failed key is asked again and ends ready', async () => {
    const m = mount(true);
    await settle();
    await vi.advanceTimersByTimeAsync(3000);
    runs[0].reject(new Error('stopped'));
    await settle();
    await vi.advanceTimersByTimeAsync(3000);
    runs[1].reject(new Error('stopped'));
    await settle();
    await vi.advanceTimersByTimeAsync(63_000);
    for (const r of runs.slice(2)) r.reject(new Error('stopped'));
    await settle();
    expect(m.state.value?.status).toBe('failed');
    const before = runs.length;
    m.retry();
    await settle();
    expect(m.state.value?.status).toBe('working');
    await vi.advanceTimersByTimeAsync(3000);
    expect(runs).toHaveLength(before + 1);
    runs[before].resolve(legOf(true));
    await settle();
    const st = m.state.value;
    expect(st?.status === 'done' && !!st.buildUp).toBe(true);
    m.scope.stop();
  });

  it('retry() after planFailed (the one-request-per-key rule) asks again: the rule never swallows a retry', async () => {
    const m = mount(true);
    await settle();
    await vi.advanceTimersByTimeAsync(3000);
    runs[0].resolve(legOf(false));
    await settle();
    const st = m.state.value;
    expect(st?.status === 'done' && st.planFailed).toBeTruthy();
    m.retry();
    await settle();
    await vi.advanceTimersByTimeAsync(3000);
    expect(runs).toHaveLength(2);
    runs[1].resolve(legOf(true));
    await settle();
    const after = m.state.value;
    expect(after?.status === 'done' && !!after.buildUp && !after.planFailed).toBe(true);
    m.scope.stop();
  });

  it('the page letting its own run go (a newer key) is not a failure of the old key', async () => {
    const m = mount(true);
    await settle();
    await vi.advanceTimersByTimeAsync(3000);
    m.request.value = { ...req(), key: 'other' };
    await settle();
    runs[0].reject(new Error('stopped'));
    await settle();
    m.request.value = req();
    await settle();
    expect(m.state.value?.status).toBe('working');
    await vi.advanceTimersByTimeAsync(3000);
    const last = runs[runs.length - 1];
    last.resolve(legOf(true));
    await settle();
    const st = m.state.value;
    expect(st?.key).toBe(req().key);
    expect(st?.status === 'done' && !!st.buildUp).toBe(true);
    m.scope.stop();
  });
});
