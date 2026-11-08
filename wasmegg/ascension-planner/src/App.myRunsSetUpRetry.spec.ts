/**
 * QA review 7 Nov 2026, finding #5 (MED): when useNowPage `storeReady` never becomes true (the stores are not set up
 * from this save), no simulation is asked, so the Build-up tracker's Try again did nothing: `retryBuildUp` has no
 * request to ask again, and App `loadSaveForMyRuns` sets an account and save time up only once. The tracker looped
 * (failed, Try again, 3 more minutes, failed) and said "nothing came back for it" rather than the real wait.
 *
 * Wanted: the reason shown is the wait's own (useNowPage `buildUpSimGap`: "the planner's inputs are not this save's
 * yet"), and Try again asks App to set the save up again, once per press (never in a loop).
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { setTrackerCapMs, setTrackerStallMs, useBuildUpTracker, TRACKER_STALL_REASON } from '@/composables/useBuildUpTracker';
import { buildUpSimGap } from '@/composables/useNowPage';
import { HOURS, mt, ZONE } from '@/lib/buildUpTracker.fixture';

const app = readFileSync(new URL('./App.vue', import.meta.url), 'utf8');
const view = readFileSync(new URL('./components/MyRunsView.vue', import.meta.url), 'utf8');
const page = readFileSync(new URL('./composables/useNowPage.ts', import.meta.url), 'utf8');

function body(src: string, head: string): string {
  const start = src.indexOf(head);
  expect(start, head).toBeGreaterThan(0);
  return src.slice(start, src.indexOf('\n}\n', start));
}

const SAVE = mt(11, 6, 12, 35);
/** What useNowPage hands the tracker while the stores are not this save's yet. */
const NOT_READY = buildUpSimGap({ asked: false, planWanted: true, hasSave: true, onVirtue: true, followed: true, account: true, storeReady: false })!;

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
      sim: ref(NOT_READY),
      simWorker: ref(null),
      searchRunning: ref(false),
    })
  )!;
  return { t, scope };
}
const after = async (ms: number) => {
  await vi.advanceTimersByTimeAsync(ms);
  await nextTick();
};

describe("the tracker when the planner's inputs never become this save's", () => {
  it('failed by the stall: the reason is the wait\'s own, not "nothing came back for it"', async () => {
    expect(NOT_READY).toEqual({ status: 'waiting', reason: "the planner's inputs are not this save's yet" });
    const { t, scope } = mount();
    await after(3 * 60_000 + 1_000);
    expect(t.state.value).toBe('failed');
    expect(t.failReason.value).not.toBe(TRACKER_STALL_REASON);
    expect(t.failReason.value).toBe(NOT_READY.reason);
    scope.stop();
  });

  it("failed by the cap: the wait's own reason too", async () => {
    setTrackerStallMs(60 * 60_000);
    const { t, scope } = mount();
    await after(8 * 60_000 + 1_000);
    expect(t.state.value).toBe('failed');
    expect(t.failReason.value).toBe(NOT_READY.reason);
    scope.stop();
  });
});

describe('Try again asks App to set the save up again', () => {
  it('My runs: Try again, with the stores not this save\'s, asks for the set-up', () => {
    // useNowPage hands its storeReady out.
    const p = body(page, 'export function useNowPage(');
    expect(p.slice(p.lastIndexOf('\n  return {'))).toMatch(/\n    storeReady,/);
    // The tracker's retry goes through one handler, which emits 'setup' when the stores are not this save's.
    expect(view).toMatch(/@retry="retryTracker"/);
    const retry = body(view, 'function retryTracker(): void {');
    expect(retry).toContain('tracker.retry();');
    expect(retry).toContain('page.retryBuildUp();');
    expect(retry).toMatch(/if \(!page\.storeReady\.value\) emit\('setup'\);/);
    expect(view).toMatch(/\n  setup: \[\];/);
  });

  it("App: the event forgets this save's set-up and asks once, from the press only", () => {
    expect(app).toMatch(/@setup="setUpAgainForMyRuns"/);
    const again = body(app, 'function setUpAgainForMyRuns(): void {');
    expect(again).toContain("myRunsLoadFor = '';");
    expect(again).toContain('loadSaveForMyRuns();');
    // Never from a watcher: only the press calls it (the once-per-save guard stays in loadSaveForMyRuns).
    expect(app.match(/setUpAgainForMyRuns/g)?.length).toBe(2);
    const load = body(app, 'function loadSaveForMyRuns(): void {');
    expect(load).toContain('if (myRunsLoadFor === forSave');
    expect(load).toContain('myRunsLoadFor = forSave;');
  });
});
