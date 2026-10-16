/**
 * Right now, 16 Oct 2026, server-rendered:
 *   - not on virtue yet (lib/onVirtue.ts): "Not on virtue yet", "When should I start?" as the main action, no Next
 *     step, no events, no calendar; each goal's saved plan as "If you start <date>: …"; the switch, the route line
 *     and the timeline stay;
 *   - on virtue: the corner badge (Building / Producing with the rate) and Gear's "Equipped now = your … set";
 *   - "Recalculate": a button with a line saying what it does, asked through App and InstantRoute (ui.exactAsk).
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createPinia, setActivePinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import RightNowCard from './RightNowCard.vue';
import GearBlock from './GearBlock.vue';
import type { LegSummary } from '@/search/types';
import { planEvents, tableEvents, type NowPlan } from '@/lib/nowPlan';
import type { CardPlan } from '@/composables/useNowPage';
import type { GoalOption } from '@/lib/planGoals';
import { startLines } from '@/lib/nowStart';
import { useUIStore } from '@/stores/ui';
import { useStartTimesStore } from '@/stores/startTimes';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
const ZONE = 'America/Denver';
const NOW = Date.UTC(2026, 9, 15, 20, 40) / 1000; // Thu Oct 15, 2:40 pm Denver
const START = Date.UTC(2026, 9, 31, 0, 0) / 1000; // Oct 30, 6:00 pm Denver
const H = 3600;

beforeEach(() => {
  setActivePinia(createPinia());
});

const leg = (start: number, end: number, endTE: number, shifts: LegSummary['shifts'], maxELR = 0) =>
  ({
    key: 'continue',
    endTE,
    durationSeconds: end - start,
    maxELR,
    endTime: end,
    tier13Unlocked: false,
    startTime: start,
    shifts,
    endEgg: { egg: 'kindness', te: 40 },
  }) as LegSummary;
const legs = [
  leg(
    NOW - 8 * H,
    NOW + 30 * H,
    198,
    [
      { at: NOW - 2 * H, egg: 'integrity', fromEgg: 'curiosity', te: 41 },
      { at: NOW + 80 * 60, egg: 'humility', fromEgg: 'integrity', te: 39 },
      { at: NOW + 80 * 60, egg: 'kindness', fromEgg: 'humility', te: 0 },
    ],
    2e12
  ),
  leg(NOW + 31 * H, NOW + 300 * H, 490, []),
];
const plan: NowPlan = {
  goal: 'fastest',
  deadline: null,
  chain: [198, 490],
  end: NOW + 300 * H,
  endTE: 490,
  legs,
  tableLegs: null,
  exact: true,
  instantTE: null,
  calculatedAt: (NOW - 2 * H) * 1000,
  planStart: NOW - 8 * H,
  spareHours: null,
  runnerUpHours: 30,
  meta: null,
  whatIf: null,
};
const card: CardPlan = {
  plan,
  goal: { goal: 'fastest', target: 490, deadline: null },
  state: 'this-save',
  key: 'fastest-490',
  name: 'Race to 490',
};
const options: GoalOption[] = [
  {
    key: 'fastest-490',
    kind: 'race',
    label: 'Race to 490',
    name: 'Race to 490',
    deadline: null,
    state: 'plan',
    calculatedAt: plan.calculatedAt,
    open: { auto: 'fastest', depth: 'smart', target: 490 },
  },
  {
    key: 'eggday-2027',
    kind: 'eggday',
    label: 'Egg Day 2027',
    name: 'Egg Day 2027',
    deadline: null,
    state: 'none',
    calculatedAt: null,
    open: { auto: 'by-date', byDate: { eggDay: true } },
  },
];
const cardProps = (o: Record<string, unknown> = {}) => {
  const events = planEvents(plan, NOW);
  return {
    card,
    onVirtue: true,
    currentEgg: 'integrity',
    teSoFar: 186.7,
    ascNow: 1,
    track: { kind: 'same-save' },
    events,
    shownEvents: tableEvents(events),
    gear: null,
    now: NOW,
    zone: ZONE,
    saveSeconds: NOW - 3 * H,
    eggDayYear: 2027,
    goals: options,
    selectedGoal: 'fastest-490',
    ...o,
  };
};
/** Not on virtue: the save has no virtue farm and the kept plan starts with a fresh ascension. */
const freshPlan: NowPlan = { ...plan, planStart: START, end: START + 500 * H };
const offProps = (o: Record<string, unknown> = {}) => {
  const c = { ...card, plan: freshPlan };
  const events = planEvents(freshPlan, NOW);
  return cardProps({
    card: c,
    onVirtue: false,
    currentEgg: null,
    ascNow: 0,
    events,
    shownEvents: tableEvents(events),
    startInfo: startLines(
      [
        { key: 'fastest-490', name: 'Race to 490', goal: 'fastest', target: 490, plan: freshPlan },
        { key: 'eggday-2027', name: 'Egg Day 2027', goal: 'date', target: 490, plan: null },
      ],
      NOW,
      ZONE
    ),
    phase: null,
    ...o,
  });
};

