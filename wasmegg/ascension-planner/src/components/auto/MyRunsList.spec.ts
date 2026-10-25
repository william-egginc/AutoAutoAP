/**
 * My runs' list (MyRunsList.vue): every kind and target by default, hidden runs tagged "hidden" with Show
 * again in their details, and the filters folded under one line on a phone. Rendered on the server (no
 * DOM): an opened row is the component's `open` ref set before it renders.
 */
import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import MyRunsList from './MyRunsList.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import { HIDE_CONTROL, type HideControl } from '@/lib/hiddenRuns';
import type { BoardRow } from '@/lib/leaderboardRank';
import { myRunsCount } from '@/lib/myRuns';
import { EGG_DAY as MIX_EGG_DAY, mix } from '@/test/myRunsMix';

const EGG_DAY = 1_815_840_000;
const OTHER_DATE = 1_800_000_000;

const rows: BoardRow[] = [
  {
    id: 'egg1',
    chain: [200, 250, 320],
    finalTE: 320,
    durationDays: 200,
    deadline: EGG_DAY,
    deadlineAscendAt: EGG_DAY - 5 * 3600,
    startUtc: '2026-10-01T00:00:00Z',
    submittedAt: '2026-10-10T00:00:00Z',
    timezone: 'UTC',
    hasCsv: true,
    yours: true,
  },
  {
    id: 'race1',
    chain: [300, 490],
    finalTE: 490,
    durationDays: 20,
    startUtc: '2026-10-01T00:00:00Z',
    submittedAt: '2026-10-09T00:00:00Z',
    timezone: 'UTC',
    window: 'every day 07:00-23:00 UTC',
    hasCsv: true,
    yours: true,
    hidden: true,
  },
  {
    id: 'date1',
    chain: [280],
    finalTE: 280,
    durationDays: 5,
    deadline: OTHER_DATE,
    deadlineAscendAt: OTHER_DATE - 3600,
    startUtc: '2026-10-01T00:00:00Z',
    submittedAt: '2026-10-08T00:00:00Z',
    timezone: 'UTC',
  },
];

const base = { rows, csvRoot: 'https://collector.test/csv', viewZone: 'UTC', eggDayAt: EGG_DAY, eggDayYear: 2027 };

const hide: HideControl = {
  isMine: id => id === 'egg1' || id === 'race1',
  isHidden: id => id === 'race1',
  isBusy: () => false,
  setHidden: async () => {},
  downloadCsv: async () => {},
};

async function renderWith(props: Record<string, unknown>, setup: Record<string, unknown> = {}): Promise<string> {
  const app = createSSRApp({ render: () => h(MyRunsList, { ...base, ...props }) });
  app.provide(HIDE_CONTROL, hide);
  app.mixin({
    created(this: { $: { type: { __file?: string }; setupState: Record<string, unknown> } }) {
      if (this.$.type.__file?.endsWith('/MyRunsList.vue')) Object.assign(this.$.setupState, setup);
    },
  });
  return renderToString(app);
}

describe('MyRunsList (My runs › Your runs on the board)', () => {
  it('shows every kind by default, Egg Day first, then other dates, then races', async () => {
    const html = await renderWith({});
    const t = textOf(html);
    expect(html.match(/data-testid="my-runs-row"/g)).toHaveLength(3);
    const egg = t.indexOf('Egg Day 2027');
    const date = t.indexOf('By ');
    const race = t.indexOf('Fastest to 490 TE');
    expect(egg).toBeGreaterThan(-1);
    expect(egg).toBeLessThan(date);
    expect(date).toBeLessThan(race);
    expect(t).toContain('320 TE, 5.0 h spare');
    expect(t).toContain('finishes');
  });

  it('every date is month first with its year ("Feb 10, 2027"), and a tooltip adds the 12-hour clock', async () => {
    const html = await renderWith({});
    const t = textOf(html);
    // The By label, a finish and the Sent column.
    expect(t).toContain('By Jan 15, 2027');
    expect(t).toContain('finishes Oct 21, 2026');
    expect(t).toContain('Oct 10, 2026');
    expect(t).toContain('Oct 8, 2026');
    // Their tooltips.
    expect(html).toContain('title="The highest TE this answer reaches by Jan 15, 2027 at 8:00 am"');
    expect(html).toContain('title="Oct 21, 2026 at 12:00 am, UTC time"');
    expect(html).toContain('title="Oct 10, 2026 at 12:00 am"');
    // Never day first.
    expect(t).not.toMatch(/\b\d+ [A-Z][a-z]{2} 20\d\d\b/);
    expect(html).not.toMatch(/title="[^"]*\b\d+ [A-Z][a-z]{2} 20\d\d/);
  });

  it('a hidden run is listed, tagged "hidden", and its CSV is fetched with the code (no plain link)', async () => {
    const html = await renderWith({});
    expect(html.match(/data-testid="my-runs-hidden-tag"/g)).toHaveLength(1);
    expect(html).not.toContain('csv?id=race1');
    expect(html).toContain('csv?id=egg1');
  });

  it('a run matched by timezone and artifacts only is tagged "maybe you"', async () => {
    const t = textOf(await renderWith({}));
    expect(t.match(/maybe you/g)).toHaveLength(1);
  });

  it("opened, a hidden run offers Show again (LeaderboardRunDetail with the board's hide control)", async () => {
    const t = textOf(await renderWith({}, { open: 'race1' }));
    expect(t).toContain('Hidden from the public · Show again');
  });

  it('with fewer than 4 runs there is no chip bar, and a remembered pick narrows nothing', async () => {
    const html = await renderWith({ initialExplore: { asc: [12], stops: '200 250' } });
    expect(html).not.toContain('data-testid="runs-explore"');
    expect(html.match(/data-testid="my-runs-row"/g)).toHaveLength(3);
    // The old selects are gone (no fold on a phone, no inline copy).
    expect(html).not.toContain('my-runs-filters-fold');
    expect(html).not.toContain('my-runs-filters-inline');
  });

  it('says so when there are no runs at all', async () => {
    const none = await renderHtml(MyRunsList, { ...base, rows: [] });
    expect(none).toContain('data-testid="my-runs-none"');
    expect(none).not.toContain('data-testid="runs-explore"');
  });
});

