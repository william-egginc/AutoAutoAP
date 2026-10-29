/** More routes under the result card (TopRoutes.vue, item 12): the best 5 and the best per ascension count. */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import TopRoutes from './TopRoutes.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import type { PricedRoute } from '@/lib/topRoutes';

const T0 = 1_815_660_000; // Jul 15, 2027 2:00 PM UTC
const H = 3600;
const r = (chain: number[], hours: number, hasLegs = true): PricedRoute => ({ chain, finish: T0 + hours * H, hasLegs });
const FASTEST = [
  r([200, 300, 490], 50),
  r([150, 250, 350, 490], 40),
  r([180, 490], 70),
  r([100, 200, 300, 400, 490], 41.5, false),
  r([160, 260, 360, 490], 44),
  r([170, 270, 370, 490], 48),
  r([210, 310, 490], 46),
];
const FOLLOW = { goalKey: 'fastest-490', source: 'exact', planStart: T0 - 100 * 86400 } as const;
const props = (over: object = {}) => ({ goal: 'fastest', routes: () => FASTEST, zone: 'UTC', open: true, follow: FOLLOW, ...over });
const count = (html: string, s: string) => html.split(s).length - 1;

describe('TopRoutes', () => {
  it('closed by default: the summary only, nothing read', async () => {
    let reads = 0;
    const html = await renderHtml(TopRoutes, props({ open: false, routes: () => (reads++, FASTEST) }));
    expect(html).toMatch(/<details(?![^>]*\sopen)[^>]*data-testid="top-routes"/);
    expect(textOf(html)).toBe('More routes › Best 5 routes · best per ascension count');
    expect(html).not.toContain('top-routes-body');
    expect(reads).toBe(0);
  });

  it('Fastest: the best 5, ranked, the best marked, finish and how far behind, Simulate and Follow on each', async () => {
    const html = await renderHtml(TopRoutes, props());
    const t = textOf(html);
    expect(count(html, 'data-testid="top-route-row"')).toBe(5);
    expect(t).toContain('Best 5 routes');
    expect(t).toMatch(/1\. Best 4 ascensions 150 250 350 490 Finishes Jul 17, 2027, 6:00 AM Simulate this plan Follow this route 2\./);
    expect(t).toMatch(/2\. 5 ascensions \+1h 30m 100 200 300 400 490 Finishes/);
    expect(t).toContain('5. 4 ascensions +8h 170 270 370 490');
    expect(count(html, 'data-best="true"')).toBe(2); // the best row and its bar
    // Each row and the chart's chosen route: 6 Simulate, 6 Follow.
    expect(count(html, 'data-testid="top-route-simulate"')).toBe(6);
    expect(count(html, 'data-testid="follow-route"')).toBe(6);
    expect(html).toContain('aria-label="Simulate this plan: 150 250 350 490"');
    expect(html).toContain('aria-label="Rank 1"');
  });

  it('the chart: one tappable row per ascension count, the best highlighted, its route shown under it', async () => {
    const html = await renderHtml(TopRoutes, props());
    const bars = [...html.matchAll(/data-testid="top-routes-bar" data-count="(\d+)"/g)].map(m => Number(m[1]));
    expect(bars).toEqual([2, 3, 4, 5]);
    expect(html).toMatch(/aria-pressed="true"[^>]*aria-label="4 ascensions: finishes [^"]*, best"[^>]*data-count="4" data-best="true"/);
    expect(html).toContain('aria-label="2 ascensions: finishes Jul 18, 2027, 12:00 PM, +30h"');
    const chosen = textOf(html.slice(html.indexOf('data-testid="top-routes-chosen"')));
    expect(chosen).toMatch(/> 4 ascensions \(the best\): 150 250 350 490 Finishes .* Simulate this plan Follow this route/);
    // The sooner, the further left: the best at 4%, the slowest at 96%.
    expect(html).toContain('left:4%');
    expect(html).toContain('left:96%');
  });

  it('phones: 44 px tap targets, routes wrap, nothing kept on one line', async () => {
    const html = await renderHtml(TopRoutes, props());
    expect(html).toMatch(/<summary class="[^"]*min-h-\[44px\][^"]*sm:min-h-0/);
    for (const m of html.matchAll(/<button[^>]*class="([^"]*)"/g)) expect(m[1]).toContain('min-h-[44px]');
    expect(count(html, 'break-words')).toBeGreaterThanOrEqual(10);
    expect(html).not.toMatch(/whitespace-nowrap|truncate/);
  });

  it('a route without its timings says Simulate works them out again', async () => {
    const html = await renderHtml(TopRoutes, props({ routes: () => [r([150, 490], 10, false), r([100, 200, 490], 12)] }));
    expect(textOf(html)).toContain("Its time for each ascension wasn't kept; Simulate this plan works it out again.");
  });

  it('no Follow without the result to follow; one route; none', async () => {
    const noFollow = await renderHtml(TopRoutes, props({ follow: null }));
    expect(noFollow).not.toContain('follow-route');
    expect(count(noFollow, 'data-testid="top-route-simulate"')).toBe(6);
    const one = textOf(await renderHtml(TopRoutes, props({ routes: () => [r([200, 490], 10)] })));
    expect(one).toContain('Best 1 route');
    expect(one).toContain('1. Best 2 ascensions 200 490');
    expect(textOf(await renderHtml(TopRoutes, props({ routes: () => [] })))).toContain('No other route was priced.');
  });

  it('Highest TE by a date: the TE reached and the spare, the chart by TE, Follow only where the date is made', async () => {
    const DEADLINE = T0 + 40 * H;
    const date = [r([200, 312], 30), r([220, 312], 20), r([100, 200, 311], 5), r([100, 210, 311], 2), r([90, 180, 260, 305], 1)];
    const html = await renderHtml(
      TopRoutes,
      props({
        goal: 'date',
        routes: () => date,
        deadline: DEADLINE,
        follow: { goalKey: 'date-1815804000', source: 'fast', planStart: T0 - 100 * 86400 },
        followable: (x: { te: number }) => x.te === 312,
      })
    );
    const t = textOf(html);
    expect(t).toMatch(/1\. Best 2 ascensions 220 312 312 TE, reached Jul 16, 2027, 10:00 AM, 20h to spare/);
    expect(t).toContain('2. 2 ascensions +10h later 200 312');
    expect(t).toContain('3. 3 ascensions 1 TE lower 100 210 311');
    expect(t).toContain('The highest TE each number of ascensions reaches: further right is higher.');
    expect(count(html, 'data-testid="follow-route"')).toBe(3); // the two 312 rows and the chosen (best)
    expect(html).toContain('aria-label="4 ascensions: 305 TE, 7 TE lower"');
    expect(html).toMatch(/data-count="2" data-best="true"/);
  });
});

describe('wiring', () => {
  const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
  it('under the best card on Fast/Exact, Custom and By a date, with each card\'s own Simulate and Follow', () => {
    const chain = read('ChainSearchPanel.vue');
    expect(chain).toMatch(/<TopRoutes[\s\S]*?:routes="\(\) => store\.topPricedRoutes"[\s\S]*?:follow="fastFollow"[\s\S]*?@simulate="chain => use\(chain, true\)"/);
    const custom = read('InsanePanel.vue');
    expect(custom).toMatch(/<TopRoutes[\s\S]*?:follow="customFollow"[\s\S]*?@simulate="buildPlan"/);
    expect(custom).toContain('function buildPlan(chain: readonly number[] = store.bestChain)');
    const date = read('DeadlinePanel.vue');
    expect(date).toMatch(/<TopRoutes[\s\S]*?goal="date"[\s\S]*?:follow="dateRowFollow"[\s\S]*?@simulate="simulateDateRoute"/);
    expect(date).toMatch(/function simulateDateRoute[\s\S]*?byDateSimulate\(route[\s\S]*?simulateRoute\(s\.chain, 'by-date', s\.opts\)/);
  });

  it('the store reads the kept routes, never searches: allEntries plus the best, cut to what the list needs', () => {
    const store = read('../../stores/chainSearch.ts');
    const at = store.indexOf('const topPricedRoutes = computed');
    const body = store.slice(at, store.indexOf('\n  });', at));
    expect(body).toContain('allEntries()');
    expect(body).toContain("keptForTop(routes, 'fastest')");
    expect(body).not.toMatch(/runSearch|evaluate|startRun/);
  });
});
