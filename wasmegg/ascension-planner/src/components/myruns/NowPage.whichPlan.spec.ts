/**
 * Right now's "which plan" switch and the route followed (Jordan, 16 Oct 2026), server-rendered and through
 * useNowPage with the synthetic saves (ids EI0000000000000000 and EI1234567890123456, never printed):
 *   - the switch: a radiogroup of the goals (Race to 490 | Egg Day 2027 | By a date), 44 px, wrapping; an empty goal
 *     says so with "Work it out ›" opening that goal's screen;
 *   - the default is the goal checked last; a pick is kept for this account and save, and falls back after a switch;
 *   - the events table, Next step, the timeline, the calendar and the route line follow the selected goal;
 *   - "Following 197 → 222 → 247 → 285 → 313 (Egg Day 2027)", the ascension the save is in highlighted.
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp, effectScope, h, markRaw, ref } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createPinia, setActivePinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import RightNowCard from './RightNowCard.vue';
import EventsTable from './EventsTable.vue';
import type { LegSummary } from '@/search/types';
import { planEvents, tableEvents, type NowPlan } from '@/lib/nowPlan';
import type { CardPlan } from '@/composables/useNowPage';
import type { GoalOption } from '@/lib/planGoals';
import { syntheticBackup } from '@/test/syntheticSave';
import { resolveColleggtibleContracts } from 'lib';
import { loadAndSyncBackup, rollUpPendingTE } from '@/lib/modes';
import { useChainSearchStore } from '@/stores/chainSearch';
import { eggDaySeconds, nextEggDayYear } from '@/lib/eggDay';
import { accountOf } from '@/search/runSaves';
import { instantSnapKey, writeSnapshot } from '@/search/instantSnapshot';
import type { BoardRow } from '@/lib/leaderboardRank';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
const ZONE = 'America/Denver';
const NOW = Date.UTC(2026, 9, 15, 20, 40) / 1000; // Thu Oct 15, 2:40 pm Denver
const H = 3600;
const EGG_DAY_AT = Date.UTC(2027, 6, 14, 16) / 1000;

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
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

const leg = (start: number, end: number, endTE: number, shifts: LegSummary['shifts']) =>
  ({ key: 'continue', endTE, durationSeconds: end - start, maxELR: 0, endTime: end, tier13Unlocked: false, startTime: start, shifts, endEgg: { egg: 'kindness', te: 40 } }) as LegSummary;

/** Egg Day 2027: 197 → 222 → 247 → 285 → 313, the save in its second ascension. */
const CHAIN = [197, 222, 247, 285, 313];
const dateLegs = [
  leg(NOW - 40 * H, NOW - 10 * H, 197, []),
  leg(NOW - 10 * H, NOW + 20 * H, 222, [{ at: NOW + 2 * H, egg: 'humility', fromEgg: 'integrity', te: 41 }]),
  leg(NOW + 21 * H, NOW + 200 * H, 247, []),
  leg(NOW + 201 * H, NOW + 900 * H, 285, []),
  leg(NOW + 901 * H, NOW + 2000 * H, 313, []),
];
const datePlan: NowPlan = {
  goal: 'date',
  deadline: EGG_DAY_AT,
  chain: CHAIN,
  end: NOW + 2000 * H,
  endTE: 313,
  legs: dateLegs,
  tableLegs: null,
  exact: true,
  instantTE: 313,
  calculatedAt: (NOW - H) * 1000,
  planStart: NOW - 40 * H,
  spareHours: 20,
  runnerUpHours: null,
  meta: null,
  whatIf: null,
};
const options = (o: Partial<Record<'race' | 'egg', GoalOption['state']>> = {}): GoalOption[] => [
  {
    key: 'fastest-490',
    kind: 'race',
    label: 'Race to 490',
    name: 'Race to 490',
    deadline: null,
    state: o.race ?? 'plan',
    calculatedAt: (NOW - 3 * H) * 1000,
    open: { auto: 'fastest', depth: 'smart', target: 490 },
  },
  {
    key: 'eggday-2027',
    kind: 'eggday',
    label: 'Egg Day 2027',
    name: 'Egg Day 2027',
    deadline: EGG_DAY_AT,
    state: o.egg ?? 'plan',
    calculatedAt: o.egg && o.egg !== 'plan' ? null : (NOW - H) * 1000,
    open: { auto: 'by-date', byDate: { eggDay: true } },
  },
];
const card: CardPlan = {
  plan: datePlan,
  goal: { goal: 'date', target: 490, deadline: EGG_DAY_AT },
  state: 'this-save',
  key: 'eggday-2027',
  name: 'Egg Day 2027',
};
const cardProps = (o: Record<string, unknown> = {}) => {
  const events = planEvents(datePlan, NOW);
  return {
    card,
    onVirtue: true,
    currentEgg: 'integrity',
    teSoFar: 200,
    ascNow: 2,
    track: { kind: 'same-save' },
    events,
    shownEvents: tableEvents(events),
    gear: null,
    now: NOW,
    zone: ZONE,
    saveSeconds: NOW - 3 * H,
    eggDayYear: 2027,
    goals: options(),
    selectedGoal: 'eggday-2027',
    ...o,
  };
};

