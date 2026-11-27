/**
 * spec-buildup-storage (6 Nov 2026, Jordan): Safari's normal window said "working it out" on the Build-up tracker for
 * good, even after a hard reload, while Chrome, a private window and his phone, on the same save, had the plan.
 * Stored state: the player had closed the fold in this ascension (`aap.buildup.fold.<acct>.<start>` = '0'), and the
 * kept plan (`aap.buildup.plan.<acct>`) was an older build's, so it was dropped on load (Release 7). The plan was then
 * asked for only while the fold was open: closed, nothing was ever asked, the closed fold's hint said "working it out",
 * and the 3 min stall bound (it counts only a wanted plan) never fired. Now a closed fold still gets its plan (its hint
 * shows the check-ins), and the player's close still holds. Placeholder account, stubbed storage, fake timers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { buildUpWanted, setTrackerStallMs, useBuildUpTracker } from './useBuildUpTracker';
import { fixturePlan, HOURS, mt, ZONE } from '@/lib/buildUpTracker.fixture';
import { ANCHOR_KEY_PREFIX, foldChoiceKey, readAnchoredPlan, writeAnchoredPlan } from '@/lib/buildUpTracker';
import { setResultCode } from '@/lib/resultCode';
import type { BuildUpPlan } from '@/search/buildUpActions';

let mem: Map<string, string>;
beforeEach(() => {
  vi.useFakeTimers();
  mem = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
});
afterEach(() => {
  setResultCode(null);
  setTrackerStallMs(null);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const ACCT = 'acct-hash';
const A1 = mt(10, 30, 8, 41);
function mount() {
  const r = {
    account: ref<string | null>(ACCT),
    hasSave: ref(true),
    onVirtue: ref<boolean | null>(true),
    followed: ref(true),
    building: ref(true),
    ascensionStart: ref<number | null>(A1),
    saveSeconds: ref(mt(10, 30, 12, 5)),
    zone: ref(ZONE),
    hours: ref(HOURS),
    now: ref(mt(10, 30, 12, 10)),
    fresh: ref<BuildUpPlan | null>(null),
    sim: ref<{ status: 'working' | 'waiting' | 'failed' | 'done'; reason?: string } | null>(null),
  };
  const scope = effectScope();
  const t = scope.run(() => useBuildUpTracker(r as never))!;
  return { r, t, scope };
}

describe('Build-up tracker: stored state from an older visit never leaves it working for good', () => {
  it('the fold closed in this ascension and an older build’s plan dropped: the plan is still asked for, and comes', async () => {
    // What the Safari profile held: this morning's close, and a plan an older build worked out.
    mem.set(foldChoiceKey(ACCT, A1), '0');
    setResultCode('older');
    writeAnchoredPlan(ACCT, { ascensionStart: A1, saveSeconds: mt(10, 30, 9, 3), plan: fixturePlan() });
    setResultCode('this');
    const { r, t, scope } = mount();
    expect(readAnchoredPlan(ACCT)).toBeNull();
    // The player's close holds.
    expect(t.open.value).toBe(false);
    // ...but the plan is asked for (the switch useNowPage hands to useCurrentSim).
    expect(t.wanted.value).toBe(true);
    expect(buildUpWanted.value).toBe(true);
    // Nothing comes for a while: the stall bound now counts it (failed, with Try again), never 'working' for good.
    setTrackerStallMs(1000);
    r.sim.value = { status: 'done' };
    await nextTick();
    vi.advanceTimersByTime(1500);
    await nextTick();
    expect(t.state.value).toBe('failed');
    // The simulation's plan comes: kept, ready, the closed fold's hint has the check-ins.
    r.fresh.value = fixturePlan();
    await nextTick();
    expect(t.state.value).toBe('ready');
    expect(t.summary.value).not.toBeNull();
    expect(t.wanted.value).toBe(false);
    expect(readAnchoredPlan(ACCT)).toMatchObject({ ascensionStart: A1, rc: 'this' });
    expect(t.open.value).toBe(false);
    scope.stop();
  });

  it('closed with no plan ever kept: still asked for (a closed fold says "working it out" only while it is)', () => {
    mem.set(foldChoiceKey(ACCT, A1), '0');
    const { t, scope } = mount();
    expect(mem.has(ANCHOR_KEY_PREFIX + ACCT)).toBe(false);
    expect(t.open.value).toBe(false);
    expect(t.state.value).toBe('working');
    expect(t.wanted.value).toBe(true);
    scope.stop();
  });
});