describe('not on virtue yet', () => {
  it('says so plainly and leads with "When should I start?": no Next step, no events, no calendar', async () => {
    const html = await renderHtml(RightNowCard, offProps());
    const t = textOf(html);
    expect(t).toContain('Not on virtue yet');
    expect(html).toContain('data-testid="now-not-virtue-pill"');
    expect(t).toContain('When should I start? ›');
    expect(t).not.toContain('Next step');
    expect(html).not.toContain('data-testid="now-next"');
    expect(html).not.toContain('data-testid="now-events"');
    expect(t).not.toMatch(/\bAdd\b/);
    expect(t).not.toContain('calendar');
    // No badge and no Recalculate off virtue.
    expect(html).not.toContain('data-testid="now-phase"');
    expect(html).not.toContain('data-testid="now-recalc"');
  });

  it('the future plan as exploration, from what each goal saved; the switch, the route and the timeline stay', async () => {
    const html = await renderHtml(RightNowCard, offProps());
    const t = textOf(html);
    expect(t).toContain('If you start Oct 30 at 6:00 pm: 490 on Nov 20 at 1:00 pm (Race to 490, Check exactly)');
    expect(t).toContain('Egg Day 2027: no start time is priced yet');
    expect(t).toContain('If you start then: Following 198 → 490 (Race to 490)');
    expect(html).toContain('data-testid="now-goal-switch"');
    expect(t).toContain('Full timeline');
  });

  it('nothing saved: no start time is priced yet, and the same button', async () => {
    const t = textOf(
      await renderHtml(RightNowCard, offProps({ card: null, events: [], shownEvents: [], track: null, startInfo: [] }))
    );
    expect(t).toContain('Not on virtue yet');
    expect(t).toContain('No start time is priced yet for this save');
    expect(t).toContain('When should I start? ›');
    expect(t).not.toContain('Next step');
    expect(t).not.toContain('Work out my plan');
  });

  it('"When should I start?" opens Science › When should I start? on the plan\'s route (stores/startTimes.ts)', async () => {
    let setup: Record<string, unknown> = {};
    const onStartTimes = vi.fn();
    const app = createSSRApp({ render: () => h(RightNowCard, { ...offProps(), onStartTimes } as never) });
    app.mixin({
      created(this: { $: { type: { __file?: string }; setupState: Record<string, unknown> } }) {
        if (this.$.type.__file?.endsWith('/RightNowCard.vue')) setup = this.$.setupState;
      },
    });
    await renderToString(app);
    expect(setup.notOnVirtue).toBe(true);
    expect(read('RightNowCard.vue')).toContain(
      `@click="emit('startTimes', card?.plan.chain.length ? [...card.plan.chain] : null)"`
    );
    const view = read('../MyRunsView.vue');
    expect(view).toContain('@start-times="openStartTimes"');
    expect(view).toMatch(/if \(chain && chain\.length\) startTimes\.show\(chain\);\s*else startTimes\.open\(\);/);
    // The store: a route asked for, or the card's own pick; App watches `asked` and goes to #/science/start.
    const st = useStartTimesStore();
    st.show([198, 490]);
    expect(st.requested).toEqual([198, 490]);
    st.open();
    expect(st.requested).toBeNull();
    expect(st.asked).toBe(2);
    expect(read('../../App.vue')).toContain('watch(() => startTimes.asked, showStartTimes);');
  });

  it('null (not known yet) keeps the card as it was', async () => {
    const t = textOf(await renderHtml(RightNowCard, cardProps({ onVirtue: null, currentEgg: null })));
    expect(t).not.toContain('Not on virtue yet');
    expect(t).toContain('Next step');
  });
});

