/**
 * Leaderboard › Your latest run (#/compare/latest): the newest search's routes with their arrows; for Fastest
 * its other options and charts, moved off its results (15 Oct 2026); for By a date its best route for each
 * stop count and its top 50 (since 15 Oct 2026, batch 16). Fastest's panels and By a date's link here with
 * "Dig deeper into your plan ›".
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import LatestRunView from './LatestRunView.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import { useChainSearchStore } from '@/stores/chainSearch';
import type { ShortlistRow } from '@/search/shortlist';

const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');

let pinia: Pinia;
beforeEach(() => {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  });
  pinia = createPinia();
  setActivePinia(pinia);
});

const row = (chain: number[], days: number, reason: ShortlistRow['reason']): ShortlistRow => ({
  chain,
  seconds: days * 86400,
  gapSeconds: (days - 700) * 86400,
  prestiges: chain.length,
  legs: [],
  nightShifts: null,
  prestigeWaitSeconds: null,
  shiftHoldSeconds: null,
  reason,
});

describe('LatestRunView (Compare › Your latest run)', () => {
  it('no run in this visit: says so plainly, and nothing else', async () => {
    const html = await renderHtml(LatestRunView, {}, {}, [pinia]);
    expect(html).toContain('data-testid="latest-run-empty"');
    const t = textOf(html);
    expect(t).toContain('Run a search on Fastest to 490 TE or Highest TE by a date and its routes show here');
    // Names both ways of searching, and says Light isn't a search and where its results are.
    expect(t).toContain('Either way of searching counts (Nearby routes or Exhaustive)');
    expect(t).toContain("Light, the Stronger check's first level, isn't a search");
    expect(t).toContain("its results are on the instant answer's rows");
    expect(html).not.toContain('data-testid="other-options"');
    expect(html).not.toContain('data-testid="search-shape"');
  });

  it('a run with priced routes: where it came from, the other options and the shape of the search', async () => {
    const store = useChainSearchStore();
    store.pricedCount = 3;
    store.shortlist = [row([212, 280, 490], 700, 'best'), row([230, 490], 701, 'prestige-count')];
    const html = await renderHtml(LatestRunView, {}, {}, [pinia]);
    const t = textOf(html);
    expect(html).not.toContain('data-testid="latest-run-empty"');
    expect(t).toContain(`From your Nearby routes run on`);
    expect(html).toContain('href="#/auto/fastest"');
    expect(html).toContain('data-testid="other-options"');
    expect(t).toContain('Other options worth considering');
    for (const label of ['A good mix', 'Fastest', 'Kindest to my schedule', 'By ascension count', 'By finish date'])
      expect(t).toContain(label);
    expect(html).toContain('data-testid="shortlist"');
    expect(t).toContain('212 280 490');
    expect(html).toContain('data-testid="search-shape"');
    expect(t).toContain('The shape of this search');
  });

  it("an Exhaustive run: named so, linked back to Exhaustive, and no Nearby routes' stage words", async () => {
    const store = useChainSearchStore();
    store.pricedCount = 1;
    store.searchSpace = { bands: [] } as never;
    const html = await renderHtml(LatestRunView, {}, {}, [pinia]);
    expect(textOf(html)).toContain('From your Exhaustive run on');
    expect(html).toContain('href="#/auto/fastest/full"');
    expect(textOf(html)).not.toMatch(/Finished:|Nothing left to price:/);
  });

  it('the charts load only when shown on this view (async), not with the page', () => {
    const src = read('LatestRunView.vue');
    expect(src).toMatch(/const RunCharts = safeAsyncComponent\(\(\) => import\('\.\/charts\/RunCharts\.vue'\)\)/);
    expect(src).not.toMatch(/import RunCharts from/);
    // And the view itself only when its tab opens.
    expect(read('LeaderboardPanel.vue')).toMatch(
      /const LatestRunView = safeAsyncComponent\(\(\) => import\('\.\/LatestRunView\.vue'\)\)/
    );
    expect(read('LeaderboardPanel.vue')).toContain(`<LatestRunView v-else-if="tab === 'latest'" />`);
    // The store builds the chart's data only while a chart is mounted.
    expect(read('charts/RunCharts.vue')).toContain('onMounted(() => store.chartMounted(true))');
    expect(read('charts/RunCharts.vue')).toContain('onBeforeUnmount(() => store.chartMounted(false))');
  });
});

describe("Fastest's results: one line in place of the moved blocks", () => {
  for (const file of ['ChainSearchPanel.vue', 'InsanePanel.vue']) {
    it(`${file}: "Dig deeper into your plan ›" to Your latest run, and no longer has the blocks`, () => {
      const src = read(file);
      expect(src).toMatch(/<DigDeeperLink\s+v-if="ownRun && store.pricedCount"/);
      expect(src).not.toContain('Other options worth considering');
      expect(src).not.toContain('The shape of this search');
      expect(src).not.toMatch(/<RunCharts\b/);
      expect(src).not.toContain('data-testid="shortlist"');
    });
  }

  it('By a date links there too, under its result card, and still has no charts or other-options views', () => {
    const src = read('DeadlinePanel.vue');
    expect(src).toMatch(/<DigDeeperLink v-if="best && !store.deadlineRunning"/);
    expect(src).not.toMatch(/<RunCharts\b|Other options worth considering/);
  });

  it('the link: its words and where it goes', async () => {
    const { default: DigDeeperLink } = await import('./DigDeeperLink.vue');
    const html = await renderHtml(DigDeeperLink, {});
    expect(textOf(html)).toContain('Dig deeper into your plan ›');
    expect(textOf(html)).toContain('(Leaderboard › Your latest run)');
    expect(html).toContain('href="#/compare/latest"');
  });
});

const H = 3600;
const T0 = Date.parse('2027-03-01T15:00:00Z') / 1000;
/** A By a date route with legs that kept their shifts and TE. */
const dateRoute = (chain: number[], reachAt: number) => ({
  chain,
  reachAt,
  ascendAt: reachAt,
  spare: 86400,
  legs: chain.map((te, i) => ({
    key: '1-sale',
    endTE: te,
    durationSeconds: 100 * H,
    maxELR: 1,
    endTime: T0 + (i + 1) * 100 * H,
    startTime: T0 + i * 100 * H,
    tier13Unlocked: false,
    shifts: [{ at: T0 + i * 100 * H + 2 * H, egg: 'integrity', fromEgg: 'curiosity', te: 40 + i }],
    endEgg: { egg: 'integrity', te: 45 + i },
  })),
});
function dateResult(at: number, n = 60) {
  const routes = Array.from({ length: n }, (_, k) => dateRoute([220 + k, 300 + k], T0 + 200 * H));
  return {
    simple: true,
    routes,
    byStops: [dateRoute([250], T0 + 100 * H), routes[0]],
    deadline: T0 + 300 * H,
    planStart: T0,
    te: 200,
    step: 0,
    shapes: 3,
    priced: 1234,
    stoppedEarly: false,
    ascendNeeded: false,
    lastHi: 490,
    at,
  };
}

