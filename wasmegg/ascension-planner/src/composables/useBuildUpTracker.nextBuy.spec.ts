/**
 * M13: Next step names the research buy first even with the tracker's fold shut (Jordan, 12 Nov 2026). The plan is asked
 * for and kept while building, open or closed (spec-buildup-storage), and the list is worked out from it either way, so
 * `nextBuyBefore` has its lines with the fold closed, from a plan kept on an earlier visit too: no extra work on load.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref, type Ref } from 'vue';
import { useBuildUpTracker } from './useBuildUpTracker';
import { fixturePlan, HOURS, mt, ZONE } from '@/lib/buildUpTracker.fixture';
import { nextBuyBefore } from '@/lib/nextAction';
import type { BuildUpPlan } from '@/search/buildUpActions';

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

const A1 = mt(10, 30, 8, 41);
function setup(over: Partial<Record<string, Ref<unknown>>> = {}) {
  const r = {
    account: ref<string | null>('acct-hash'),
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
    sim: ref<{ status: 'working' | 'waiting' | 'failed' | 'done'; reason?: string } | null>({ status: 'working' }),
    saveFarm: ref(null),
    ...over,
  };
  const scope = effectScope();
  const t = scope.run(() => useBuildUpTracker(r as never))!;
  return { r, t, scope };
}

describe('the research buy for Next step, with the fold shut', () => {
  it('fold closed by the player, plan in: ready, the lines are there, the first buy is named', async () => {
    const { r, t, scope } = setup();
    t.playerToggle(false);
    r.fresh.value = fixturePlan();
    await nextTick();
    expect(t.open.value).toBe(false);
    expect(t.state.value).toBe('ready');
    const lines = t.result.value!.lines;
    const buy = lines.find(l => l.kind === 'research' && l.tickable);
    expect(buy).toBeTruthy();
    const next = { kind: 'shift', egg: 'humility', at: buy!.at + 3600 } as const;
    expect(nextBuyBefore(next, t.state.value === 'ready' ? lines : null, t.ticks.value)).toEqual({ at: buy!.at });
    scope.stop();
  });
  it('a plan kept on an earlier visit is read on load, the fold shut: nothing is worked out again', async () => {
    const first = setup();
    first.t.playerToggle(false);
    first.r.fresh.value = fixturePlan();
    await nextTick();
    first.scope.stop();
    const again = setup();
    await nextTick();
    expect(again.t.open.value).toBe(false);
    expect(again.t.state.value).toBe('ready');
    expect(again.t.wanted.value).toBe(false);
    expect(again.t.result.value!.lines.some(l => l.kind === 'research')).toBe(true);
    again.scope.stop();
  });
});
