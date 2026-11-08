/**
 * QA review 7 Nov 2026, finding #3 (MED): the tracker said failed while a result was being sent, then Try again killed
 * a healthy run.
 *
 *   - My runs handed the tracker `searchRunning` without `resultSending`, but useCurrentSim waits on useNowPage's
 *     `searchBusy`, which has it: during a send (up to 10 minutes) the sim is 'waiting' with no reason, so the stall
 *     fired and the 8-minute cap clock ran. The two must agree.
 *   - Once fired, the cap stayed (`armCap` returns early while `capSince` is set): "it took over 8 minutes" showed over a
 *     run that was working with its worker heard.
 *   - useCurrentSim's own automatic retry after its 6-minute bound was capped about 57 s into the retried run.
 *   - Try again rescheduled the request, which terminates the worker of a healthy run.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, effectScope, nextTick, ref } from 'vue';
import { setSimRunner, setSimTiming, useCurrentSim, type SimRequest, type SimRunner } from './useCurrentSim';
import { setTrackerCapMs, setTrackerStallMs, useBuildUpTracker } from './useBuildUpTracker';
import { HOURS, mt, ZONE } from '@/lib/buildUpTracker.fixture';
import type { SearchInputs } from '@/search/types';

const SAVE = mt(11, 6, 12, 35);
type Sim = { status: 'working' | 'waiting' | 'failed' | 'done'; reason?: string } | null;

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
  setSimTiming(null);
  setSimRunner(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mount(sim0: Sim, searchRunning = false) {
  const scope = effectScope();
  const sim = ref<Sim>(sim0);
  const worker = ref<{ since: number; heard: boolean } | null>(null);
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
      sim,
      simWorker: worker,
      searchRunning: running,
    })
  )!;
  return { t, sim, worker, running, scope };
}
const after = async (ms: number) => {
  for (let left = ms; left > 0; left -= 1_000) {
    await vi.advanceTimersByTimeAsync(Math.min(1_000, left));
    await nextTick();
  }
};

describe('the tracker during a result send and a healthy run', () => {
  it('a cap that fired clears once the sim is working with its worker heard', async () => {
    setTrackerCapMs(8 * 60_000);
    const { t, sim, worker, scope } = mount({ status: 'waiting' });
    await after(8 * 60_000 + 1_000);
    expect(t.state.value).toBe('failed');
    sim.value = { status: 'working' };
    worker.value = { since: Date.now(), heard: true };
    await nextTick();
    await nextTick();
    expect(t.state.value).not.toBe('failed');
    expect(t.failReason.value).toBe('');
    // The run goes on (bounded by useCurrentSim's own 6 minutes): still not failed.
    await after(5 * 60_000);
    expect(t.state.value).toBe('working');
    scope.stop();
  });

  it('a result being sent (searchRunning with resultSending): neither the stall nor the cap counts', async () => {
    const { t, sim, running, scope } = mount({ status: 'waiting' }, true);
    await after(10 * 60_000);
    expect(t.state.value).toBe('working');
    // The send ends: the sim is asked and works; the cap starts from then, so it has its full 8 minutes.
    running.value = false;
    sim.value = { status: 'working' };
    await after(7 * 60_000);
    expect(t.state.value).toBe('working');
    scope.stop();
  });

  it("useCurrentSim's automatic retry after its 6-minute bound gets its full time", async () => {
    const { t, sim, worker, scope } = mount({ status: 'working' });
    // The first run: started after the 3 s wait, its worker answered.
    await after(3_000);
    worker.value = { since: Date.now(), heard: true };
    await after(6 * 60_000);
    // useCurrentSim's bound: failed, tried once more after a minute.
    worker.value = null;
    sim.value = { status: 'failed', reason: 'it did not finish in 6 minutes' };
    await after(60_000);
    sim.value = { status: 'working' };
    await after(3_000);
    worker.value = { since: Date.now(), heard: false };
    await after(2_000);
    worker.value = { since: Date.now(), heard: true };
    // Past 8 minutes from the first "working it out", well inside the retried run.
    await after(3 * 60_000);
    expect(t.state.value).toBe('working');
    scope.stop();
  });
});

describe('Try again and a healthy run', () => {
  it('never terminates a run that is going with its worker heard', async () => {
    setSimTiming(null);
    let runs = 0;
    let terminated = 0;
    setSimRunner(
      (): SimRunner => ({
        run: (_i, _c, _o, heard) => {
          runs++;
          heard?.();
          return new Promise(() => undefined);
        },
        terminate: () => void terminated++,
      })
    );
    const scope = effectScope();
    const request = ref<SimRequest | null>({
      key: `acct|${SAVE}|221|setup`,
      account: 'acct',
      backupTime: SAVE,
      route: [221],
      setup: 'setup',
      inputs: () => ({ planStart: SAVE, currentTE: 198, currentFarmState: { numSilos: 4 } }) as unknown as SearchInputs,
    });
    const sim = scope.run(() => useCurrentSim(request, ref(false), true))!;
    await after(4_000);
    expect(runs).toBe(1);
    expect(sim.worker.value?.heard).toBe(true);
    const before = terminated;
    sim.retry();
    await after(5_000);
    expect(terminated).toBe(before);
    expect(runs).toBe(1);
    expect(sim.state.value?.status).toBe('working');
    scope.stop();
  });
});

describe('My runs and useCurrentSim agree on what a search is', () => {
  const view = readFileSync(new URL('../components/MyRunsView.vue', import.meta.url), 'utf8');
  const page = readFileSync(new URL('./useNowPage.ts', import.meta.url), 'utf8');
  it("the tracker's searchRunning is the page's searchBusy, which has resultSending", () => {
    expect(view).toMatch(/searchRunning: page\.searchBusy,/);
    expect(page).toMatch(/const searchBusy = computed\(\(\) => store\.isRunning \|\| store\.deadlineRunning \|\| store\.resultSending\);/);
    const at = page.indexOf('export function useNowPage(');
    const body = page.slice(at, page.indexOf('\n}\n', at));
    expect(body.slice(body.lastIndexOf('\n  return {'))).toMatch(/\n    searchBusy,/);
  });
});
