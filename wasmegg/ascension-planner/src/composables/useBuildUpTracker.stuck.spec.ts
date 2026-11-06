/**
 * spec-buildup-stuck (6 Nov 2026): Safari's Build-up tracker said "working it out" from 10:05 am to 12:39 pm on a save
 * (198 TE, Custom route 221 246 280 312) that a headless run plans in about 2 s. The tracker and useCurrentSim wired as
 * My runs wires them (useNowPage `buildUpPlan` / `buildUpSim`), with a chain worker that never answers (died or never
 * loaded in a hidden tab), and with no simulation asked at all: either way the tracker must reach the failed state with
 * Try again within its bounds, and Try again must ask again.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, effectScope, nextTick, ref } from 'vue';
import { setSimRunner, setSimTiming, useCurrentSim, type SimRequest, type SimRunner } from './useCurrentSim';
import { buildUpWanted, setTrackerStallMs, useBuildUpTracker } from './useBuildUpTracker';
import { HOURS, mt, ZONE } from '@/lib/buildUpTracker.fixture';
import type { SearchInputs } from '@/search/types';

const SAVE = mt(11, 6, 12, 35);
const ROUTE = [221, 246, 280, 312];
let mem: Map<string, string>;
let runs: number;

beforeEach(() => {
  vi.useFakeTimers();
  mem = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  runs = 0;
  setSimTiming(null);
  // The worker that never answers.
  setSimRunner((): SimRunner => ({ run: () => (runs++, new Promise(() => undefined)), terminate: () => undefined }));
});
afterEach(() => {
  setSimTiming(null);
  setSimRunner(null);
  setTrackerStallMs(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mount(asked = true) {
  const scope = effectScope();
  const out = scope.run(() => {
    const request = computed<SimRequest | null>(() =>
      asked && buildUpWanted.value
        ? {
            key: `acct|${SAVE}|${ROUTE.join(',')}|setup`,
            account: 'acct',
            backupTime: SAVE,
            route: ROUTE,
            setup: 'setup',
            inputs: () => ({ planStart: SAVE, currentTE: 198, currentFarmState: { numSilos: 4 } }) as unknown as SearchInputs,
          }
        : null
    );
    const { state, retry } = useCurrentSim(request, ref(false), buildUpWanted);
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
    });
    return { t, retry };
  })!;
  return { ...out, scope };
}
const after = async (ms: number) => {
  await vi.advanceTimersByTimeAsync(ms);
  await nextTick();
};

describe('the Build-up tracker never works it out for good', () => {
  it('a chain worker that never answers: failed with why within 6 minutes, and Try again asks again', async () => {
    const { t, retry, scope } = mount();
    await after(5_000);
    expect(t.state.value).toBe('working');
    expect(runs).toBe(1);
    await after(6 * 60_000);
    expect(t.state.value).toBe('failed');
    expect(t.failReason.value).toMatch(/did not finish/);
    t.retry();
    retry();
    await after(5_000);
    expect(t.state.value).toBe('working');
    expect(runs).toBe(2);
    scope.stop();
  });

  it('the plan wanted and no simulation asked at all: failed within 3 minutes', async () => {
    const { t, scope } = mount(false);
    await after(60_000);
    expect(t.state.value).toBe('working');
    await after(3 * 60_000);
    expect(t.state.value).toBe('failed');
    expect(t.failReason.value).not.toBe('');
    t.retry();
    await nextTick();
    expect(t.state.value).toBe('working');
    scope.stop();
  });
});
