/**
 * The My runs tab and the instant answer's pieces, rendered on the server (vue/server-renderer; Joo's
 * repo has no component test library): what a player sees before any worker runs.
 */
import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createPinia, setActivePinia } from 'pinia';
import { useInitialStateStore } from '@/stores/initialState';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { TE_BREAKPOINTS } from '@/lib/truthEggs';
import type { AnswerRow } from '@/instant/instantAnswer';
import MyRunsTab from './MyRunsTab.vue';
import InstantRows from './InstantRows.vue';
import NoInstantAnswer, { noAnswerWords } from './NoInstantAnswer.vue';

async function render(component: object, props: Record<string, unknown> = {}, setup?: () => void): Promise<string> {
  const pinia = createPinia();
  setActivePinia(pinia);
  setup?.();
  const app = createSSRApp({ render: () => h(component, props) });
  app.use(pinia);
  return renderToString(app);
}

describe('My runs tab (server render)', () => {
  const loadSave = () => {
    const s = useInitialStateStore();
    s.hasData = true;
    s.initialEggsDelivered = {
      curiosity: TE_BREAKPOINTS[49],
      kindness: TE_BREAKPOINTS[49],
      integrity: TE_BREAKPOINTS[49],
      resilience: TE_BREAKPOINTS[49],
      humility: TE_BREAKPOINTS[49],
    };
    useAutoPlannerStore().timezone = 'America/Denver';
  };

  it('shows the instant answer, from the save’s TE, and nothing from the board', async () => {
    const html = await render(MyRunsTab, {}, loadSave);
    expect(html).toContain('data-testid="instant-answer"');
    expect(html).toContain('From your TE 250, any hour');
    expect(html).not.toContain('board');
  });

  it('offers the three goals: Fastest to 490, Egg Day, another date', async () => {
    const html = await render(MyRunsTab, {}, loadSave);
    expect(html).toContain('Fastest to 490');
    expect(html).toMatch(/Egg Day 20\d\d/);
    expect(html).toContain('Another date');
  });
});

describe('the instant answer’s rows (server render)', () => {
  const leg = (from: number, to: number, start: number, end: number) => ({
    from,
    to,
    endTE: to,
    start,
    end,
    sales: 2,
    tier13: false,
    label: '2-sale',
  });
  const T = Date.parse('2027-01-04T17:00:00Z') / 1000;
  const rows: AnswerRow[] = [
    {
      ascensions: 1,
      route: { chain: [490], legs: [leg(250, 490, T, T + 20 * 86400)], end: T + 20 * 86400, seconds: 20 * 86400 },
      endTE: 490,
      best: false,
    },
    {
      ascensions: 2,
      route: {
        chain: [300, 490],
        legs: [leg(250, 300, T, T + 5 * 86400), leg(300, 490, T + 5 * 86400, T + 15 * 86400)],
        end: T + 15 * 86400,
        seconds: 15 * 86400,
      },
      endTE: 490,
      best: true,
    },
  ];

  it('one row per count, the best marked, each with Simulate this plan', async () => {
    const html = await render(InstantRows, { rows, dated: false, timezone: 'America/Denver' });
    expect(html.match(/data-testid="instant-row"/g)).toHaveLength(2);
    expect(html.match(/data-testid="instant-simulate"/g)).toHaveLength(2);
    expect(html).toContain('300 → 490');
    expect(html).toContain('15.0 d');
    expect(html).toContain('best');
    // 12-hour times, in the planner's timezone.
    expect(html).toMatch(/Jan 19, 2027, 10:00\s?AM/);
  });

  it('By a date says the TE reached', async () => {
    const html = await render(InstantRows, { rows, dated: true, timezone: 'UTC' });
    expect(html).toContain('TE by then');
    expect(html).toContain('490 TE');
  });
});

describe('no instant answer', () => {
  it('says the table is still being built, with no quick-estimate button', async () => {
    const html = await render(NoInstantAnswer, { reason: { kind: 'no-table' } });
    expect(html).toContain('the table for this simulator is still being built');
    expect(html).not.toContain('<button');
    expect(noAnswerWords({ kind: 'other-sim', why: 'built with another simulator (x)' }).sub).toContain('another simulator');
    expect(noAnswerWords({ kind: 'below', from: 75, te: 60 }).heading).toBe('No instant answer below TE 75.');
  });
});