describe('the corner badge and the gear', () => {
  it("Building with the save's rate; Producing with the plan's, labelled projected", async () => {
    const b = await renderHtml(RightNowCard, cardProps({ phase: { phase: 'building', elr: 1e12, elrFrom: 'save' } }));
    expect(b).toContain('data-phase="building"');
    expect(textOf(b.match(/<span[^>]*data-testid="now-phase"[\s\S]*?<\/span>/)![0])).toBe('Building');
    // The rate sits smaller underneath the badge, on the egg's own line (16 Oct 2026, Jordan).
    expect(textOf(b.match(/<span[^>]*data-testid="now-phase-rate"[\s\S]*?<\/span>/)![0])).toMatch(/^.+\/hr · from your save$/);
    const p = textOf(
      await renderHtml(RightNowCard, cardProps({ phase: { phase: 'producing', elr: 2e12, elrFrom: 'projected' } }))
    );
    expect(p).toMatch(/Producing .+\/hr · projected/);
    const none = await renderHtml(RightNowCard, cardProps({ phase: null }));
    expect(none).not.toContain('data-testid="now-phase"');
  });

  it('Gear names the set equipped', async () => {
    const g = (match: unknown) =>
      renderHtml(GearBlock, {
        equipped: [],
        earnings: [],
        production: [],
        clothedEquipped: null,
        clothedEarnings: null,
        whatIf: null,
        goal: 'fastest',
        match,
      });
    expect(textOf(await g('earnings'))).toContain('Equipped now = your earnings set');
    expect(textOf(await g('production'))).toContain('Equipped now = your production set');
    expect(textOf(await g('mix'))).toContain('Equipped now = a mix');
    expect(textOf(await g(null))).toContain('Equipped now');
    expect(read('RightNowCard.vue')).toContain(':match="gear.match ?? null"');
  });
});

describe('Recalculate', () => {
  it('a button on Right now with a line saying what it does', async () => {
    const t = textOf(await renderHtml(RightNowCard, cardProps()));
    expect(t).toContain('Recalculate Opens Fastest with your save and runs Check exactly');
    const d = textOf(
      await renderHtml(
        RightNowCard,
        cardProps({
          card: { ...card, goal: { goal: 'date', target: 490, deadline: 1815753600 } },
          selectedGoal: 'eggday-2027',
        })
      )
    );
    expect(d).toContain('Opens By a date with your save and runs Check exactly');
    // Without a plan there is nothing to recalculate: "Work it out ›" is there.
    const empty = await renderHtml(RightNowCard, cardProps({ card: null, events: [], shownEvents: [], track: null }));
    expect(empty).not.toContain('data-testid="now-recalc"');
  });

  it("emits the goal's screen and its words; App loads a fresh save when 6 h old, opens, then asks", async () => {
    let setup: Record<string, unknown> = {};
    const app = createSSRApp({ render: () => h(RightNowCard, cardProps() as never) });
    app.mixin({
      created(this: { $: { type: { __file?: string }; setupState: Record<string, unknown> } }) {
        if (this.$.type.__file?.endsWith('/RightNowCard.vue')) setup = this.$.setupState;
      },
    });
    await renderToString(app);
    expect(setup.recalcRequest).toEqual({ open: { auto: 'fastest', depth: 'smart', target: 490 }, goal: 'target 490' });
    expect(read('../MyRunsView.vue')).toContain(`@recalc="req => emit('recalc', req)"`);
    const appSrc = read('../../App.vue');
    expect(appSrc).toContain('@recalc="recalcFromMyRuns"');
    expect(appSrc).toMatch(
      /if \(needsFreshSave\(backupSecondsOf\(initialStateStore\.rawBackup\), Date\.now\(\) \/ 1000\)\) \{\s*const why = await prepareAutoPlanner\(\);[\s\S]*?openFromMyRuns\(req\.open\);\s*uiStore\.askExact\(req\.goal, req\.chain\);/
    );
  });

  it('the ask: counted, and answered by InstantRoute with its Check exactly action', () => {
    const ui = useUIStore();
    ui.askExact('target 490');
    ui.askExact('target 490');
    expect(ui.exactAsk).toEqual({ goal: 'target 490', n: 2 });
    const route = read('../auto/InstantRoute.vue');
    expect(route).toContain('goal: instantGoal(props.deadline, store.finalTE),');
    expect(route).toMatch(
      /if \(step === 'none' \|\| step === 'wait'\) return;[\s\S]*?ui\.exactAsk = null;\s*if \(step === 'run'\) checkAgain\(\);/
    );
  });
});
