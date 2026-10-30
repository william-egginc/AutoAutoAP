/**
 * composables/useBuildUpTracker.ts: the fold opens by itself once per ascension while building and the player's close
 * then holds; the plan is asked for only while open and building and none is kept; the first plan of an ascension is
 * kept (a newer save's is not); ticks are kept per account and ascension. Fixed clock, stubbed storage, placeholder plan.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref, type Ref } from 'vue';
import { buildUpWanted, useBuildUpTracker } from './useBuildUpTracker';
import { fixturePlan, HOURS, mt, ZONE } from '@/lib/buildUpTracker.fixture';
import { ANCHOR_KEY_PREFIX, foldChoiceKey, ticksKey } from '@/lib/buildUpTracker';
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
    ...over,
  };
  const scope = effectScope();
  const t = scope.run(() => useBuildUpTracker(r as never))!;
  return { r, t, scope };
}

describe('useBuildUpTracker', () => {
  it('building: open by itself and asks for the plan; working until it comes', () => {
    const { t, scope } = setup();
    expect(t.open.value).toBe(true);
    expect(t.wanted.value).toBe(true);
    expect(buildUpWanted.value).toBe(true);
    expect(t.state.value).toBe('working');
    scope.stop();
  });

  it('not building: closed, nothing asked', () => {
    const { t, scope } = setup({ building: ref(false) });
    expect(t.open.value).toBe(false);
    expect(t.wanted.value).toBe(false);
    expect(t.state.value).toBe('notBuilding');
    scope.stop();
  });

  it('auto-opens once per ascension, then the player\'s close holds; a new ascension opens again', async () => {
    const { r, t, scope } = setup();
    expect(t.open.value).toBe(true);
    t.playerToggle(false);
    expect(mem.get(foldChoiceKey('acct-hash', A1))).toBe('0');
    expect(t.open.value).toBe(false);
    expect(t.wanted.value).toBe(false);
    // Still building, next visit: stays closed.
    const again = setup();
    expect(again.t.open.value).toBe(false);
    again.scope.stop();
    // The next ascension: open by itself again.
    r.ascensionStart.value = mt(12, 23, 7, 0);
    await nextTick();
    expect(t.open.value).toBe(true);
    scope.stop();
  });

  it('keeps the first plan of the ascension, not a later save\'s; ready from storage on the next visit', async () => {
    const { r, t, scope } = setup();
    r.fresh.value = fixturePlan();
    await nextTick();
    expect(t.state.value).toBe('ready');
    expect(t.wanted.value).toBe(false);
    expect(t.plan.value?.saveSeconds).toBe(mt(10, 30, 12, 5));
    const kept = mem.get(ANCHOR_KEY_PREFIX + 'acct-hash')!;
    expect(kept.length).toBeLessThan(40_000);
    expect(kept).not.toContain('wait_for_te');
    // A newer save's plan does not replace it.
    r.saveSeconds.value = mt(10, 30, 14, 0);
    r.fresh.value = { ...fixturePlan(), actions: fixturePlan().actions.slice(0, 3) };
    await nextTick();
    expect(t.plan.value?.saveSeconds).toBe(mt(10, 30, 12, 5));
    expect(t.result.value!.checkIns.length).toBeGreaterThan(10);
    scope.stop();
    const next = setup();
    expect(next.t.state.value).toBe('ready');
    expect(next.t.wanted.value).toBe(false);
    next.scope.stop();
  });

  it('ticks are kept per account and ascension and come back', async () => {
    const { r, t, scope } = setup();
    r.fresh.value = fixturePlan();
    await nextTick();
    const k = t.result.value!.checkIns[0].keys[0];
    t.toggleTick(k, true);
    expect(JSON.parse(mem.get(ticksKey('acct-hash', A1))!)).toEqual([k]);
    expect(t.summary.value!.done).toBe(1);
    scope.stop();
    const back = setup();
    expect(back.t.ticks.value.has(k)).toBe(true);
    back.t.toggleTick(k, false);
    expect(back.t.ticks.value.has(k)).toBe(false);
    back.scope.stop();
  });

  it('the other states: no save, no route, failed, not on virtue', () => {
    for (const [over, want] of [
      [{ hasSave: ref(false) }, 'noSave'],
      [{ followed: ref(false) }, 'noRoute'],
      [{ sim: ref({ status: 'failed', reason: 'out of memory' }) }, 'failed'],
      [{ onVirtue: ref(false) }, 'hidden'],
    ] as const) {
      const { t, scope } = setup(over as never);
      expect(t.state.value).toBe(want);
      scope.stop();
    }
  });

  it('never throws without storage', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    const { t, r, scope } = setup();
    r.fresh.value = fixturePlan();
    expect(() => t.toggleTick('x', true)).not.toThrow();
    expect(() => t.playerToggle(false)).not.toThrow();
    scope.stop();
  });
});
