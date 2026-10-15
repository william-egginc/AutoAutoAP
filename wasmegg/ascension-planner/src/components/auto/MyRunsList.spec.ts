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
    const race = t.indexOf('Race to 490');
    expect(egg).toBeGreaterThan(-1);
    expect(egg).toBeLessThan(date);
    expect(date).toBeLessThan(race);
    expect(t).toContain('320 TE, 5.0 h spare');
    expect(t).toContain('finishes');
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

  it('on a phone the filters fold under "Filters (n active)"; from sm up they sit inline', async () => {
    const html = await renderWith({});
    expect(html).toMatch(/<details class="sm:hidden[^"]*"[^>]*data-testid="my-runs-filters-fold"/);
    expect(html).toMatch(/class="hidden sm:block"[^>]*data-testid="my-runs-filters-inline"/);
    expect(textOf(html)).toContain('Filters Kind');
    expect(textOf(html)).not.toContain('active)');

    const filtered = await renderWith({ initialFilters: { kind: 'race', hours: 'awake' } });
    expect(textOf(filtered)).toContain('Filters (2 active)');
    expect(filtered.match(/data-testid="my-runs-row"/g)).toHaveLength(1);
    expect(textOf(filtered)).toContain('Showing 1 of 3 runs.');
    // Race's target choice appears with the Race kind.
    expect(filtered).toContain('data-testid="my-runs-target"');
  });

  it('the stops box finds routes with every stop typed', async () => {
    const html = await renderWith({ initialFilters: { stops: '200 250' } });
    expect(html.match(/data-testid="my-runs-row"/g)).toHaveLength(1);
    expect(textOf(html)).toContain('200 250 320');
  });

  it('says so when nothing is in the chosen categories, and when there are no runs at all', async () => {
    expect(await renderWith({ initialFilters: { ascensions: 12 } })).toContain('data-testid="my-runs-none-shown"');
    const none = await renderHtml(MyRunsList, { ...base, rows: [] });
    expect(none).toContain('data-testid="my-runs-none"');
  });
});
