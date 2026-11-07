/**
 * spec-stuck3 (7 Nov 2026): Jordan's Safari tracker said "working it out…" for good on a fresh load of My runs, with no
 * search started. useCurrentSim says 'waiting' (no reason) while the page's searchBusy is set, and the tracker's stall
 * left that out ("a search ends it"). Now the tracker is told whether a search is REALLY running in this tab
 * (`searchRunning`: the store's isRunning || deadlineRunning): with none, that wait counts toward the 3-minute stall.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { setTrackerStallMs, useBuildUpTracker, TRACKER_STALL_REASON } from './useBuildUpTracker';
import { HOURS, mt, ZONE } from '@/lib/buildUpTracker.fixture';

const SAVE = mt(11, 6, 12, 35);

beforeEach(() => {
  vi.useFakeTimers();
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
});
afterEach(() => {
  setTrackerStallMs(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function mount(searchRunning: boolean) {
  const scope = effectScope();
  const running = ref(searchRunning);
  const t = scope.run(() =>
    useBuildUpTracker({
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
      fresh: ref(null),
      // useCurrentSim's wait while searchBusy is set: no reason.
      sim: ref({ status: 'waiting' as const }),
      simWorker: ref(null),
      searchRunning: running,
    })
  )!;
  return { t, running, scope };
}
const after = async (ms: number) => {
  await vi.advanceTimersByTimeAsync(ms);
  await nextTick();
};

describe("a wait for a search that isn't running", () => {
  it('no search running in this tab: failed with the stall reason by 3 minutes', async () => {
    const { t, scope } = mount(false);
    await after(60_000);
    expect(t.state.value).toBe('working');
    await after(2 * 60_000 + 1_000);
    expect(t.state.value).toBe('failed');
    expect(t.failReason.value).toBe(TRACKER_STALL_REASON);
    scope.stop();
  });

  it('a search running in this tab: it keeps waiting (the search ends it)', async () => {
    const { t, scope } = mount(true);
    await after(10 * 60_000);
    expect(t.state.value).toBe('working');
    scope.stop();
  });

  it('the search ends and the wait goes on: counted from then', async () => {
    const { t, running, scope } = mount(true);
    await after(5 * 60_000);
    running.value = false;
    await after(2 * 60_000);
    expect(t.state.value).toBe('working');
    await after(60_000 + 1_000);
    expect(t.state.value).toBe('failed');
    scope.stop();
  });
});
