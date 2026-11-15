/**
 * M13 item 3 (12 Nov 2026): the Egg Day row shows the instant answer's plan and its spare; a followed route that lands
 * after the date (an older planner's pick) gets its own line under the row, from the follow state's `late`.
 */
import { describe, expect, it } from 'vitest';
import { createPinia } from 'pinia';
import { renderHtml, textWithDots as textOf } from '@/test/renderComponent';
import RightNowCard from './RightNowCard.vue';
import { planEvents, tableEvents, type NowPlan } from '@/lib/nowPlan';
import type { CardPlan } from '@/composables/useNowPage';
import type { GoalOption } from '@/lib/planGoals';

const ZONE = 'America/Denver';
const H = 3600;
const NOW = Date.UTC(2026, 10, 12, 20) / 1000;
const EGG_DAY_AT = Date.UTC(2027, 6, 14, 16) / 1000;
const JUL11 = Date.UTC(2027, 6, 11, 23) / 1000;
const JUL17 = Date.UTC(2027, 6, 17, 9) / 1000;
const plan: NowPlan = {
  goal: 'date',
  deadline: EGG_DAY_AT,
  chain: [222, 243, 281, 313],
  end: JUL11,
  endTE: 313,
  legs: null,
  tableLegs: [{ from: 218, to: 222, endTE: 222, start: NOW, end: JUL11 }],
  exact: false,
  instantTE: 313,
  calculatedAt: NOW * 1000,
  planStart: NOW,
  spareHours: (EGG_DAY_AT - JUL11) / H,
  runnerUpHours: null,
  meta: null,
  whatIf: null,
};
const card: CardPlan = { plan, goal: { goal: 'date', target: 490, deadline: EGG_DAY_AT }, state: 'this-save', key: 'eggday-2027', name: 'Egg Day 2027' };
const goals = (follow?: GoalOption['follow']): GoalOption[] => [
  {
    key: 'eggday-2027',
    kind: 'eggday',
    label: 'Egg Day 2027',
    name: 'Egg Day 2027',
    deadline: EGG_DAY_AT,
    state: 'plan',
    calculatedAt: NOW * 1000,
    open: { auto: 'by-date', byDate: { eggDay: true } },
    ...(follow ? { following: true, follow } : {}),
  },
];
const render = (follow?: GoalOption['follow']) => {
  const events = planEvents(plan, NOW);
  return renderHtml(
    RightNowCard,
    {
      card,
      onVirtue: true,
      currentEgg: 'curiosity',
      teSoFar: 218,
      ascNow: 1,
      track: null,
      events,
      shownEvents: tableEvents(events),
      gear: null,
      now: NOW,
      zone: ZONE,
      saveSeconds: NOW - H,
      eggDayYear: 2027,
      goals: goals(follow),
      selectedGoal: 'eggday-2027',
      rounded: true,
    },
    {},
    [createPinia()]
  );
};

describe('Right now: a followed route that lands after the date, beside the instant answer\'s row', () => {
  it('its own line, apart from the row\'s spare', async () => {
    const html = await render({ times: 'estimate', end: JUL17, late: true });
    const t = textOf(html);
    expect(html).toContain('data-testid="now-followed-late"');
    expect(t).toMatch(/Your followed route lands about Jul 17, 2027, after Egg Day starts/);
  });
  it('not followed, or not late: no line', async () => {
    expect(await render()).not.toContain('now-followed-late');
    expect(await render({ times: 'estimate', end: JUL17 })).not.toContain('now-followed-late');
  });
});
