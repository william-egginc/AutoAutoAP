/**
 * THE TRACKER ANCHORS ON THE PLAN'S OWN SAVE, AND WAITS FOR A SAVE STILL COMING IN (spec-anchornewer, 6 Nov 2026;
 * failing first). Jordan's Chrome at 2:51 pm: "0 of 105 check-ins done", nothing ticked, no Re-plan, although the 2:50 pm
 * save held the 1:59 pm and 2:02 pm lines' buys.
 *
 *   - The plan is anchored on the save it was SIMULATED FROM (BuildUpPlan `from`, set by useCurrentSim), never on the
 *     page's save at the moment it is kept: a newer save loaded in between made the anchor newer than the plan's
 *     start (lib/buildUpBought.ts `saveFit` then read 'beforePrestige' and nothing ticked), and its time made the
 *     save on screen "not newer than the plan's", so Re-plan never showed.
 *   - Only a plan that starts afresh takes the anchor farm (a build-up plan is the same ascension: its start is enough).
 *   - A newer save that does not hold the plan's start at all ('older') is offered Re-plan.
 *   - While a save is still coming in (`saveLoading`), the card says so ('checking') instead of a settled "0 done".
 *
 * Placeholder plan and farms (no player), fixed clock, stubbed storage.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { useBuildUpTracker } from './useBuildUpTracker';
import { fixturePlan, HOURS, mt, ZONE } from '@/lib/buildUpTracker.fixture';
import type { SaveFarm } from '@/lib/buildUpBought';
import type { BuildUpAction, BuildUpPlan, BuildUpStart } from '@/search/buildUpActions';

beforeEach(() => {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

const farm = (ec: number, nl: number, nnr: number): SaveFarm => ({
  egg: 'curiosity',
  researchLevels: { enlightened_chickens: ec, neural_linking: nl, neural_net_refine: nnr },
  habIds: [18, 18, 18, 18],
  vehicles: [{ vehicleId: 11, trainLength: 8 }],
  siloCount: 9,
  artifactSet: null,
});
const START: BuildUpStart = {
  egg: 'curiosity',
  researchLevels: { enlightened_chickens: 93, neural_linking: 29, neural_net_refine: 13 },
  habIds: [18, 18, 18, 18],
  vehicles: [{ vehicleId: 11, trainLength: 8 }],
  siloCount: 9,
};
const buy = (t: number, id: string, label: string, from: number, to: number): BuildUpAction => ({ t, kind: 'research', label, id, fromLevel: from, level: to, cost: 1e41 });
const ASC = mt(11, 4, 9, 0);
const PLAN_SAVE = mt(11, 6, 13, 51);
/** A build-up plan (the same ascension) simulated from the 1:51 pm save. */
const buildUpPlan = (): BuildUpPlan => ({
  startedAt: PLAN_SAVE,
  accountKey: 'acct-hash',
  variantKey: 'buildup',
  start: START,
  actions: [
    buy(mt(11, 6, 13, 59), 'enlightened_chickens', 'Enlightened Chickens', 93, 101),
    buy(mt(11, 6, 13, 59), 'neural_net_refine', 'Neural Net Refinement', 13, 14),
    buy(mt(11, 6, 13, 59), 'neural_linking', 'Neural Linking', 29, 30),
    buy(mt(11, 6, 14, 2), 'enlightened_chickens', 'Enlightened Chickens', 101, 102),
    buy(mt(11, 6, 14, 27), 'enlightened_chickens', 'Enlightened Chickens', 102, 103),
  ],
  siloSeconds: 97200,
  endTime: mt(11, 8, 9, 0),
  from: { backupTime: PLAN_SAVE, farm: farm(93, 29, 13) },
});

/** The plan comes in while the page already holds a NEWER save (`keptOn`), then `next` loads. */
async function keptAfterNewerSave(o: {
  plan: BuildUpPlan;
  keptOn: { seconds: number; farm: SaveFarm };
  next: { seconds: number; farm: SaveFarm };
}) {
  const r = {
    account: ref<string | null>('acct-hash'),
    hasSave: ref(true),
    onVirtue: ref<boolean | null>(true),
    followed: ref(true),
    building: ref(true),
    ascensionStart: ref<number | null>(ASC),
    saveSeconds: ref(o.keptOn.seconds),
    zone: ref(ZONE),
    hours: ref(HOURS),
    now: ref(o.next.seconds + 60),
    fresh: ref<BuildUpPlan | null>(null),
    sim: ref<{ status: 'working' | 'waiting' | 'failed' | 'done'; reason?: string } | null>({ status: 'working' }),
    saveFarm: ref<SaveFarm | null>(o.keptOn.farm),
    saveLoading: ref(false),
  };
  const scope = effectScope();
  const t = scope.run(() => useBuildUpTracker(r))!;
  r.fresh.value = o.plan;
  await nextTick();
  r.fresh.value = null;
  r.sim.value = { status: 'done' };
  r.saveSeconds.value = o.next.seconds;
  r.saveFarm.value = o.next.farm;
  await nextTick();
  return { r, t, scope };
}
const lineAt = (t: ReturnType<typeof useBuildUpTracker>, h: number, m: number) => t.result.value!.lines.find(l => l.at === mt(11, 6, h, m) && l.tickable)!.key;

