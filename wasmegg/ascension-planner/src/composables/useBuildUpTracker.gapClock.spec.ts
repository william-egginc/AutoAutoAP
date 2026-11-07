/**
 * spec-webkit-tracker (7 Nov 2026): Jordan's Build-up tracker said "working it out…" for 15 minutes and more, with no
 * Try again, in Safari on two machines (save 198 TE with one Curiosity TE not claimed yet, Egg Day route 224 253 280
 * 311, Next step "No timeline for your route yet", "Not priced on this save yet"). No simulation was asked: the stores
 * held the save with its claimed TE (197) while the save reads 198, so useNowPage's `storeReady` stayed false and the
 * tracker's state was the gap's 'waiting' ("the planner's inputs are not this save's yet"). That wait is bounded
 * (spec-buildup-stuck: failed after 3 minutes, with Try again), but the bound started afresh on every NEW state object,
 * and useNowPage makes a new gap object whenever the followed route's state is worked out again, which its minute
 * clock does every minute (`setupNow.today`). So the 3 minutes never ran out. An equal state must not restart it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, effectScope, nextTick, ref } from 'vue';
import { setTrackerStallMs, useBuildUpTracker } from './useBuildUpTracker';
import { buildUpSimGap } from './useNowPage';
import { HOURS, mt, ZONE } from '@/lib/buildUpTracker.fixture';

const SAVE = mt(11, 7, 9, 58);

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
  vi.restoreAllMocks();
});

/** The tracker wired as My runs wires it while no simulation is asked (useNowPage `buildUpSim` = `simGap`), with the
 *  gap worked out again on every tick of `clock` (useNowPage's minute clock, through `followState`). */
function mount() {
  const clock = ref(0);
  const scope = effectScope();
  const t = scope.run(() => {
    const sim = computed(() => {
      void clock.value; // the followed route's state, worked out again each minute
      return buildUpSimGap({
        asked: false,
        planWanted: true,
        hasSave: true,
        onVirtue: true,
        followed: true,
        account: true,
        storeReady: false,
      });
    });
    return useBuildUpTracker({
      account: ref('acct-hash'),
      hasSave: ref(true),
      onVirtue: ref(true),
      followed: ref(true),
      building: ref(true),
      ascensionStart: ref(mt(11, 5, 9, 0)),
      saveSeconds: ref(SAVE),
      zone: ref(ZONE),
      hours: ref(HOURS),
      now: ref(SAVE + 600),
      fresh: ref(null),
      sim,
    });
  })!;
  return { t, clock, scope };
}

describe('the stall bound counts an unchanged wait, whatever object says it', () => {
  it("the inputs never this save's, the gap worked out again every minute: failed within 3 minutes, with Try again", async () => {
    const { t, clock, scope } = mount();
    await nextTick();
    expect(t.state.value).toBe('working');
    // Fifteen minutes of the minute clock ticking.
    for (let m = 0; m < 15 && t.state.value === 'working'; m++) {
      await vi.advanceTimersByTimeAsync(60_000);
      clock.value++;
      await nextTick();
    }
    expect(t.state.value).toBe('failed');
    expect(t.failReason.value).not.toBe('');
    // Try again with the same wait going on (nothing new asked): working, then failed again within the bound.
    t.retry();
    await nextTick();
    expect(t.state.value).toBe('working');
    await vi.advanceTimersByTimeAsync(3 * 60_000 + 1);
    await nextTick();
    expect(t.state.value).toBe('failed');
    scope.stop();
  });

  it('an equal state at 2 minutes does not start the bound afresh: failed 3 minutes after the wait began', async () => {
    const { t, clock, scope } = mount();
    await nextTick();
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    clock.value++;
    await nextTick();
    expect(t.state.value).toBe('working');
    await vi.advanceTimersByTimeAsync(60_000 + 1);
    await nextTick();
    expect(t.state.value).toBe('failed');
    scope.stop();
  });
});
