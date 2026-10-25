/**
 * My runs' Next steps component (lib/myRunsDashboard.ts builds what it shows; reworked 24 Oct 2026, the six cards gone).
 * Rendered on the server; a button's click is its handler called through the component's setup state.
 */
import { describe, expect, it, vi } from 'vitest';
import { createSSRApp, h, type Component } from 'vue';
import { renderToString } from 'vue/server-renderer';
import DashboardGaps from './DashboardGaps.vue';
import { textOf } from '@/test/renderComponent';
import { STEPS_SHOWN, type DashStep, type DashSteps } from '@/lib/myRunsDashboard';

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

const step = (id: string, over: Partial<DashStep> = {}): DashStep => ({
  id,
  kinds: ['beaten'],
  text: `Item ${id}`,
  reason: `Why ${id}.`,
  button: 'Show me',
  action: { to: 'right-now', goalKey: 'fastest-490' },
  ...over,
});
const state = (steps: DashStep[]): DashSteps => ({ steps });

describe('DashboardGaps', () => {
  it('each item: its text, a one-line reason and one button (44 px on a phone); the button sends the item\u2019s action', async () => {
    const onAct = vi.fn();
    const s = step('save', {
      kinds: ['save'],
      text: 'Your save is 4 days old',
      reason: 'Every plan on this page starts from it. Load a fresh one so your next step starts from where you are.',
      button: 'Load a fresh one',
      action: { to: 'fresh' },
    });
    const { html, setup } = await render(DashboardGaps, '/DashboardGaps.vue', { state: state([s]), onAct });
    const t = textOf(html);
    expect(t).toContain('Next steps');
    expect(t).toContain('Your save is 4 days old Every plan on this page starts from it.');
    const item = html.slice(html.indexOf('data-testid="my-runs-step-save"'));
    expect(item.match(/<button/g)?.length).toBe(1);
    expect(item).toContain('min-h-[44px]');
    (setup.act as (s: DashStep) => void)(s);
    expect(onAct).toHaveBeenCalledWith({ to: 'fresh' });
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

  it('nothing to change: one calm line', async () => {
    const t = textOf((await render(DashboardGaps, '/DashboardGaps.vue', { state: state([]) })).html);
    expect(t).toContain('Nothing to change: keep following your route.');
    expect(t).not.toContain('Checking your runs');
  });
});
