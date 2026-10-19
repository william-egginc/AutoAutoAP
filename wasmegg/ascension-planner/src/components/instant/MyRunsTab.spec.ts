/**
 * The My runs tab and the instant answer's pieces, rendered on the server (vue/server-renderer; Joo's
 * repo has no component test library): what a player sees before any worker runs.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createPinia, setActivePinia } from 'pinia';
import { useInitialStateStore } from '@/stores/initialState';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { TE_BREAKPOINTS } from '@/lib/truthEggs';
import type { AnswerRow } from '@/instant/instantAnswer';
import type { PlanEntry } from '@/instant/plansOnDevice';
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

  it('Your plans on this device, after the instant answer: empty', async () => {
    const html = await render(MyRunsTab, { plans: [] }, loadSave);
    expect(html).toContain('Your plans on this device');
    expect(html).toContain('Kept in this browser only; nothing is sent anywhere.');
    expect(html).toContain('No plans yet: press Simulate this plan on a route above.');
    expect(html).not.toContain('data-testid="plans-clear"');
    expect(html.indexOf('data-testid="instant-answer"')).toBeLessThan(html.indexOf('data-testid="plans-on-device"'));
  });

  it('Your plans on this device: one card per plan, with Simulate again and Clear', async () => {
    const T = Date.parse('2027-01-04T17:00:00Z') / 1000;
    const plans: PlanEntry[] = [
      { chain: [300, 400, 490], goal: 'Race to 490', simulatedAt: T * 1000, start: T, a1: '2-sale', finishAt: T + 12.25 * 86400, days: 12.25 },
      { chain: [350, 470], goal: 'Egg Day 2027', simulatedAt: (T - 3600) * 1000, start: T, a1: 'continue', finishAt: T + 30 * 86400, te: 470 },
    ];
    const html = await render(MyRunsTab, { plans, playerId: 'EI1234567890123456' }, loadSave);
    expect(html.match(/data-testid="plan-entry"/g)).toHaveLength(2);
    expect(html.match(/data-testid="plan-again"/g)).toHaveLength(2);
    expect(html).toContain('data-testid="plans-clear"');
    expect(html).toContain('300 → 400 → 490');
    expect(html).toContain('Race to 490');
    expect(html).toContain('12.3 d');
    expect(html).toContain('Egg Day 2027');
    expect(html).toContain('470 TE, last ascension');
    // 12-hour times in the planner's timezone (Denver): simulated 10:00 am.
    expect(html).toMatch(/Simulated Jan 4, 2027, 10:00\s?AM/);
    expect(html).not.toContain('EI1234567890123456');
    expect(html).not.toContain('No plans yet');
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

  it('on a phone: one card per route, the stops wrapped, a full-width 44 px Simulate; the table only from 640 px', async () => {
    const html = await render(InstantRows, { rows, dated: false, timezone: 'America/Denver' });
    expect(html.match(/data-testid="instant-card"/g)).toHaveLength(2);
    expect(html.match(/data-testid="instant-card-simulate"/g)).toHaveLength(2);
    expect(html).toMatch(/class="w-full min-h-\[44px\][^"]*" data-testid="instant-card-simulate"/);
    expect(html).toMatch(/class="sm:hidden[^"]*" data-testid="instant-cards"/);
    expect(html).toContain('class="hidden sm:block overflow-x-auto"');
    expect(html).toContain('break-words');
  });

  it('By a date says the TE reached', async () => {
    const html = await render(InstantRows, { rows, dated: true, timezone: 'UTC' });
    expect(html).toContain('TE by then');
    expect(html).toContain('490 TE');
  });
});

describe('the instant answer card (source)', () => {
  const src = readFileSync(fileURLToPath(new URL('./InstantAnswer.vue', import.meta.url)), 'utf8');

  it('reads the save from the raw backup, never the live farm Joo’s continue load rewrites', () => {
    expect(src).not.toContain('currentFarmState');
    expect(src).not.toContain('createBaseEngineState');
    expect(src).toContain('farmFromBackup(');
    expect(src).toContain('eggsDeliveredFromBackup(');
    expect(src).toContain('baseStateFromBackup(');
  });

  it('keeps the page’s one worker across visits (no terminate on unmount)', () => {
    expect(src).not.toContain('terminate');
    expect(src).not.toContain('new Worker');
  });

  it('says the Auto Planner is the exact check and can differ either way, by a fraction of a percent', () => {
    const words = src.replace(/\s+/g, ' ');
    expect(words).not.toContain('a little sooner');
    expect(words).not.toContain('by days');
    expect(words).toContain(
      'The Auto Planner is the exact check (“Simulate this plan”): its dates can differ from these by a fraction of a percent, earlier or later.'
    );
  });

  it('the date field and the goal pills are 44 px tall on a phone', () => {
    expect(src).toMatch(/type="date"\s+class="[^"]*max-sm:min-h-\[44px\]/);
    expect(src).toMatch(/max-sm:min-h-\[44px\][^"]*"\s+:class="goal === g.value/);
  });
});

describe('no instant answer', () => {
  it('By a date: asks for a date, or says it has passed', () => {
    expect(noAnswerWords({ kind: 'pick-date' }).heading).toBe('Pick a date.');
    expect(noAnswerWords({ kind: 'date-passed' }).heading).toBe('That date has passed: pick a later one.');
  });

  it('says the table is still being built, with no quick-estimate button', async () => {
    const html = await render(NoInstantAnswer, { reason: { kind: 'no-table' } });
    expect(html).toContain('the table for this simulator is still being built');
    expect(html).not.toContain('<button');
    expect(noAnswerWords({ kind: 'other-sim', why: 'built with another simulator (x)' }).sub).toContain('another simulator');
    expect(noAnswerWords({ kind: 'below', from: 75, te: 60 }).heading).toBe('No instant answer below TE 75.');
  });
});