describe('the switch', () => {
  it('a radiogroup of the goals: the selected one checked and in the tab order, 44 px targets, wrapping', async () => {
    const html = await renderHtml(RightNowCard, cardProps());
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Which plan"');
    expect(html.match(/role="radio"/g)).toHaveLength(2);
    const radio = (key: string) => html.match(new RegExp(`<button[^>]*data-testid="now-goal-${key}"[^>]*>`))![0];
    expect(radio('eggday-2027')).toContain('aria-checked="true"');
    expect(radio('eggday-2027')).toContain('tabindex="0"');
    expect(radio('fastest-490')).toContain('aria-checked="false"');
    expect(radio('fastest-490')).toContain('tabindex="-1"');
    expect(radio('fastest-490')).toContain('min-h-[44px]');
    expect(html).toMatch(/class="flex flex-wrap gap-2" data-testid="now-goal-switch"/);
    const t = textOf(html);
    expect(t).toContain('Race to 490 calculated 3 h ago');
    expect(t).toContain('Egg Day 2027 calculated 1 h ago');
    // The switch sits above the rest of the card.
    expect(html.indexOf('now-goal-switch')).toBeLessThan(html.indexOf('data-testid="now-next"'));
  });

  it('an empty goal: "no saved plan for this goal yet · Work it out ›", opening that goal’s screen', async () => {
    const none = await renderHtml(RightNowCard, cardProps({ card: null, events: [], shownEvents: [], track: null, goals: options({ egg: 'none' }) }));
    const t = textOf(none);
    expect(t).toContain('Egg Day 2027: no saved plan for this goal yet · Work it out ›');
    expect(t).toContain('Egg Day 2027 no saved plan yet'); // the option's own line
    expect(t).not.toContain('Following');
    expect(none).not.toContain('data-testid="now-events"');
    const only = textOf(await renderHtml(RightNowCard, cardProps({ card: null, events: [], shownEvents: [], track: null, goals: options({ egg: 'answer-only' }) })));
    expect(only).toContain('Egg Day 2027: no saved plan with its times for this goal yet · Work it out ›');
    expect(read('RightNowCard.vue')).toContain(`data-testid="now-work-it-out" @click="emit('open', selectedOption.open)"`);
  });

  it('"Work it out ›" and the arrows, through the component', async () => {
    let setup: Record<string, unknown> = {};
    const onOpen = vi.fn();
    const onSelect = vi.fn();
    const props = { ...cardProps({ card: null, events: [], shownEvents: [], track: null, goals: options({ egg: 'none' }) }), onOpen, onSelect };
    const app = createSSRApp({ render: () => h(RightNowCard, props as never) });
    app.mixin({
      created(this: { $: { type: { __file?: string }; setupState: Record<string, unknown> } }) {
        if (this.$.type.__file?.endsWith('/RightNowCard.vue')) setup = this.$.setupState;
      },
    });
    await renderToString(app);
    expect((setup.selectedOption as GoalOption).open).toEqual({ auto: 'by-date', byDate: { eggDay: true } });
    const key = (k: string) => (setup.onSwitchKey as (e: unknown) => void)({ key: k, preventDefault: () => undefined });
    key('ArrowRight');
    expect(onSelect).toHaveBeenLastCalledWith('fastest-490');
    key('ArrowLeft');
    expect(onSelect).toHaveBeenLastCalledWith('fastest-490');
    key('Tab');
    expect(onSelect).toHaveBeenCalledTimes(2);
  });
});

