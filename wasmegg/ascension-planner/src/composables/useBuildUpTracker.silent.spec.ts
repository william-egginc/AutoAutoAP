/**
 * spec-stuck2 (7 Nov 2026, QA t115): with every message to the chain worker swallowed, the Build-up tracker said
 * "working it out…" from 15 s and only the 6-minute run bound ended it; its 3-minute stall never showed. A run going
 * ('working') was exempt from the stall, so a worker that never answered counted only toward `runMs`. The stall now
 * keys on the WORKER: a run whose worker has said nothing for 3 minutes reads as failed (with Try again), while a run
 * whose worker answered (loaded and simulating, or sending progress) is left to `runMs`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, effectScope, nextTick, ref } from 'vue';
import { setSimRunner, setSimTiming, useCurrentSim, type SimRequest, type SimRunner } from './useCurrentSim';
import { buildUpWanted, setTrackerStallMs, TRACKER_STALL_REASON, useBuildUpTracker } from './useBuildUpTracker';
import { HOURS, mt, ZONE } from '@/lib/buildUpTracker.fixture';
import type { SearchInputs } from '@/search/types';

const SAVE = mt(11, 6, 12, 35);
const ROUTE = [221, 246, 280, 312];
let mem: Map<string, string>;
let runs: number;
let timers: ReturnType<typeof setInterval>[];

beforeEach(() => {
  vi.useFakeTimers();
  mem = new Map();
  timers = [];
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  runs = 0;
  setSimTiming(null);
});
afterEach(() => {
  for (const t of timers) clearInterval(t);
  setSimTiming(null);
  setSimRunner(null);
  setTrackerStallMs(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A chain worker that never answers: no word at all (its messages swallowed, or its script never loaded). */
const silent = (): SimRunner => ({ run: () => (runs++, new Promise(() => undefined)), terminate: () => undefined });
/** A worker that loads (one word, its start-up answer), then simulates for longer than the stall without a word. */
const loadedThenQuiet = (): SimRunner => ({
  run: (_i, _c, _o, heard) => {
    runs++;
    setTimeout(() => heard?.(), 2_000);
    return new Promise(() => undefined);
  },
  terminate: () => undefined,
});
/** A slow run that keeps sending progress every 30 s. */
const progressing = (): SimRunner => ({
  run: (_i, _c, _o, heard) => {
    runs++;
    timers.push(setInterval(() => heard?.(), 30_000));
    return new Promise(() => undefined);
  },
  terminate: () => undefined,
});

function mount() {
  const scope = effectScope();
  const out = scope.run(() => {
    const request = computed<SimRequest | null>(() =>
      buildUpWanted.value
        ? {
            key: `acct|${SAVE}|${ROUTE.join(',')}|setup`,
            account: 'acct',
            backupTime: SAVE,
            route: ROUTE,
            setup: 'setup',
            inputs: () =>
              ({ planStart: SAVE, currentTE: 198, currentFarmState: { numSilos: 4 } }) as unknown as SearchInputs,
          }
        : null
    );
    const { state, retry, worker } = useCurrentSim(request, ref(false), buildUpWanted);
    const fresh = computed(() =>
      state.value?.status === 'done' && state.value.key === request.value?.key ? (state.value.buildUp ?? null) : null
    );
    const sim = computed(() => {
      const st = state.value;
      if (!st || st.key !== request.value?.key) return null;
      if (st.status === 'done' && st.planFailed) return { status: 'failed' as const, reason: st.planFailed };
      return st.status === 'failed' ? { status: st.status, reason: st.reason } : { status: st.status };
    });
    const t = useBuildUpTracker({
      account: ref('acct-hash'),
      hasSave: ref(true),
      onVirtue: ref(true),
      followed: ref(true),
      building: ref(true),
      ascensionStart: ref(mt(11, 5, 9, 0)),
      saveSeconds: ref(SAVE),
      zone: ref(ZONE),
      hours: ref(HOURS),
      now: ref(SAVE + 240),
      fresh,
      sim,
      simWorker: worker,
    });
    return { t, retry };
  })!;
  return { ...out, scope };
}
const after = async (ms: number) => {
  await vi.advanceTimersByTimeAsync(ms);
  await nextTick();
};

describe('the Build-up tracker stalls on a silent worker, not on a slow one', () => {
  it('a worker that never says a word: failed with the stall reason by about 3 minutes, and Try again asks again', async () => {
    setSimRunner(silent);
    const { t, retry, scope } = mount();
    await after(15_000);
    expect(t.state.value).toBe('working');
    expect(runs).toBe(1);
    await after(2 * 60_000 + 30_000);
    expect(t.state.value).toBe('working');
    // 3 minutes of silence from the run's start (3 s after the request): well before the 6-minute run bound.
    await after(30_000);
    expect(t.state.value).toBe('failed');
    expect(t.failReason.value).toBe(TRACKER_STALL_REASON);
    t.retry();
    retry();
    await after(5_000);
    expect(t.state.value).toBe('working');
    expect(runs).toBe(2);
    scope.stop();
  });

  it('a worker that loaded and is simulating (no word since its start-up answer): never stalled, left to the run bound', async () => {
    setSimRunner(loadedThenQuiet);
    const { t, scope } = mount();
    await after(5 * 60_000);
    expect(t.state.value).toBe('working');
    expect(t.failReason.value).toBe('');
    await after(70_000);
    expect(t.state.value).toBe('failed');
    expect(t.failReason.value).toBe('it did not finish in 6 minutes');
    scope.stop();
  });

  it('a slow run that keeps sending progress: never stalled', async () => {
    setSimRunner(progressing);
    const { t, scope } = mount();
    await after(5 * 60_000 + 30_000);
    expect(t.state.value).toBe('working');
    expect(t.failReason.value).toBe('');
    scope.stop();
  });
});
