/**
 * The current ascension simulated in the background (composables/useCurrentSim.ts) with a stand-in chain worker: once
 * per key, the inputs built only in the run, never while a search runs, the newest wins, a kept record is used at
 * once, a failure keeps the table's estimate.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { setSimRunner, setSimTiming, useCurrentSim, type SimRequest, type SimRunner } from './useCurrentSim';
import { SIM_RECORD_KEY, readSimRecords, recordSim } from '@/lib/followSim';
import type { LegSummary, SearchInputs } from '@/search/types';

const T0 = 1_800_000_000;
let mem: Map<string, string>;
let runs: { chain: number[]; inputs: SearchInputs; resolve: (l: LegSummary | null) => void; reject: (e: Error) => void }[];
let terminated: number;

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
  setSimTiming({ delayMs: 0 });
  setSimRunner(
    (): SimRunner => ({
      run: (inputs, chain) => new Promise((resolve, reject) => runs.push({ inputs, chain, resolve, reject })),
      terminate: () => void terminated++,
    })
  );
});
afterEach(() => {
  vi.useRealTimers();
  setSimTiming(null);
  setSimRunner(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

let built = 0;
function req(route = [226, 277, 490], backupTime = T0): SimRequest {
  return {
    key: `acct|${backupTime}|${route.join(',')}|setup`,
    account: 'acct',
    backupTime,
    route,
    setup: 'setup',
    inputs: () => {
      built++;
      return { planStart: backupTime } as unknown as SearchInputs;
    },
  };
}
const legOf = (end: number) =>
  ({ key: 'continue', endTE: 226, durationSeconds: end - T0, maxELR: 1, endTime: end, startTime: T0, tier13Unlocked: false, buildPhaseEndTime: T0, shifts: [{ at: T0 + 60, egg: 'humility' }] }) as LegSummary;
const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
  }
};

function mount(r: SimRequest | null, busy = false) {
  built = 0;
  const request = ref<SimRequest | null>(r);
  const isBusy = ref(busy);
  const scope = effectScope();
  const { state, slow } = scope.run(() => useCurrentSim(request, isBusy))!;
  return { request, isBusy, scope, state, slow };
}

describe('useCurrentSim', () => {
  it('simulates the first stop once, with inputs built in the run; keeps the record; the next mount reads it', async () => {
    const m = mount(req());
    expect(m.state.value).toMatchObject({ status: 'working' });
    await flush();
    expect(runs).toHaveLength(1);
    expect(runs[0].chain).toEqual([226]);
    expect(built).toBe(1);
    runs[0].resolve(legOf(T0 + 3600));
    await flush();
    expect(m.state.value).toMatchObject({ status: 'done', leg: { endTime: T0 + 3600, shifts: [{ at: T0 + 60, egg: 'humility' }] } });
    expect(terminated).toBeGreaterThan(0);
    expect(readSimRecords()).toHaveLength(1);
    expect(readSimRecords()[0].ms).toBeGreaterThanOrEqual(0);
    m.scope.stop();
    const again = mount(req());
    await flush();
    expect(again.state.value).toMatchObject({ status: 'done' });
    expect(runs).toHaveLength(1);
    expect(built).toBe(0);
    again.scope.stop();
  });

  it('never while a search runs: waits, then runs when it ends; a search that starts lets the run go', async () => {
    const m = mount(req(), true);
    await flush();
    expect(m.state.value).toMatchObject({ status: 'waiting' });
    expect(runs).toHaveLength(0);
    expect(built).toBe(0);
    m.isBusy.value = false;
    await flush();
    expect(runs).toHaveLength(1);
    const before = terminated;
    m.isBusy.value = true;
    await flush();
    expect(m.state.value).toMatchObject({ status: 'waiting' });
    expect(terminated).toBe(before + 1);
    // Its late answer is dropped.
    runs[0].resolve(legOf(T0 + 3600));
    await flush();
    expect(m.state.value).toMatchObject({ status: 'waiting' });
    expect(mem.has(SIM_RECORD_KEY)).toBe(false);
    m.isBusy.value = false;
    await flush();
    expect(runs).toHaveLength(2);
    m.scope.stop();
  });

  it('the newest wins: another route lets the running one go and its answer is dropped', async () => {
    const m = mount(req([226, 490]));
    await flush();
    m.request.value = req([230, 490]);
    await flush();
    expect(runs.map(r => r.chain)).toEqual([[226], [230]]);
    runs[0].resolve(legOf(T0 + 100));
    await flush();
    expect(m.state.value).toMatchObject({ key: req([230, 490]).key, status: 'working' });
    runs[1].resolve(legOf(T0 + 200));
    await flush();
    expect(m.state.value).toMatchObject({ key: req([230, 490]).key, status: 'done', leg: { endTime: T0 + 200 } });
    m.scope.stop();
  });

  it('a failure says failed, warns once, and is not tried again for the key; no request: nothing', async () => {
    const m = mount(req());
    await flush();
    runs[0].reject(new Error('worker died'));
    await flush();
    expect(m.state.value).toMatchObject({ status: 'failed' });
    expect(console.warn).toHaveBeenCalledTimes(1);
    m.scope.stop();
    const again = mount(req());
    await flush();
    expect(again.state.value).toMatchObject({ status: 'failed' });
    expect(runs).toHaveLength(1);
    again.request.value = null;
    await flush();
    expect(again.state.value).toBeNull();
    again.scope.stop();
  });

  it('a leg that could not be simulated, or no worker at all, is a failure', async () => {
    const m = mount(req());
    await flush();
    runs[0].resolve(null);
    await flush();
    expect(m.state.value).toMatchObject({ status: 'failed' });
    m.scope.stop();
    setSimRunner(() => null);
    const none = mount(req([300, 490]));
    await flush();
    expect(none.state.value).toMatchObject({ status: 'failed' });
    none.scope.stop();
  });

  it('a kept record of another save is not used', async () => {
    recordSim({ account: 'acct', backupTime: T0 - 1, route: [226, 277, 490], setup: 'setup', at: 1, leg: { key: 'continue', startTime: T0, endTime: T0 + 1, endTE: 226, buildPhaseEndTime: null, shifts: [] } });
    const m = mount(req());
    await flush();
    expect(runs).toHaveLength(1);
    m.scope.stop();
  });

  it('leaving the page lets the worker go', async () => {
    const m = mount(req());
    await flush();
    const before = terminated;
    m.scope.stop();
    expect(terminated).toBe(before + 1);
  });

  it('starts only once the page has been settled 3 s; a new route in the meantime starts the wait again', async () => {
    setSimTiming(null);
    vi.useFakeTimers();
    const m = mount(req([226, 490]));
    expect(m.state.value).toMatchObject({ status: 'working' });
    await vi.advanceTimersByTimeAsync(2000);
    expect(runs).toHaveLength(0);
    expect(built).toBe(0);
    m.request.value = req([230, 490]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(runs).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1100);
    expect(runs.map(r => r.chain)).toEqual([[230]]);
    expect(built).toBe(1);
    m.scope.stop();
  });

  it('says it is slow after 20 s of running, and no longer once it is in', async () => {
    setSimTiming(null);
    vi.useFakeTimers();
    const m = mount(req());
    const r = m;
    await vi.advanceTimersByTimeAsync(3000);
    expect(runs).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(19_000);
    expect(r.slow.value).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(r.slow.value).toBe(true);
    runs[0].resolve(legOf(T0 + 3600));
    await vi.advanceTimersByTimeAsync(10);
    expect(m.state.value).toMatchObject({ status: 'done' });
    expect(r.slow.value).toBe(false);
    m.scope.stop();
  });

  it('leaving My runs while it waits or runs stops it; the next visit starts again, or reads the record once it finished', async () => {
    setSimTiming(null);
    vi.useFakeTimers();
    const a = mount(req());
    a.scope.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(runs).toHaveLength(0);
    const b = mount(req());
    await vi.advanceTimersByTimeAsync(3000);
    expect(runs).toHaveLength(1);
    const before = terminated;
    b.scope.stop();
    expect(terminated).toBe(before + 1);
    runs[0].resolve(legOf(T0 + 3600));
    await vi.advanceTimersByTimeAsync(10);
    expect(readSimRecords()).toHaveLength(0);
    const c = mount(req());
    await vi.advanceTimersByTimeAsync(3000);
    expect(runs).toHaveLength(2);
    runs[1].resolve(legOf(T0 + 3600));
    await vi.advanceTimersByTimeAsync(10);
    c.scope.stop();
    const d = mount(req());
    expect(d.state.value).toMatchObject({ status: 'done' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(runs).toHaveLength(2);
    d.scope.stop();
  });
});
