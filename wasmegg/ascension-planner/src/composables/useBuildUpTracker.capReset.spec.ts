/**
 * QA review 7 Nov 2026, finding #11 (second bullet, LOW): the cap clock was not started again when the tracker left
 * "working it out". 7 minutes working, 10 s hidden (off virtue) or ready, working again: capped a minute later, as if
 * the new attempt were the old one. Leaving 'working' for anything but 'failed' now starts the clock again.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { setTrackerCapMs, setTrackerStallMs, useBuildUpTracker } from './useBuildUpTracker';
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
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  setTrackerStallMs(null);
  setTrackerCapMs(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mount() {
  const scope = effectScope();
  const onVirtue = ref<boolean | null>(true);
  const building = ref(true);
  const t = scope.run(() =>
    useBuildUpTracker({
      account: ref('acct-hash'),
      hasSave: ref(true),
      onVirtue,
      followed: ref(true),
      building,
      ascensionStart: ref(mt(11, 5, 9, 0)),
      saveSeconds: ref(SAVE),
      zone: ref(ZONE),
      hours: ref(HOURS),
      now: ref(SAVE + 240),
      fresh: ref(null),
      // A request being worked out, with no run going (as under request churn): only the cap bounds it.
      sim: ref({ status: 'working' as const }),
      simWorker: ref(null),
      searchRunning: ref(false),
    })
  )!;
  return { t, onVirtue, building, scope };
}
const after = async (ms: number) => {
  for (let left = ms; left > 0; left -= 1_000) {
    await vi.advanceTimersByTimeAsync(Math.min(1_000, left));
    await nextTick();
  }
};

describe('the cap clock when the tracker leaves "working it out"', () => {
  it('hidden for 10 s, then working again: a new 8 minutes', async () => {
    const { t, onVirtue, scope } = mount();
    await after(7 * 60_000);
    expect(t.state.value).toBe('working');
    onVirtue.value = false;
    await after(10_000);
    expect(t.state.value).toBe('hidden');
    onVirtue.value = true;
    await after(2 * 60_000);
    expect(t.state.value).toBe('working');
    // ...and still capped, 8 minutes from coming back.
    await after(6 * 60_000 + 2_000);
    expect(t.state.value).toBe('failed');
    scope.stop();
  });

  it('not building a moment (another state than failed), then working again: a new 8 minutes', async () => {
    const { t, building, scope } = mount();
    await after(7 * 60_000);
    building.value = false;
    await after(10_000);
    expect(t.state.value).toBe('notBuilding');
    building.value = true;
    await after(2 * 60_000);
    expect(t.state.value).toBe('working');
    scope.stop();
  });

  it('control: staying at it, the cap holds at 8 minutes', async () => {
    const { t, scope } = mount();
    await after(8 * 60_000 + 2_000);
    expect(t.state.value).toBe('failed');
    expect(t.failReason.value).toBe('it took over 8 minutes');
    scope.stop();
  });
});
