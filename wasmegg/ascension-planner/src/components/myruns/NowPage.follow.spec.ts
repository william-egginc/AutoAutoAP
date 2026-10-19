/**
 * "Follow this route" on Right now (16 Oct 2026), server-rendered: the player's pick replaces the planner's on the
 * route line, priced from a save (this one, or an older one, said so), or not priced yet with "Price it ›"
 * (Recalculate with the route attached) and "Simulate it ›"; "Use the checked route ›" goes back. Then the buttons
 * that pick a route, wired where the plan says. Ids: placeholders only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp, effectScope, h, markRaw, ref } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createPinia, setActivePinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import RightNowCard from './RightNowCard.vue';
import FollowButton from '../FollowButton.vue';
import type { LegSummary } from '@/search/types';
import { planEvents, tableEvents, type NowPlan } from '@/lib/nowPlan';
import type { CardPlan, FollowCard } from '@/composables/useNowPage';
import type { GoalOption } from '@/lib/planGoals';
import { useInitialStateStore } from '@/stores/initialState';
import { useFollowStore } from '@/stores/follow';
import { useUIStore } from '@/stores/ui';
import { syntheticBackup } from '@/test/syntheticSave';
import { resolveColleggtibleContracts } from 'lib';
import { loadAndSyncBackup, rollUpPendingTE } from '@/lib/modes';
import { useChainSearchStore } from '@/stores/chainSearch';
import { instantSnapKey, writeSnapshot } from '@/search/instantSnapshot';
import type { BoardRow } from '@/lib/leaderboardRank';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
const ZONE = 'America/Denver';
const NOW = Date.UTC(2026, 9, 15, 20, 40) / 1000; // Thu Oct 15, 2:40 pm Denver
const OLD = NOW - 30 * 3600; // Wed Oct 14, 8:40 am Denver
const H = 3600;

beforeEach(() => {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  });
  setActivePinia(createPinia());
});

const legs = [
  {
    key: 'continue',
    endTE: 222,
    durationSeconds: 40 * H,
    maxELR: 0,
    startTime: NOW - 8 * H,
    endTime: NOW + 32 * H,
    tier13Unlocked: false,
    shifts: [{ at: NOW + 2 * H, egg: 'humility', fromEgg: 'integrity', te: 39 }],
    endEgg: { egg: 'kindness', te: 40 },
  },
  {
    key: 'continue',
    endTE: 490,
    durationSeconds: 200 * H,
    maxELR: 0,
    startTime: NOW + 33 * H,
    endTime: NOW + 233 * H,
    tier13Unlocked: false,
    shifts: [],
    endEgg: { egg: 'kindness', te: 98 },
  },
] as unknown as LegSummary[];
const plan: NowPlan = {
  goal: 'fastest',
  deadline: null,
  chain: [222, 490],
  end: NOW + 233 * H,
  endTE: 490,
  legs,
  tableLegs: null,
  exact: true,
  instantTE: null,
  calculatedAt: (NOW - 2 * H) * 1000,
  planStart: NOW - 8 * H,
  spareHours: null,
  runnerUpHours: null,
  meta: null,
  whatIf: null,
};
const option: GoalOption = {
  key: 'fastest-490',
  kind: 'race',
  label: 'Race to 490',
  name: 'Race to 490',
  deadline: null,
  state: 'plan',
  calculatedAt: plan.calculatedAt,
  open: { auto: 'fastest', depth: 'smart', target: 490 },
  following: true,
};
function props(card: CardPlan | null, follow: FollowCard | null) {
  const events = card ? planEvents(card.plan, NOW) : [];
  return {
    card,
    follow,
    onVirtue: true,
    currentEgg: 'integrity',
    teSoFar: 205,
    ascNow: card ? 1 : 0,
    track: null,
    events,
    shownEvents: tableEvents(events),
    gear: null,
    now: NOW,
    zone: ZONE,
    saveSeconds: NOW - 3 * H,
    eggDayYear: 2027,
    goals: [option],
    selectedGoal: 'fastest-490',
  };
}
const thisSave: FollowCard = { chain: [222, 490], from: 'board', price: 'exact', source: 'this-save', pricedSave: NOW - 3 * H };
const followedCard: CardPlan = {
  plan,
  goal: { goal: 'fastest', target: 490, deadline: null },
  state: 'this-save',
  key: 'fastest-490',
  name: 'Race to 490',
  followed: thisSave,
};

describe('Right now with a followed route', () => {
  it('priced on this save: the route line names it your pick, with the way back and no Price it', async () => {
    const t = textOf(await renderHtml(RightNowCard, props(followedCard, thisSave)));
    expect(t).toContain('Following 222 → 490 (Race to 490 · your pick)');
    expect(t).toContain('Following your pick · Use the checked route ›');
    expect(t).not.toContain('Price it');
    expect(t).not.toContain('may have drifted');
    // Its events and timeline are there (they follow the plan, which is the followed route's).
    const html = await renderHtml(RightNowCard, props(followedCard, thisSave));
    expect(html).toContain('data-testid="now-timeline"');
    expect(html).toContain('data-testid="now-recalc"');
  });

  it("priced on an older save: says which, that it may have drifted, and offers Price it", async () => {
    const older: FollowCard = { ...thisSave, source: 'older-save', pricedSave: OLD };
    const c: CardPlan = { ...followedCard, state: 'older-save', plan: { ...plan, meta: { account: 'a', goal: 'target 490', backupTime: OLD } }, followed: older };
    const t = textOf(await renderHtml(RightNowCard, props(c, older)));
    expect(t).toContain(
      'Following your pick · priced on your save of Oct 14 at 8:40 am, may have drifted · Price it › · Simulate it › · Use the checked route ›'
    );
    // The card's own older-save box is not said twice.
    expect(t).not.toContain('This plan was worked out from your save of');
  });

  it('not priced on this save: the route line, "not priced on this save yet · Price it ›", no events or calendar', async () => {
    const none: FollowCard = { chain: [222, 490], from: 'typed', price: 'none', source: null, pricedSave: null };
    const html = await renderHtml(RightNowCard, props(null, none));
    const t = textOf(html);
    expect(t).toContain('Following 222 → 490 (Race to 490 · your pick)');
    expect(t).toContain('Following your pick · not priced on this save yet · Price it › · Simulate it › · Use the checked route ›');
    expect(t).toContain('No timeline for your route on this save yet');
    expect(html).not.toContain('data-testid="now-events"');
    expect(html).not.toContain('data-testid="now-timeline"');
    expect(html).not.toContain('Add to calendar');
  });

  it('only a finish from Check exactly history: says when it was checked, no timeline kept', async () => {
    const fin: FollowCard = {
      chain: [222, 490],
      from: 'answer',
      price: 'finish',
      source: 'history',
      pricedSave: OLD,
      finish: { end: NOW + 100 * H, endTE: 490, at: OLD * 1000 + 600_000 },
    };
    const t = textOf(await renderHtml(RightNowCard, props(null, fin)));
    expect(t).toMatch(/Following your pick · checked Oct 14 at 8:50 am: lands Oct 19 at 6:40 pm, no timeline kept · Price it ›/);
  });

  it('"Price it ›" asks Recalculate with the route attached; App passes it on to Check exactly', async () => {
    const none: FollowCard = { chain: [222, 490], from: 'typed', price: 'none', source: null, pricedSave: null };
    const onRecalc = vi.fn();
    let setup: Record<string, unknown> = {};
    const app = createSSRApp({ render: () => h(RightNowCard, { ...props(null, none), onRecalc } as never) });
    app.mixin({
      created(this: { $: { type: { __file?: string }; setupState: Record<string, unknown> } }) {
        if (this.$.type.__file?.endsWith('/RightNowCard.vue')) setup = this.$.setupState;
      },
    });
    await renderToString(app);
    (setup.priceIt as () => void)();
    expect(onRecalc).toHaveBeenCalledWith({
      open: { auto: 'fastest', depth: 'smart', target: 490 },
      goal: 'target 490',
      chain: [222, 490],
    });
    const ui = useUIStore();
    ui.askExact('target 490', [222, 490]);
    expect(ui.exactAsk).toEqual({ goal: 'target 490', n: 1, chain: [222, 490] });
    expect(read('../../App.vue')).toContain('uiStore.askExact(req.goal, req.chain);');
    // InstantRoute keeps the asked route and prices it after the rows (lands in `exact`, so in the snapshot).
    const route = read('../auto/InstantRoute.vue');
    expect(route).toMatch(/if \(step !== 'drop' && ui\.exactAsk\?\.chain\?\.length\) followAsk = \[\.\.\.ui\.exactAsk\.chain\];/);
    expect(route).toMatch(/const followed = followedToPrice\(\);\s*if \(followed\) \{[\s\S]*?await price\(\[followed\]\)/);
  });

  it('the typed box follows a route for the goal; a bad one says what to fix', async () => {
    const onFollow = vi.fn();
    let setup: Record<string, unknown> = {};
    const app = createSSRApp({ render: () => h(RightNowCard, { ...props(followedCard, thisSave), onFollow } as never) });
    app.mixin({
      created(this: { $: { type: { __file?: string }; setupState: Record<string, unknown> } }) {
        if (this.$.type.__file?.endsWith('/RightNowCard.vue')) setup = this.$.setupState;
      },
    });
    const html = await renderToString(app);
    expect(textOf(html)).toContain('Follow another route');
    setup.typed = '230 → 260 → 490';
    (setup.followTyped as () => void)();
    expect(onFollow).toHaveBeenCalledWith([230, 260, 490]);
    setup.typed = '230 260';
    (setup.followTyped as () => void)();
    expect(setup.typedError).toBe('This race ends at 490: make that the last stop.');
    const view = read('../MyRunsView.vue');
    expect(view).toContain('@follow="followTyped"');
    expect(view).toContain('@unfollow="unfollowGoal"');
    expect(view).toContain('@simulate="simulateFollowed"');
    expect(view).toContain(':follow="page.follow.value"');
  });
});

describe('Follow this route buttons', () => {
  it('shows Follow this route, then Following ✓ once kept for the goal', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useInitialStateStore().rawBackup = { eiUserId: 'EI1234567890123456' } as never;
    const p = { chain: [222, 490], goalKey: 'fastest-490', from: 'answer' };
    expect(textOf(await renderHtml(FollowButton, p, {}, [pinia]))).toBe('Follow this route');
    await useFollowStore().follow('fastest-490', [222, 490], 'answer');
    expect(textOf(await renderHtml(FollowButton, p, {}, [pinia]))).toBe('Following ✓');
    expect(textOf(await renderHtml(FollowButton, { ...p, goalKey: 'eggday-2027' }, {}, [pinia]))).toBe('Follow this route');
  });

  it('sits beside the existing buttons, each with its goal', () => {
    // The box's button follows the route the box shows (Q6: the fewest-ascensions pick when Prefer fewer is on).
    const route = read('../auto/InstantRoute.vue');
    expect(route).toContain('<FollowButton class="mt-1 ml-2" primary :chain="boxLead.chain" :goal-key="followGoal" from="answer" />');
    expect(route).toContain(
      '<FollowButton class="mt-1 ml-2" primary :chain="dateBoxOf(result.byDate).chain" :goal-key="followGoal" from="answer" />'
    );
    expect(route).toContain('<FollowButton v-if="r.chain.length" :chain="r.chain" :goal-key="followGoal" from="count" />');
    expect(route).toContain(
      '<FollowButton :chain="(dateExactByK[r.legs.length] ?? tableDate(r)).chain" :goal-key="followGoal" from="count" />'
    );
    expect(route).toContain('const followGoal = computed(() => screenGoalKey(props.deadline, store.finalTE));');
    expect(read('../auto/SavedAnswers.vue')).toContain(':goal-key="screenGoalKey(a.result.deadline, a.result.te)"');
    expect(read('../auto/SavedRuns.vue')).toContain(':goal-key="`fastest-${run.finalTE}`"');
    expect(read('../auto/MyRunsList.vue')).toContain(':chain="l.row.chain" :goal-key="boardGoalKey(l.row)" from="board"');
    expect(read('../auto/LeaderboardPlanList.vue')).toContain(':chain="p.row.chain" :goal-key="boardGoalKey(p.row)" from="board"');
    const panel = read('../auto/LeaderboardPanel.vue');
    expect(panel).toContain(':chain="e.best.row.chain" :goal-key="boardGoalKey(e.best.row)" from="board"');
    expect(panel).toContain(':chain="line.row.chain" :goal-key="boardGoalKey(line.row)" from="board"');
  });
});

describe('the page: a followed route replaces the lead, priced from the saved exact legs', () => {
  it('a priced pick leads the card; an unpriced one shows no plan; "Use the checked route" goes back', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const b = syntheticBackup();
    const t = Math.floor(Date.now() / 1000) - 2 * H;
    b.eiUserId = 'EI0000000000000000';
    b.settings.lastBackupTime = t;
    b.approxTime = t;
    resolveColleggtibleContracts(b);
    loadAndSyncBackup('EI0000000000000000', markRaw(b), 'plan_next');
    rollUpPendingTE();
    const { instantKeyFromStores, resetGoalChoice, useNowPage } = await import('@/composables/useNowPage');
    resetGoalChoice();
    const target = useChainSearchStore().finalTE;
    const now = Math.floor(Date.now() / 1000);
    const leg = (start: number, end: number, endTE: number, egg: string) =>
      ({ key: 'continue', endTE, durationSeconds: end - start, maxELR: 0, endTime: end, tier13Unlocked: false, startTime: start, shifts: [{ at: start + H, egg, fromEgg: 'curiosity', te: 39 }], endEgg: { egg: 'kindness', te: 40 } }) as unknown as LegSummary;
    writeSnapshot(instantSnapKey(instantKeyFromStores(null, target)), {
      at: Date.now() - 3 * 60_000,
      header: {},
      result: { best: null, byAscensions: [null, null, { chain: [192, target], end: now + 91 * H, legs: [] }] },
      exact: {
        [`192,${target}`]: { end: now + 90 * H, endTE: target, legs: [leg(now - H, now + 2 * H, 192, 'humility')] },
        // A runner-up Check exactly priced too: the player follows this one.
        [`195,${target}`]: { end: now + 95 * H, endTE: target, legs: [leg(now - H, now + 3 * H, 195, 'resilience')] },
      },
      answerStart: now - H,
    } as never);

    const scope = effectScope();
    const page = scope.run(() => useNowPage({ myRows: ref<BoardRow[] | null>([]), boardRows: ref<BoardRow[] | null>([]) }))!;
    page.selectGoal(`fastest-${target}`);
    expect(page.cardPlan.value?.plan.chain).toEqual([192, target]);
    expect(page.follow.value).toBeNull();

    const follows = useFollowStore();
    await follows.follow(`fastest-${target}`, [195, target], 'board');
    expect(page.cardPlan.value?.plan.chain).toEqual([195, target]);
    expect(page.cardPlan.value?.followed?.price).toBe('exact');
    expect(page.follow.value).toMatchObject({ chain: [195, target], from: 'board', price: 'exact', source: 'this-save' });
    expect(page.events.value.find(e => e.kind === 'shift')?.egg).toBe('resilience');
    expect(page.goalChoices.value.find(g => g.key === `fastest-${target}`)?.following).toBe(true);

    await follows.follow(`fastest-${target}`, [199, target], 'typed');
    expect(page.cardPlan.value).toBeNull();
    expect(page.follow.value).toMatchObject({ chain: [199, target], price: 'none' });
    expect(page.events.value).toEqual([]);

    await follows.unfollow(`fastest-${target}`);
    expect(page.cardPlan.value?.plan.chain).toEqual([192, target]);
    expect(page.follow.value).toBeNull();
    scope.stop();
  });
});