describe('the route followed', () => {
  it('"Following 197 → 222 → 247 → 285 → 313 (Egg Day 2027)": the ascension the save is in highlighted, the ones passed grey', async () => {
    const html = await renderHtml(RightNowCard, cardProps());
    const line = html.match(/<p[^>]*data-testid="now-chain"[\s\S]*?<\/p>/)![0];
    expect(textOf(line)).toBe('Following 197 → 222 → 247 → 285 → 313 (Egg Day 2027)');
    const stop = (te: number) => line.match(new RegExp(`<span[^>]*>${te}</span>`))![0];
    expect(stop(197)).toContain('data-stop="passed"');
    expect(stop(197)).toContain('text-slate-400');
    expect(stop(222)).toContain('data-stop="now"');
    expect(stop(222)).toContain('aria-current="step"');
    expect(stop(222)).toContain('underline');
    expect(stop(222)).toContain('text-indigo-800');
    for (const te of [247, 285, 313]) expect(stop(te)).toContain('data-stop="ahead"');
    // Wraps: no nowrap on the line.
    expect(line).toContain('break-words');
    expect(line).not.toContain('whitespace-nowrap');
    // Before the plan starts nothing is highlighted.
    const before = (await renderHtml(RightNowCard, cardProps({ ascNow: 0 }))).match(/<p[^>]*data-testid="now-chain"[\s\S]*?<\/p>/)![0];
    expect(before).not.toContain('data-stop="now"');
  });

  it('a Race plan says "(Race to 490)"; the calendar events of the table carry the line', async () => {
    const t = textOf(
      await renderHtml(RightNowCard, cardProps({ card: { ...card, plan: { ...datePlan, goal: 'fastest', deadline: null, chain: [197, 490] }, goal: { goal: 'fastest', target: 490, deadline: null }, key: 'fastest-490', name: 'Race to 490' }, selectedGoal: 'fastest-490' }))
    );
    expect(t).toContain('Following 197 → 490 (Race to 490)');
    expect(read('RightNowCard.vue')).toContain(':following="following"');
    expect(read('RightNowCard.vue')).toMatch(/planCalEvent\(nextEvent\.value, \{[\s\S]*?following: following\.value/);
    expect(read('EventsTable.vue')).toMatch(/planCalEvent\(e, \{[\s\S]*?following: props\.following/);
    // EventsTable's own render still works with the line passed.
    const events = planEvents(datePlan, NOW);
    const html = await renderHtml(EventsTable, {
      events: tableEvents(events),
      goal: 'date',
      goalName: 'Egg Day 2027',
      now: NOW,
      zone: ZONE,
      saveWhen: 'Oct 15 at 11:40 am',
      calculatedWhen: 'Oct 15 at 1:40 pm',
      following: 'Following 197 → 222 → 247 → 285 → 313 (Egg Day 2027)',
    });
    expect(textOf(html)).toContain('Egg Day 2027 goal: 313 TE');
  });
});

// ------------------------------------------------------------------------- the page with saved plans

const A_ID = 'EI0000000000000000';
const B_ID = 'EI1234567890123456';
function save(id: string, hoursAgo: number) {
  const b = syntheticBackup();
  const t = Math.floor(Date.now() / 1000) - hoursAgo * H;
  b.eiUserId = id;
  b.settings.lastBackupTime = t;
  b.approxTime = t;
  resolveColleggtibleContracts(b);
  return markRaw(b);
}

describe('the page: the default is the goal checked last, the pick follows everything, and resets', () => {
  it('Race (older) and Egg Day (newer) kept, and a plan for another date: Egg Day opens; Race picked moves the card', async () => {
    const a = save(A_ID, 2);
    loadAndSyncBackup(A_ID, a, 'plan_next');
    rollUpPendingTE();
    const { instantKeyFromStores, resetGoalChoice, useNowPage } = await import('@/composables/useNowPage');
    resetGoalChoice();
    const target = useChainSearchStore().finalTE;
    const now = Math.floor(Date.now() / 1000);
    const eggDayAt = eggDaySeconds(nextEggDayYear());
    const year = nextEggDayYear();
    const fLegs = [leg(now - H, now + 2 * H, 192, [{ at: now + H, egg: 'humility', fromEgg: 'curiosity', te: 39 }]), leg(now + 3 * H, now + 90 * H, target, [])];
    writeSnapshot(instantSnapKey(instantKeyFromStores(null, target)), {
      at: Date.now() - 3 * 60_000,
      header: {},
      result: { best: null, byAscensions: [null, null, { chain: [192, target], end: now + 91 * H, legs: [] }] },
      exact: { [`192,${target}`]: { end: now + 90 * H, endTE: target, legs: fLegs } },
      answerStart: now - H,
    } as never);
    const dLegs = [leg(now - H, now + 5 * H, 200, [{ at: now + 4 * H, egg: 'kindness', fromEgg: 'curiosity', te: 40 }]), leg(now + 6 * H, now + 50 * H, 230, [])];
    const dateSnap = (deadline: number, at: number) => ({
      at,
      header: {},
      result: { best: null, byAscensions: [], byDate: { chain: [200, 230], end: now + 50 * H, legs: [] } },
      dateExact: { chain: [200, 230], endTE: 230, end: now + 50 * H },
      exact: { '200,230': { end: now + 50 * H, endTE: 230, legs: dLegs } },
      answerStart: now - H,
    });
    writeSnapshot(instantSnapKey(instantKeyFromStores(eggDayAt, target)), dateSnap(eggDayAt, Date.now() - 60_000) as never);
    // Another date's plan, from the index (this account, this save, priced with other hours: not recorded).
    const MAR = eggDayAt - 120 * 86400;
    writeSnapshot('aap-instant-answer:otherdate|0', {
      ...dateSnap(MAR, Date.now() - 2 * 60_000),
      meta: { account: accountOf(a), goal: `date ${MAR}`, backupTime: a.settings.lastBackupTime },
    } as never);

    const scope = effectScope();
    const page = scope.run(() => useNowPage({ myRows: ref<BoardRow[] | null>([]), boardRows: ref<BoardRow[] | null>([]) }))!;
    expect(page.goalChoices.value.map(g => [g.key, g.label, g.state])).toEqual([
      [`fastest-${target}`, `Race to ${target}`, 'plan'],
      [`eggday-${year}`, `Egg Day ${year}`, 'plan'],
      [`date-${MAR}`, 'By a date', 'plan'],
    ]);
    // Egg Day was checked last.
    expect(page.selectedGoal.value).toBe(`eggday-${year}`);
    expect(page.cardPlan.value?.goal.goal).toBe('date');
    expect(page.cardPlan.value?.name).toBe(`Egg Day ${year}`);
    expect(page.cardPlan.value?.plan.chain).toEqual([200, 230]);
    expect(page.events.value.find(e => e.kind === 'shift')?.egg).toBe('kindness');

    // Race picked: the plan, the events (table, Next step, calendar) and the timeline's chain are Race's.
    page.selectGoal(`fastest-${target}`);
    expect(page.cardPlan.value?.goal.goal).toBe('fastest');
    expect(page.cardPlan.value?.name).toBe(`Race to ${target}`);
    expect(page.cardPlan.value?.plan.chain).toEqual([192, target]);
    expect(page.events.value.find(e => e.kind === 'shift')?.egg).toBe('humility');
    expect(page.shownEvents.value.some(e => e.kind === 'goal' && e.te === target)).toBe(true);
    expect(page.ascNow.value).toBe(1);

    // Another date.
    page.selectGoal(`date-${MAR}`);
    expect(page.cardPlan.value?.goal).toEqual({ goal: 'date', target, deadline: MAR });
    expect(page.cardPlan.value?.state).toBe('setup-changed');
    expect(page.cardPlan.value?.name).toMatch(/^By /);
    page.selectGoal(`fastest-${target}`);

    // Another account loaded: the pick falls back to the default (nothing kept there: Race, the first).
    const b = save(B_ID, 1);
    loadAndSyncBackup(B_ID, b, 'plan_next');
    rollUpPendingTE();
    expect(page.goalChoices.value.map(g => [g.key, g.state])).toEqual([
      [`fastest-${target}`, 'none'],
      [`eggday-${year}`, 'none'],
    ]);
    page.selectGoal(`eggday-${year}`);
    expect(page.selectedGoal.value).toBe(`eggday-${year}`);
    expect(page.cardPlan.value).toBeNull();
    // Back to the first account: its default again, not B's pick.
    loadAndSyncBackup(A_ID, a, 'plan_next');
    rollUpPendingTE();
    expect(page.selectedGoal.value).toBe(`eggday-${year}`); // A's default (checked last), not a leftover
    page.selectGoal(`fastest-${target}`);
    expect(page.selectedGoal.value).toBe(`fastest-${target}`);
    // A newer save of the same account: the default again.
    const a2 = save(A_ID, 1);
    loadAndSyncBackup(A_ID, a2, 'plan_next');
    rollUpPendingTE();
    expect(page.selectedGoal.value).not.toBe(`fastest-${target}`);
    scope.stop();
  });

  it('MyRunsView passes the switch to the card and its pick back to the page', () => {
    const view = read('../MyRunsView.vue');
    expect(view).toContain(':goals="page.goalChoices.value"');
    expect(view).toContain(':selected-goal="page.selectedGoal.value"');
    expect(view).toContain('@select="page.selectGoal"');
  });
});

describe('source: everything on the card follows the selected goal', () => {
  it('cardPlan is the selected goal’s; the events, the table, Next step, the timeline and the track read cardPlan', () => {
    const src = read('../../composables/useNowPage.ts');
    expect(src).toContain('const sel = planGoals.value.find(p => p.goal.key === selectedGoal.value);');
    expect(src).toContain('mergeSimultaneousShifts(planEvents(cardPlan.value.plan, now.value), zone.value)');
    expect(src).toContain('const shownEvents = computed(() => tableEvents(events.value));');
    expect(src).toContain('ascensionAt(cardPlan.value.plan, now.value)');
    // The pick is module state for this visit, scoped to the account and the save (no localStorage).
    expect(src).toContain('const choiceScope = computed(() => `${account.value ?? \'\'}|${saveSeconds.value}`);');
    expect(src).not.toMatch(/localStorage\.setItem/);
    const card = read('RightNowCard.vue');
    expect(card).toContain(':chain="card.plan.chain"');
    expect(card).toContain(':legs="card.plan.legs"');
    expect(card).toContain(':events="shownEvents"');
    expect(card).toContain('nextStepText(props.events, props.card.goal.goal, props.now, props.zone)');
  });
});