describe('the tracker anchors on the save the plan was simulated from', () => {
  it('a plan from the 1:51 pm save kept while the 2:20 pm save is on screen: anchored on 1:51 pm; the 2:50 pm save ticks its lines', async () => {
    const { t, scope } = await keptAfterNewerSave({
      plan: buildUpPlan(),
      keptOn: { seconds: mt(11, 6, 14, 20), farm: farm(98, 30, 13) },
      next: { seconds: mt(11, 6, 14, 50), farm: farm(102, 30, 14) },
    });
    expect(t.plan.value?.saveSeconds).toBe(PLAN_SAVE);
    expect(t.plan.value?.anchorFarm).toEqual(farm(93, 29, 13));
    expect(t.bought.value?.fit).toBe('fits');
    expect(t.ticks.value.has(lineAt(t, 13, 59))).toBe(true);
    expect(t.ticks.value.has(lineAt(t, 14, 2))).toBe(true);
    expect(t.ticks.value.has(lineAt(t, 14, 27))).toBe(false);
    expect(t.summary.value?.done).toBe(2);
    scope.stop();
  });

  it('Re-plan shows for the save on screen when it is over 1 h behind the plan, though the plan came in on it', async () => {
    // The plan from 1:51 pm comes in while the 3:10 pm save is loaded; that save holds the 1:59 pm line only.
    const at = { seconds: mt(11, 6, 15, 10), farm: farm(101, 30, 14) };
    const { t, scope } = await keptAfterNewerSave({ plan: buildUpPlan(), keptOn: at, next: at });
    expect(t.bought.value?.fit).toBe('fits');
    expect(t.offer.value?.behind).toBeGreaterThan(3600);
    expect(t.offer.value?.show).toBe(true);
    expect(t.replanShown.value).toBe(true);
    scope.stop();
  });

  it('Re-plan shows for a newer save that does not hold the plan\'s start at all (nothing can tick there)', async () => {
    const { t, scope } = await keptAfterNewerSave({
      plan: buildUpPlan(),
      keptOn: { seconds: PLAN_SAVE, farm: farm(93, 29, 13) },
      // 2:30 pm, Enlightened Chickens BELOW the plan's start: within the hour of the first line, so "behind" alone would not say.
      next: { seconds: mt(11, 6, 14, 30), farm: farm(90, 29, 13) },
    });
    expect(t.bought.value?.fit).toBe('older');
    expect(t.offer.value?.show).toBe(true);
    scope.stop();
  });

  it('control: a plan that starts afresh keeps its anchor farm, so a save from before its prestige still reads as that', async () => {
    const pre = (ec: number): SaveFarm => farm(ec, 30, 14);
    const fresh: BuildUpPlan = { ...fixturePlan(), from: { backupTime: PLAN_SAVE, farm: pre(110) } };
    const { t, scope } = await keptAfterNewerSave({
      plan: fresh,
      keptOn: { seconds: mt(11, 6, 14, 20), farm: pre(112) },
      next: { seconds: mt(11, 6, 14, 50), farm: pre(114) },
    });
    expect(t.plan.value?.anchorFarm).toEqual(pre(110));
    expect(t.bought.value?.fit).toBe('beforePrestige');
    scope.stop();
  });
});

describe('a save still coming in: the card waits for it', () => {
  it('while the save is loading the tracker is "checking", never a settled "0 done" with no Re-plan', async () => {
    const { r, t, scope } = await keptAfterNewerSave({
      plan: buildUpPlan(),
      keptOn: { seconds: PLAN_SAVE, farm: farm(93, 29, 13) },
      next: { seconds: mt(11, 6, 14, 50), farm: farm(102, 30, 14) },
    });
    expect(t.state.value).toBe('ready');
    // A newer save starts coming in: the stores have not taken it yet, so the page has no save farm to tick from.
    r.saveLoading.value = true;
    r.saveFarm.value = null;
    await nextTick();
    expect(t.state.value).toBe('checking');
    // It is in: ticked from it again.
    r.saveFarm.value = farm(102, 30, 14);
    r.saveSeconds.value = mt(11, 6, 14, 56);
    r.saveLoading.value = false;
    await nextTick();
    expect(t.state.value).toBe('ready');
    expect(t.summary.value?.done).toBe(2);
    scope.stop();
  });
});
