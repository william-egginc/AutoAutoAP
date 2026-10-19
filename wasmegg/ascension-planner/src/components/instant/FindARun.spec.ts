/**
 * Find a run, rendered on the server (vue/server-renderer; Joo's
 * repo has no component test library): what a player sees before any worker runs, the rows and an
 * opened row. Plus source checks of the card and of App.vue's tabs.
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
import FindARun from './FindARun.vue';
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
/** The text a player reads (tags dropped, spaces folded). */
const text = (html: string) => html.replace(/<!--.*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/\s+/g, ' ');

const ID = 'EI1234567890123456';
const SAVE = Date.parse('2026-10-19T14:03:00Z') / 1000; // Oct 19, 7:03 am Pacific

const loadSave = () => {
  const s = useInitialStateStore();
  s.hasData = true;
  s.lastBackupTime = SAVE;
  s.initialEggsDelivered = {
    curiosity: TE_BREAKPOINTS[49],
    kindness: TE_BREAKPOINTS[49],
    integrity: TE_BREAKPOINTS[49],
    resilience: TE_BREAKPOINTS[49],
    humility: TE_BREAKPOINTS[49],
  };
  useAutoPlannerStore().timezone = 'America/Los_Angeles';
};

describe('Find a run (server render)', () => {
  it('in order: I want to…, the setup line, the disabled filters, the rows, the blurb', async () => {
    const html = await render(FindARun, { plans: [] }, loadSave);
    const order = ['find-goal', 'find-setup', 'find-filters', 'find-results', 'find-blurb'].map(t =>
      html.indexOf(`data-testid="${t}"`)
    );
    expect(order.every(i => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('goal switch: Reach 490 TE | Get the most TE by a date, Egg Day by default', async () => {
    const html = await render(FindARun, { plans: [] }, loadSave);
    const t = text(html);
    expect(t).toContain('I want to…');
    expect(t).toContain('Reach 490 TE');
    expect(t).toContain('Get the most TE by a date');
    expect(html).toMatch(/value="20\d\d-07-14"/);
    expect(t).toMatch(/Egg Day 20\d\d, 9:00 am Pacific/);
    expect(t).toMatch(/Your best runs by Egg Day 20\d\d/);
    expect(html).toMatch(/bg-indigo-600[^"]*" data-testid="instant-goal-date"/);
  });

  it('the setup line: the save’s time (12-hour), any hour, no time off, Edit setup', async () => {
    const t = text(await render(FindARun, { plans: [] }, loadSave));
    expect(t).toMatch(/Using your save of Oct 19 at 7:03 am \((just now|\d+ (minute|minutes|hour|hours|day|days) ago)\) · setup: any hour, no time off · Edit setup/);
  });

  it('the filters are built and disabled, with the note', async () => {
    const html = await render(FindARun, { plans: [] }, loadSave);
    const t = text(html);
    expect(html).toMatch(/<fieldset disabled[^>]*aria-disabled="true"/);
    expect(html).toMatch(/aria-disabled="true" data-testid="find-filters"/);
    expect(t).toContain('Ascensions');
    expect(html).toMatch(/<option selected>4<\/option>/);
    expect(html).toMatch(/<option selected>9<\/option>/);
    expect(t).toContain('No ascension starts between 10 pm and 5 am');
    expect(t).toContain('Avoid dates');
    expect(t).toContain('your gear');
    expect(t).toContain("Filters are coming: they need Joo's planner to support playing hours. For now every row is any hour.");
  });

  it('the blurb as plain text; no explore, fastest, How sure, board or old plans list', async () => {
    const html = await render(FindARun, { plans: [], playerId: ID }, loadSave);
    const t = text(html);
    expect(t).toContain('Want to dive deeper? Go to egg.williamstest.fyi. Note: it may not be up.');
    expect(html).not.toContain('href="https://egg.williamstest.fyi');
    expect(t).not.toMatch(/Explore more/);
    expect(t).not.toMatch(/fastest/i);
    expect(t).not.toContain('How sure');
    expect(t).not.toContain('board');
    expect(t).not.toContain('Your plans on this device');
    expect(html).not.toContain(ID);
  });
});

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
const T = Date.parse('2027-01-04T17:00:00Z') / 1000; // Mon Jan 4, 9:00 am Pacific
const rows: AnswerRow[] = [
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
  {
    ascensions: 1,
    route: { chain: [490], legs: [leg(250, 490, T, T + 20 * 86400)], end: T + 20 * 86400, seconds: 20 * 86400 },
    endTE: 490,
    best: false,
  },
];

describe('Find a run’s rows (server render)', () => {
  it('a row: arrow, "2 asc", the stops, the finish (12-hour), the best or days behind', async () => {
    const html = await render(InstantRows, { rows, dated: false, timezone: 'America/Los_Angeles' });
    const t = text(html);
    expect(html.match(/data-testid="find-row"/g)).toHaveLength(2);
    expect(t).toContain('▸ 2 asc 300 490 Jan 19, 2027 at 9:00 am · the best');
    expect(t).toContain('▸ 1 asc 490 Jan 24, 2027 at 9:00 am · 5 days behind');
    expect(html).not.toContain('data-testid="find-open"');
    expect(html).toContain('min-h-[44px]');
  });

  it('by a date: the TE, and "N TE behind"', async () => {
    const dated = [{ ...rows[0], endTE: 248 }, { ...rows[1], endTE: 245, best: false }];
    const t = text(await render(InstantRows, { rows: dated, dated: true, timezone: 'UTC' }));
    expect(t).toContain('248 TE · ');
    expect(t).toContain('· the best');
    expect(t).toContain('· 3 TE behind');
  });

  it('an opened row: Ascension, Starts, Ends (estimate) and the buttons, the placeholders disabled', async () => {
    const html = await render(InstantRows, { rows, dated: false, timezone: 'America/Los_Angeles', opened: 2 });
    const t = text(html);
    expect(html.match(/data-testid="find-open"/g)).toHaveLength(1);
    expect(t).toContain('▾ 2 asc');
    expect(t).toContain('Ascension Starts Ends');
    expect(t).toContain('1 · 300 TE Mon, Jan 4 at 9:00 am Sat, Jan 9 at 9:00 am');
    expect(t).toContain('2 · 490 TE Sat, Jan 9 at 9:00 am Tue, Jan 19 at 9:00 am');
    expect(t).toContain('estimate');
    expect(t).toContain('Import into the planner ›');
    expect(t).toContain('Save this plan');
    expect(html).toMatch(/<button type="button" disabled aria-disabled="true" title="Coming next"[^>]*data-testid="find-check-exactly">\s*Check exactly/);
    expect(html).toMatch(/<button type="button" disabled aria-disabled="true" title="Coming next"[^>]*data-testid="find-calendar">\s*Add shifts to calendar/);
    // Phone: the buttons stack full width, 44 px.
    expect(html).toContain('flex flex-col sm:flex-row');
    expect(html.match(/w-full sm:w-auto min-h-\[44px\]/g)).toHaveLength(4);
  });

  it('a saved route says Saved ✓', async () => {
    const t = text(await render(InstantRows, { rows, dated: false, timezone: 'UTC', opened: 2, saved: ['300 490'] }));
    expect(t).toContain('Saved ✓');
    expect(t).not.toContain('Save this plan');
  });
});

describe('the card and the tabs (source)', () => {
  const src = readFileSync(fileURLToPath(new URL('./InstantAnswer.vue', import.meta.url)), 'utf8');
  const app = readFileSync(fileURLToPath(new URL('../../App.vue', import.meta.url)), 'utf8');

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
    expect(words).not.toContain('by days');
    expect(words).toContain('The Auto Planner is the exact check (“Import into the planner”)');
    expect(words).toContain(
      '<template v-else>: its dates can differ from these by a fraction of a percent, earlier or later.</template>'
    );
  });

  it('below TE 340 with other gear, says the answer can be a few percent off instead (gearDiffers.ts)', () => {
    expect(src).toMatch(/v-if="gearCaveat"[^>]*data-testid="instant-gear-differs"/);
    expect(src).toContain('<template v-if="gearCaveat">.</template');
  });

  it('Import into the planner records nothing; only Save this plan saves', () => {
    const simulate = src.slice(src.indexOf('function simulate('), src.indexOf('function save('));
    expect(simulate).not.toMatch(/recordPlan|entryFromRow|emit\(\s*'save'/);
  });

  it('the date field and the goal pills are 44 px tall on a phone', () => {
    expect(src).toMatch(/type="date"\s+class="[^"]*max-sm:min-h-\[44px\]/);
    expect(src).toMatch(/max-sm:min-h-\[44px\][^"]*"\s+:class="goal === g.value/);
  });

  it('App.vue: the tabs are Manual Planner, Auto Planner, Find a run (no My runs)', () => {
    expect(app).toMatch(/>\s*Find a run\s*</);
    expect(app).not.toMatch(/>\s*My runs\s*</);
    expect(app).toContain('<FindARun ');
    expect(app).not.toContain('MyRunsTab');
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
