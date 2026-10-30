/**
 * composables/useBuildUpTracker.ts: the fold opens by itself once per ascension while building and the player's close
 * then holds; the plan is asked for only while open and building and none is kept; the first plan of an ascension is
 * kept (a newer save's is not); ticks are kept per account and ascension. Fixed clock, stubbed storage, placeholder plan.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref, type Ref } from 'vue';
import { buildUpWanted, useBuildUpTracker } from './useBuildUpTracker';
import { fixturePlan, HOURS, mt, ZONE } from '@/lib/buildUpTracker.fixture';
import { ANCHOR_KEY_PREFIX, foldChoiceKey, ticksKey, unticksKey } from '@/lib/buildUpTracker';
import { farmOfStart, type SaveFarm } from '@/lib/buildUpBought';
import type { BuildUpPlan } from '@/search/buildUpActions';
import { BUILDUP_PLAN_KEY } from '@/lib/followSim';

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
    saveFarm: ref<SaveFarm | null>(null),
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
    mem.set(BUILDUP_PLAN_KEY, '{"key":"k","plan":{}}');
    r.fresh.value = fixturePlan();
    await nextTick();
    expect(t.state.value).toBe('ready');
    // One copy: the simulation's raw record goes once the tracker keeps its own.
    expect(mem.has(BUILDUP_PLAN_KEY)).toBe(false);
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

// ------------------------------------------------------------------ Phase 2
const START = fixturePlan().start!;
const farmWith = (levels: Record<string, number>, over: Partial<SaveFarm> = {}): SaveFarm => ({
  ...farmOfStart(START),
  researchLevels: levels,
  ...over,
});
const FIRST_LINE = { comfortable_nests: 50, excitable_chickens: 25, internal_hatchery3: 15, internal_hatchery4: 5, bigger_eggs: 1 };

describe('useBuildUpTracker Phase 2: ticks from the save, the player\'s override', () => {
  async function ready(save: SaveFarm | null) {
    const s = setup({ saveFarm: ref(farmOfStart(START)) });
    s.r.fresh.value = fixturePlan();
    await nextTick();
    (s.r as unknown as { saveFarm: { value: SaveFarm | null } }).saveFarm.value = save;
    await nextTick();
    return s;
  }
  it('the anchor keeps its save farm; a save holding the first buys ticks their line, "from your save"', async () => {
    const { t, scope } = await ready(farmWith(FIRST_LINE));
    expect(t.plan.value?.anchorFarm).toEqual(farmOfStart(START));
    const first = t.result.value!.lines.find(l => l.kind === 'research')!;
    expect(t.ticks.value.has(first.key)).toBe(true);
    expect(t.tickSource.value.get(first.key)).toBe('save');
    // The prestige too (the save fits the plan).
    const p = t.result.value!.lines.find(l => l.kind === 'prestige')!;
    expect(t.ticks.value.has(p.key)).toBe(true);
    // The prestige's check-in and the first buys'.
    expect(t.summary.value!.done).toBe(2);
    scope.stop();
  });
  it('a newer save only adds ticks', async () => {
    const { r, t, scope } = await ready(farmWith({ comfortable_nests: 50 }));
    const before = new Set(t.ticks.value);
    (r as unknown as { saveFarm: { value: SaveFarm } }).saveFarm.value = farmWith(FIRST_LINE);
    r.saveSeconds.value = mt(10, 30, 12, 30);
    await nextTick();
    for (const k of before) expect(t.ticks.value.has(k)).toBe(true);
    expect(t.ticks.value.size).toBeGreaterThan(before.size);
    scope.stop();
  });
  it('the override beats the save both ways; clearing goes back to the save', async () => {
    const { t, scope } = await ready(farmWith(FIRST_LINE));
    const bought = t.result.value!.lines.find(l => l.kind === 'research')!.key;
    const toBuy = t.result.value!.lines.filter(l => l.kind === 'research')[1].key;
    // Untick a line the save says is bought.
    t.toggleTick(bought, false);
    expect(t.ticks.value.has(bought)).toBe(false);
    expect(t.tickSource.value.get(bought)).toBe('you');
    expect(JSON.parse(mem.get(unticksKey('acct-hash', A1))!)).toEqual([bought]);
    // Tick a line the save says is still to buy.
    t.toggleTick(toBuy, true);
    expect(t.ticks.value.has(toBuy)).toBe(true);
    expect(t.tickSource.value.get(toBuy)).toBe('you');
    expect(JSON.parse(mem.get(ticksKey('acct-hash', A1))!)).toEqual([toBuy]);
    // Back to the save's.
    t.clearTick(bought);
    t.clearTick(toBuy);
    expect(t.ticks.value.has(bought)).toBe(true);
    expect(t.tickSource.value.get(bought)).toBe('save');
    expect(t.ticks.value.has(toBuy)).toBe(false);
    expect(mem.has(unticksKey('acct-hash', A1))).toBe(false);
    // A checkbox set to what the save says is no override.
    t.toggleTick(bought, false);
    t.toggleTick(bought, true);
    expect(t.tickSource.value.get(bought)).toBe('save');
    scope.stop();
  });
});

describe('useBuildUpTracker Phase 2: Re-plan from this save', () => {
  /** The anchor at 8:41 am (the prestige) on the start farm; then a newer save. */
  async function anchoredThen(save: SaveFarm, saveSeconds: number) {
    const s = setup({ saveFarm: ref(farmOfStart(START)), saveSeconds: ref(mt(10, 30, 8, 41)) });
    s.r.fresh.value = fixturePlan();
    await nextTick();
    s.r.fresh.value = null;
    (s.r as unknown as { saveFarm: { value: SaveFarm } }).saveFarm.value = save;
    s.r.saveSeconds.value = saveSeconds;
    s.r.sim.value = { status: 'done' };
    await nextTick();
    return s;
  }
  it.each<[string, Record<string, number>, number, boolean]>([
    ['on plan and on time: hidden', FIRST_LINE, mt(10, 30, 8, 50), false],
    ['bought research the plan never buys: shown', { ...FIRST_LINE, never_planned: 3 }, mt(10, 30, 8, 50), true],
    ['over 1 h behind the plan: shown', FIRST_LINE, mt(10, 30, 10, 0), true],
    ['under 1 h behind: hidden', FIRST_LINE, mt(10, 30, 9, 40), false],
  ])('%s', async (_n, levels, at, show) => {
    const { t, scope } = await anchoredThen(farmWith(levels), at);
    expect(t.offer.value!.show).toBe(show);
    expect(t.replanShown.value).toBe(show);
    scope.stop();
  });

  it('pressing it: asks for this save\'s plan, keeps the old meanwhile, then re-anchors with the matching ticks', async () => {
    const later = mt(10, 30, 14, 0);
    const { r, t, scope } = await anchoredThen(farmWith({ ...FIRST_LINE, never_planned: 3 }), later);
    expect(t.offer.value!.show).toBe(true);
    expect(t.replanShown.value).toBe(true);
    // Ticks by hand: one on a line the new plan still has (9:35 am), one on a line it won't have (8:47 am).
    const lines = t.result.value!.lines;
    const keep = lines.find(l => l.text === 'buy Atomic Purification 24')!.key;
    const orphan = lines.find(l => l.text.startsWith('buy Grav Plating 18'))!.key;
    t.toggleTick(keep, true);
    t.toggleTick(orphan, true);
    expect(t.hasOverrides.value).toBe(true);
    const oldPlan = t.plan.value;
    t.replan();
    expect(t.replanning.value).toBe(true);
    expect(t.wanted.value).toBe(true);
    await nextTick();
    expect(buildUpWanted.value).toBe(true);
    expect(t.plan.value).toBe(oldPlan);
    expect(t.state.value).toBe('ready');
    // This save's plan comes: from 9:35 am on.
    const p = fixturePlan();
    r.fresh.value = { ...p, actions: p.actions.filter(a => a.t >= mt(10, 30, 9, 35)) };
    await nextTick();
    expect(t.replanning.value).toBe(false);
    expect(t.plan.value).not.toBe(oldPlan);
    expect(t.plan.value!.saveSeconds).toBe(later);
    expect(JSON.parse(mem.get(ANCHOR_KEY_PREFIX + 'acct-hash')!).saveSeconds).toBe(later);
    expect(t.ticks.value.has(keep)).toBe(true);
    expect(JSON.parse(mem.get(ticksKey('acct-hash', A1))!)).toEqual([keep]);
    expect(t.wanted.value).toBe(false);
    scope.stop();
  });

  it('a failed re-plan keeps the old plan and says why', async () => {
    const { r, t, scope } = await anchoredThen(farmWith({ ...FIRST_LINE, never_planned: 3 }), mt(10, 30, 14, 0));
    const oldPlan = t.plan.value;
    const kept = mem.get(ANCHOR_KEY_PREFIX + 'acct-hash');
    t.replan();
    r.sim.value = { status: 'failed', reason: 'the worker ran out of memory' };
    await nextTick();
    expect(t.replanning.value).toBe(false);
    expect(t.replanError.value).toBe('the worker ran out of memory');
    expect(t.plan.value).toBe(oldPlan);
    expect(mem.get(ANCHOR_KEY_PREFIX + 'acct-hash')).toBe(kept);
    expect(t.replanShown.value).toBe(true);
    // A newer save may try again.
    r.saveSeconds.value = mt(10, 30, 15, 0);
    await nextTick();
    expect(t.replanError.value).toBe('');
    scope.stop();
  });
});