describe('Your latest run: By a date', () => {
  it('a By a date result and no Fastest run: its best for each stop count and its top 50, with arrows', async () => {
    const store = useChainSearchStore();
    store.deadlineResult = dateResult(Date.parse('2026-10-15T18:00:00Z')) as never;
    const html = await renderHtml(LatestRunView, {}, {}, [pinia]);
    const t = textOf(html);
    expect(html).not.toContain('data-testid="latest-run-empty"');
    expect(html).toContain('data-testid="latest-run-from-date"');
    expect(t).toContain('From your Highest TE by a date run (Nearby routes, by');
    expect(t).toContain('1,234 routes priced');
    expect(html).toContain('href="#/auto/by-date"');
    expect(t).toContain('Best for each stop count');
    expect(t).toContain('Top routes (50 of 1,234 priced)');
    // The top 50, not 15 (and not all 60).
    expect(t).toContain('269 349');
    expect(t).not.toContain('270 350');
    // Every row with legs has its arrow.
    expect(html.match(/data-testid="result-row-expand"/g)?.length).toBe(52);
    expect(html).not.toContain('data-testid="other-options"');
  });

  it('the newer of the two runs shows, by when each was found, and the other is a click away', async () => {
    const store = useChainSearchStore();
    store.pricedCount = 3;
    store.shortlist = [row([212, 280, 490], 700, 'best')];
    store.chainResultAt = Date.parse('2026-10-15T12:00:00Z');
    // Restored from IndexedDB, but found BEFORE the Fastest run: Fastest shows.
    store.deadlineResult = dateResult(Date.parse('2026-10-14T12:00:00Z')) as never;
    let html = await renderHtml(LatestRunView, {}, {}, [pinia]);
    expect(textOf(html)).toContain('From your Nearby routes run on');
    expect(html).toContain('data-testid="latest-run-other"');
    expect(textOf(html)).toContain('Show your Highest TE by a date run instead');
    // Found after it: By a date shows.
    store.deadlineResult = dateResult(Date.parse('2026-10-15T13:00:00Z')) as never;
    html = await renderHtml(LatestRunView, {}, {}, [pinia]);
    expect(textOf(html)).toContain('From your Highest TE by a date run');
    expect(textOf(html)).toContain('Show your Fastest to 490 TE run instead');
  });

  it('a Fastest run going now is the newest, whatever By a date restored', async () => {
    const store = useChainSearchStore();
    store.pricedCount = 2;
    store.isRunning = true;
    store.deadlineResult = dateResult(Date.now()) as never;
    const html = await renderHtml(LatestRunView, {}, {}, [pinia]);
    expect(textOf(html)).toContain('From your Nearby routes run on');
  });

  it('source: the shortlist and By a date tables use RouteTimeline, and the eggBlocks copy is gone', () => {
    const src = read('LatestRunView.vue');
    expect(src).toMatch(/<RouteTimeline v-if="row.legs.length" :chain="row.chain" :legs="row.legs" :zone="zone" \/>/);
    expect(src).toMatch(/<RouteTimeline :chain="r.chain" :legs="r.legs" :zone="zone" \/>/);
    expect(src).toContain('dateResult.routes.slice(0, 50)');
    expect(src).not.toMatch(/function eggBlocks/);
    expect(read('ChainSearchPanel.vue')).not.toMatch(/function eggBlocks/);
  });
});
