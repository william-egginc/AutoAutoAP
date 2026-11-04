/**
 * STOPPED → NEVER STUCK ON WORKING, the Build-up tracker's side (spec-buildstop, 30 Oct 2026):
 *   - a failure says so with a Try again button (44 px, a real <button>), "The plan was stopped before it finished."
 *     when the run was stopped; MyRunsView wires it to useNowPage `retryBuildUp` (useCurrentSim / useFollowEstimate
 *     `retry`, specced in their own stop specs);
 *   - the switch that asks useCurrentSim for the plan (`buildUpWanted`) is not turned off under a tracker that wants it
 *     by another one letting go after it (My runs mounted again).
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import BuildUpTracker from './BuildUpTracker.vue';
import { buildUpWanted, useBuildUpTracker } from '@/composables/useBuildUpTracker';
import { HOURS, mt, ZONE } from '@/lib/buildUpTracker.fixture';

const NOW = mt(10, 30, 12, 10);
const base = { open: true, result: null, ticks: new Set<string>(), summary: null, now: NOW, zone: ZONE, saveSeconds: mt(10, 30, 12, 5) };

describe('BuildUpTracker: failed, with Try again', () => {
  it('stopped: the stop said in plain words, and a 44 px Try again button', async () => {
    const html = await renderHtml(BuildUpTracker, { ...base, state: 'failed', failReason: 'Error: stopped', failStopped: true });
    expect(textOf(html)).toContain('The plan was stopped before it finished.');
    expect(textOf(html)).not.toContain('Error: stopped');
    const button = html.match(/<button[^>]*data-testid="buildup-retry"[^>]*>([\s\S]*?)<\/button>/);
    expect(button).not.toBeNull();
    expect(button![0]).toContain('type="button"');
    expect(button![0]).toContain('min-h-[44px]');
    expect(textOf(button![1])).toBe('Try again');
  });

  it('another failure: its reason, and the same Try again', async () => {
    const html = await renderHtml(BuildUpTracker, { ...base, state: 'failed', failReason: 'worker ran out of memory' });
    expect(textOf(html)).toContain('The build-up list could not be worked out (worker ran out of memory).');
    expect(html).toContain('data-testid="buildup-retry"');
  });

  it('working and ready show no Try again', async () => {
    expect(await renderHtml(BuildUpTracker, { ...base, state: 'working' })).not.toContain('buildup-retry');
  });

  it('My runs wires Try again to the page (useNowPage retryBuildUp) and says when it was a stop', () => {
    const src = fs.readFileSync(path.join(__dirname, '../MyRunsView.vue'), 'utf8');
    expect(src).toContain('@retry="page.retryBuildUp"');
    expect(src).toContain(':fail-stopped="tracker.failStopped.value"');
  });
});

describe('useBuildUpTracker: the plan switch', () => {
  let mem: Map<string, string>;
  beforeEach(() => {
    mem = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  const inputs = () => ({
    account: ref<string | null>('acct-hash'),
    hasSave: ref(true),
    onVirtue: ref<boolean | null>(true),
    followed: ref(true),
    building: ref(true),
    ascensionStart: ref<number | null>(mt(10, 30, 8, 41)),
    saveSeconds: ref(mt(10, 30, 12, 5)),
    zone: ref(ZONE),
    hours: ref(HOURS),
    now: ref(NOW),
    fresh: ref(null),
    sim: ref<{ status: 'working' | 'waiting' | 'failed' | 'done'; reason?: string } | null>({ status: 'working' }),
    saveFarm: ref(null),
  });

  it('an old tracker letting go after the new one wants the plan leaves the switch on', () => {
    const old = effectScope();
    old.run(() => useBuildUpTracker(inputs() as never));
    const now = effectScope();
    now.run(() => useBuildUpTracker(inputs() as never));
    expect(buildUpWanted.value).toBe(true);
    old.stop();
    expect(buildUpWanted.value).toBe(true);
    now.stop();
    expect(buildUpWanted.value).toBe(false);
  });

  it('a stop is told apart from another failure', () => {
    const i = inputs();
    const scope = effectScope();
    const t = scope.run(() => useBuildUpTracker(i as never))!;
    i.sim.value = { status: 'failed', reason: 'Error: stopped' };
    expect(t.state.value).toBe('failed');
    expect(t.failStopped.value).toBe(true);
    i.sim.value = { status: 'failed', reason: 'worker ran out of memory' };
    expect(t.failStopped.value).toBe(false);
    scope.stop();
  });
});
