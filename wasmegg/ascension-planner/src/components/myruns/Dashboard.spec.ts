/**
 * My runs' summary components: the six cards and Next steps (lib/myRunsDashboard.ts builds what they show).
 * Rendered on the server; a button's click is its handler called through the component's setup state.
 */
import { describe, expect, it, vi } from 'vitest';
import { createSSRApp, h, type Component } from 'vue';
import { renderToString } from 'vue/server-renderer';
import DashboardCards from './DashboardCards.vue';
import DashboardGaps from './DashboardGaps.vue';
import { textOf } from '@/test/renderComponent';
import { STEPS_SHOWN, type DashCard, type DashStep, type DashSteps } from '@/lib/myRunsDashboard';

type Setup = Record<string, unknown>;
async function render(
  comp: Component,
  file: string,
  props: Record<string, unknown>
): Promise<{ html: string; setup: Setup }> {
  let setup: Setup = {};
  const app = createSSRApp({ render: () => h(comp, props) });
  app.mixin({
    created(this: { $: { type: { __file?: string }; setupState: Setup } }) {
      if (this.$.type.__file?.endsWith(file)) setup = this.$.setupState;
    },
  });
  const html = await renderToString(app);
  return { html, setup };
}

const card = (over: Partial<DashCard>): DashCard => ({
  id: 'saved',
  title: 'Saved',
  main: '1 answer, 0 runs',
  lines: [],
  ...over,
});
const step = (id: string, over: Partial<DashStep> = {}): DashStep => ({
  id,
  kinds: ['moved'],
  text: `Item ${id}`,
  reason: `Why ${id}.`,
  button: 'Run again',
  action: { to: 'fastest', target: 490, tab: 'nearby' },
  ...over,
});
const state = (steps: DashStep[], over: Partial<DashSteps> = {}): DashSteps => ({
  loading: false,
  noRuns: false,
  steps,
  ...over,
});

describe('DashboardCards', () => {
  it('shows each card’s title, figure and lines, two columns on a phone and six in a row from lg', async () => {
    const { html } = await render(DashboardCards, '/DashboardCards.vue', {
      cards: [
        card({
          id: 'eggday',
          title: 'Egg Day 2027',
          main: '251 TE',
          lines: ['48.0 h spare', '200 240 251', 'sent Oct 14'],
        }),
        card({ id: 'race', title: 'Race to 490', main: 'Jan 22, 2027', lines: ['4 ascensions'], maybe: true }),
      ],
    });
    const t = textOf(html);
    expect(html).toContain('grid grid-cols-2 lg:grid-cols-6');
    expect(t).toContain('Egg Day 2027 251 TE 48.0 h spare 200 240 251 sent Oct 14');
    expect(html).toMatch(/font-mono[^>]*>\s*200 240 251/);
    // Only the look-alike's card says so.
    const race = html.slice(html.indexOf('my-runs-card-race'));
    expect(race).toContain('looks like yours');
    expect(html.slice(0, html.indexOf('my-runs-card-race'))).not.toContain('looks like yours');
  });

  it('an empty card’s one button sends its action', async () => {
    const onAct = vi.fn();
    const to = { to: 'by-date', deadline: 1, eggDay: true, tab: 'nearby' } as const;
    const c = card({
      id: 'eggday',
      title: 'Egg Day 2027',
      main: 'None yet',
      empty: true,
      action: { label: 'Find it', to },
    });
    const { html, setup } = await render(DashboardCards, '/DashboardCards.vue', { cards: [c], onAct });
    expect(html).toContain('data-testid="my-runs-card-eggday-action"');
    expect(textOf(html)).toContain('None yet Find it');
    (setup.act as (c: DashCard) => void)(c);
    expect(onAct).toHaveBeenCalledWith(to);
  });
});

describe('DashboardGaps', () => {
  it('each item: its text, a one-line reason and one button; the button sends the item’s action', async () => {
    const onAct = vi.fn();
    const s = step('eggday', {
      text: 'No Egg Day 2027 run yet',
      reason: 'Nothing sent, saved or waiting to send for 14 July, 9 am Pacific.',
      button: 'Find my Egg Day answer',
      action: { to: 'by-date', deadline: 1, eggDay: true, tab: 'nearby' },
    });
    const { html, setup } = await render(DashboardGaps, '/DashboardGaps.vue', { state: state([s]), onAct });
    const t = textOf(html);
    expect(t).toContain('Next steps');
    expect(t).toContain(
      'No Egg Day 2027 run yet Nothing sent, saved or waiting to send for 14 July, 9 am Pacific. Find my Egg Day answer'
    );
    const item = html.slice(html.indexOf('data-testid="my-runs-step-eggday"'));
    expect(item.match(/<button/g)?.length).toBe(1);
    (setup.act as (s: DashStep) => void)(s);
    expect(onAct).toHaveBeenCalledWith({ to: 'by-date', deadline: 1, eggDay: true, tab: 'nearby' });
  });

  it(`shows ${STEPS_SHOWN} and folds the rest under "n more"`, async () => {
    const steps = Array.from({ length: STEPS_SHOWN + 2 }, (_, i) => step(`s${i}`));
    const { html } = await render(DashboardGaps, '/DashboardGaps.vue', { state: state(steps) });
    const fold = html.indexOf('data-testid="my-runs-steps-more"');
    expect(fold).toBeGreaterThan(-1);
    expect(textOf(html)).toContain('2 more');
    expect(html.indexOf(`my-runs-step-s${STEPS_SHOWN - 1}"`)).toBeLessThan(fold);
    expect(html.indexOf(`my-runs-step-s${STEPS_SHOWN}"`)).toBeGreaterThan(fold);
  });

  it('nothing to flag: one calm line; loading: says so; no runs at all: how runs get here', async () => {
    expect(textOf((await render(DashboardGaps, '/DashboardGaps.vue', { state: state([]) })).html)).toContain(
      'Nothing to flag: your runs look current.'
    );
    const loading = textOf(
      (await render(DashboardGaps, '/DashboardGaps.vue', { state: state([], { loading: true }) })).html
    );
    expect(loading).toContain('Checking your runs on the board…');
    expect(loading).not.toContain('Nothing to flag');
    const none = textOf(
      (await render(DashboardGaps, '/DashboardGaps.vue', { state: state([step('eggday')], { noRuns: true }) })).html
    );
    expect(none).toContain('Item eggday');
    expect(none).toContain('Run a search on');
    expect(none).not.toContain('Nothing to flag');
  });

  it('an information item (hidden runs) is set apart from the ones to fix', async () => {
    const { html } = await render(DashboardGaps, '/DashboardGaps.vue', {
      state: state([step('hidden', { info: true, button: 'See them', action: { to: 'board' } })]),
    });
    expect(html).toContain('ⓘ');
    expect(html).not.toContain('☐');
  });
});
