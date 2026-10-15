/**
 * Compare › Your latest run (#/compare/latest): Fastest's other options and charts, moved off its
 * results (15 Oct 2026). Fastest keeps one line linking here; By a date had neither, so it has no link.
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
    expect(textOf(html)).toContain('Run a search on Fastest and its other options and charts show here.');
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
    it(`${file}: links to Compare › Your latest run, and no longer has the blocks`, () => {
      const src = read(file);
      expect(src).toContain('data-testid="latest-run-link"');
      expect(src).toContain('More views of this run (other options, charts) are on');
      expect(src).toContain('href="#/compare/latest"');
      expect(src).toContain('{{ NAMES.compare }} › {{ NAMES.latest }}');
      expect(src).not.toContain('Other options worth considering');
      expect(src).not.toContain('The shape of this search');
      expect(src).not.toMatch(/<RunCharts\b/);
      expect(src).not.toContain('data-testid="shortlist"');
    });
  }

  it('By a date had neither (no charts, no other-options views), so it gets no link', () => {
    const src = read('DeadlinePanel.vue');
    expect(src).not.toMatch(/<RunCharts\b|Other options worth considering|latest-run-link/);
  });
});