describe('MyRunsList with a realistic mix (16 Oct: "Showing 0 of 25" under Kind = All)', () => {
  const rows = mix();
  const realistic = {
    rows,
    csvRoot: 'https://collector.test/csv',
    viewZone: 'UTC',
    eggDayAt: MIX_EGG_DAY,
    eggDayYear: 2027,
  };
  const render = (initialFilters?: Record<string, unknown>) =>
    renderHtml(MyRunsList, { ...realistic, ...(initialFilters ? { initialFilters } : {}) });

  it('the default filters list every run, one line per result, and say how the sends differ', async () => {
    const html = await render();
    const t = textOf(html);
    expect(html.match(/data-testid="my-runs-row"/g)).toHaveLength(25);
    expect(html).not.toContain('data-testid="my-runs-none-shown"');
    expect(t).toContain(
      '25 runs. 27 sends in all: a run sent more than once is one line (sent ×n), its copies inside.'
    );
    expect(t).not.toContain('Showing');
    expect(t.match(/sent ×2/g)).toHaveLength(2);
    expect(t).toContain('hidden');
    expect(t).toContain('maybe you');
    expect(t).toContain('Egg Day 2027');
    expect(t).toContain('Fastest to 490 TE');
    expect(t).toContain('Fastest to 300 TE');
    // Month first with the year (Jordan, 24 Oct 2026): "By Feb 10, 2027", never "By 10 Feb 2027".
    expect(t).toMatch(/By [A-Z][a-z]{2} \d+, 2027/);
    expect(t).not.toMatch(/\b\d+ [A-Z][a-z]{2} 20\d\d\b/);
  });

  it('the header and the list count the same: runs, a result sent twice once (myRunsCount)', () => {
    expect(myRunsCount(rows)).toBe(25);
  });

  const NOW = Date.parse('2026-10-12T18:00:00Z');
  const renderX = (initialExplore?: Record<string, unknown>) =>
    renderHtml(MyRunsList, { ...realistic, nowMs: NOW, ...(initialExplore ? { initialExplore } : {}) });

  it('the chip bar shows every value the runs have, and "25 of 25 runs" with no Clear filters', async () => {
    const html = await renderX();
    const t = textOf(html);
    expect(html).toContain('data-testid="runs-explore"');
    expect(t).toContain('25 of 25 runs');
    expect(html).not.toContain('data-testid="runs-explore-clear"');
    // Goal: the planner's 490 first, every other target as one chip, Egg Day, other dates; with how many runs each.
    expect(t).toContain('Goal Fastest to 490 TE 8 Other targets 6 Egg Day 2027 5 Other dates 6');
    expect(t).toMatch(/Ascensions 2 6 3 19/);
    expect(t).toMatch(/Hours My hours \d+ Any time \d+/);
    // No level was sent on these rows: one value, so no Level chips.
    expect(html).not.toContain('data-testid="runs-explore-level"');
  });

  it('a chip narrows the list ("5 of 25 runs") and Clear filters appears', async () => {
    const html = await renderX({ goal: ['eggday'] });
    expect(html.match(/data-testid="my-runs-row"/g)).toHaveLength(5);
    expect(textOf(html)).toContain('5 of 25 runs');
    expect(html).toContain('data-testid="runs-explore-clear"');
    expect(html).toMatch(/aria-pressed="true"[^>]*data-testid="runs-chip-goal-eggday"/);
  });

  it('two chips in a group are "or", two groups are "and"', async () => {
    const either = await renderX({ goal: ['eggday', 'date'] });
    expect(either.match(/data-testid="my-runs-row"/g)).toHaveLength(11);
    const both = await renderX({ goal: ['eggday', 'date'], hours: ['mine'] });
    expect(both.match(/data-testid="my-runs-row"/g)).toHaveLength(1);
  });

  it('nothing kept: "No runs match: Clear filters"', async () => {
    const html = await renderX({ goal: ['eggday'], asc: [2] });
    expect(html).toContain('data-testid="my-runs-none-shown"');
    expect(textOf(html)).toContain('No runs match: Clear filters');
    expect(textOf(html)).toContain('0 of 25 runs');
    expect(html).toContain('data-testid="my-runs-clear"');
  });

  it('a remembered pick for a value no run has is not applied', async () => {
    const html = await renderX({ asc: [7] });
    expect(html.match(/data-testid="my-runs-row"/g)).toHaveLength(25);
    expect(html).not.toContain('data-testid="runs-explore-clear"');
  });

  it('the stops box finds routes with every stop typed', async () => {
    const html = await renderX({ stops: '250 490' });
    expect(html.match(/data-testid="my-runs-row"/g)).toHaveLength(8);
  });

  it('Most TE sorts the highest first; Fewest ascensions the shortest routes first', async () => {
    const te = textOf(await renderX({ sort: 'te' }));
    expect(te.indexOf('Fastest to 490 TE')).toBeLessThan(te.indexOf('Egg Day 2027 200'));
    const few = await renderX({ sort: 'fewest' });
    const first = few.split('data-testid="my-runs-row"')[1];
    expect(textOf(first)).toMatch(/Fastest to 3\d0 TE/);
  });
});
