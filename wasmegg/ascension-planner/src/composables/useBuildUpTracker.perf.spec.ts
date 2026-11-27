/**
 * BUILD-UP PERF (spec-buildperf, 30 Oct 2026: Jordan's tab sat on "working it out…" with the renderer frozen). The
 * tracker's composable on a clock tick: the list is not worked out again inside the day, the kept plan is not read
 * or parsed again, and the plan is never deeply reactive; a plan of this save that comes in while the ascension's key
 * moves is kept, never left "working". The simulation's side (one request per save and route) is in
 * useCurrentSim.buildUp.spec.ts. Fixed clock, stubbed storage, placeholder plan.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, isReactive, isRef, nextTick, ref, type Ref } from 'vue';
import { fixturePlan, HOURS, mt, ZONE } from '@/lib/buildUpTracker.fixture';
import type { BuildUpPlan } from '@/search/buildUpActions';
import type { SaveFarm } from '@/lib/buildUpBought';

const calls = { tracker: 0, read: 0, bought: 0 };
vi.mock('@/lib/buildUpTracker', async orig => {
  const m = await orig<typeof import('@/lib/buildUpTracker')>();
  return {
    ...m,
    buildUpTracker: (...a: Parameters<typeof m.buildUpTracker>) => (calls.tracker++, m.buildUpTracker(...a)),
    readAnchoredPlan: (...a: Parameters<typeof m.readAnchoredPlan>) => (calls.read++, m.readAnchoredPlan(...a)),
  };
});
vi.mock('@/lib/buildUpBought', async orig => {
  const m = await orig<typeof import('@/lib/buildUpBought')>();
  return { ...m, boughtFromSave: (...a: Parameters<typeof m.boughtFromSave>) => (calls.bought++, m.boughtFromSave(...a)) };
});
const { useBuildUpTracker } = await import('./useBuildUpTracker');

let mem: Map<string, string>;
let parses: number;
beforeEach(() => {
  mem = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
  calls.tracker = calls.read = calls.bought = 0;
  parses = 0;
  const parse = JSON.parse;
  vi.spyOn(JSON, 'parse').mockImplementation((t: string, r?: Parameters<typeof JSON.parse>[1]) => {
    if (typeof t === 'string' && t.length > 2000) parses++;
    return parse(t, r);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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
    hours: ref({ ...HOURS }),
    now: ref(mt(10, 30, 12, 10)),
    fresh: ref<BuildUpPlan | null>(null),
    sim: ref<{ status: 'working' | 'waiting' | 'failed' | 'done'; reason?: string } | null>({ status: 'working' }),
    saveFarm: ref<SaveFarm | null>(null),
    ...over,
  };
  const scope = effectScope();
  const t = scope.run(() => useBuildUpTracker(r as never))!;
  return { r, t, scope };
}
/** Everything the fold reads, as a render would. */
const touch = (t: ReturnType<typeof setup>['t']) => [t.state.value, t.result.value, t.ticks.value, t.summary.value, t.bought.value, t.offer.value, t.siloWarnings.value];

describe('useBuildUpTracker on a clock tick', () => {
  it('a tick inside the day: the list, the ticks and the kept plan are not worked out or read again', async () => {
    const { r, t, scope } = setup();
    r.fresh.value = fixturePlan();
    await nextTick();
    touch(t);
    expect(t.state.value).toBe('ready');
    const before = { ...calls, parses };
    expect(before.tracker).toBe(1);
    for (let m = 1; m <= 30; m++) {
      r.now.value += 60;
      touch(t);
    }
    // The same hours handed again (a new object, equal): nothing either.
    r.hours.value = { ...HOURS };
    touch(t);
    expect({ ...calls, parses }).toEqual(before);
    // The next day: the list once more (today's day opens).
    r.now.value = mt(10, 31, 9, 0);
    touch(t);
    expect(calls.tracker).toBe(before.tracker + 1);
    expect(calls.read).toBe(before.read);
    scope.stop();
  });

  it('the kept plan is read and parsed once per account, never deeply reactive', async () => {
    const first = setup();
    first.r.fresh.value = fixturePlan();
    await nextTick();
    first.scope.stop();
    calls.read = 0;
    parses = 0;
    const { r, t, scope } = setup();
    for (let m = 0; m < 10; m++) {
      r.now.value += 60;
      touch(t);
    }
    expect(t.state.value).toBe('ready');
    expect(calls.read).toBe(1);
    expect(parses).toBe(1);
    const p = t.plan.value!;
    expect(isReactive(p)).toBe(false);
    expect(isReactive(p.plan)).toBe(false);
    expect(isReactive(p.plan.actions)).toBe(false);
    expect(isRef(p.plan.actions[0])).toBe(false);
    expect(isReactive(t.result.value!.lines)).toBe(false);
    scope.stop();
  });

  it("this save's plan comes in, then the ascension's key moves: kept under the new key, ready, nothing asked again", async () => {
    const { r, t, scope } = setup();
    r.fresh.value = fixturePlan();
    r.sim.value = { status: 'done' };
    await nextTick();
    expect(t.state.value).toBe('ready');
    r.ascensionStart.value = A1 + 3600;
    await nextTick();
    expect(t.state.value).toBe('ready');
    expect(t.wanted.value).toBe(false);
    expect(t.plan.value?.ascensionStart).toBe(A1 + 3600);
    scope.stop();
  });
});
