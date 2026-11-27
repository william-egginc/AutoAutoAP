/**
 * spec-stuck3 (7 Nov 2026): an overall cap on "working it out". useCurrentSim starts a run only once its request has
 * been unchanged for 3 s; a request whose key keeps changing restarts that wait every time, so no run starts, the state
 * stays 'working' with no worker, and neither the stall nor the run bound is ever reached. The tracker's cap is measured
 * from when it FIRST said "working it out" for this account and save, so churn can't reset it: failed by 8 minutes, with
 * why and Try again.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, effectScope, nextTick, ref } from 'vue';
import { setSimRunner, setSimTiming, useCurrentSim, type SimRequest, type SimRunner } from './useCurrentSim';
import { buildUpWanted, setTrackerCapMs, setTrackerStallMs, useBuildUpTracker } from './useBuildUpTracker';
import { HOURS, mt, ZONE } from '@/lib/buildUpTracker.fixture';
import type { SearchInputs } from '@/search/types';

const SAVE = mt(11, 6, 12, 35);
const ROUTE = [221, 246, 280, 312];
let runs: number;

beforeEach(() => {
  vi.useFakeTimers();
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  runs = 0;
  setSimTiming(null);
  setSimRunner((): SimRunner => ({ run: () => (runs++, new Promise(() => undefined)), terminate: () => undefined }));
});
afterEach(() => {
  setSimTiming(null);
  setSimRunner(null);
  setTrackerStallMs(null);
  setTrackerCapMs(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mount() {
  const scope = effectScope();
  /** Bumped every 2 s: the setup part of the key changes (as a re-read setup would). */
  const churn = ref(0);
  const out = scope.run(() => {
    const request = computed<SimRequest | null>(() =>
      buildUpWanted.value
        ? {
            key: `acct|${SAVE}|${ROUTE.join(',')}|setup-${churn.value}`,
            account: 'acct',
            backupTime: SAVE,
            route: ROUTE,
            setup: `setup-${churn.value}`,
            inputs: () => ({ planStart: SAVE, currentTE: 198, currentFarmState: { numSilos: 4 } }) as unknown as SearchInputs,
          }
        : null
    );
    const { state, retry, worker } = useCurrentSim(request, ref(false), buildUpWanted);
    const fresh = computed(() => (state.value?.status === 'done' && state.value.key === request.value?.key ? (state.value.buildUp ?? null) : null));
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
      simWorker: computed(() => (request.value ? worker.value : null)),
      searchRunning: ref(false),
    });
    return { t, retry };
  })!;
  const timer = setInterval(() => churn.value++, 2_000);
  return { ...out, scope, stop: () => clearInterval(timer) };
}
const after = async (ms: number) => {
  for (let left = ms; left > 0; left -= 1_000) {
    await vi.advanceTimersByTimeAsync(Math.min(1_000, left));
    await nextTick();
  }
};

describe('the Build-up tracker under request churn', () => {
  it('a key that changes every 2 s never starts a run, and still reaches failed by the 8-minute cap', async () => {
    const { t, scope, stop } = mount();
    await after(7 * 60_000);
    expect(runs).toBe(0);
    expect(t.state.value).toBe('working');
    await after(60_000 + 2_000);
    expect(t.state.value).toBe('failed');
    expect(t.failReason.value).toBe('it took over 8 minutes');
    // Try again starts the clock again.
    t.retry();
    await nextTick();
    expect(t.state.value).toBe('working');
    // ...and the cap holds again: the same churn, 8 minutes on, fails again rather than working it out for good.
    await after(8 * 60_000 + 2_000);
    expect(t.state.value).toBe('failed');
    stop();
    scope.stop();
  });
});
