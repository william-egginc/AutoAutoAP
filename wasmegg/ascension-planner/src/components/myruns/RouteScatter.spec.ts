/** Q9 on My runs: "Your routes at a glance" (RouteScatter.vue) and "Missing for a perfect set" (PerfectSetGaps.vue,
 *  under GearBlock.vue), server-rendered, and how they are wired. */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import type { EquippedArtifact } from '@/lib/artifacts/types';
import RouteScatter from './RouteScatter.vue';
import PerfectSetGaps from './PerfectSetGaps.vue';
import GearBlock from './GearBlock.vue';
import { FIXTURE_DATED, FIXTURE_RACES, FIXTURE_ROWS, fixtureBase, race } from './routeScatter.fixture';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
const heatOf = (html: string) => html.match(/data-testid="my-runs-heat"[\s\S]*?data-testid="my-runs-heat-line"/)?.[0] ?? '';
const counts = (html: string) => [...heatOf(html).matchAll(/data-count="(\d+)"/g)].map(m => Number(m[1]));
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const ylabels = (html: string) =>
  [...html.matchAll(/data-testid="my-runs-heat-ylabel"[^>]*>([^<]*)</g)].map(m => m[1].trim());
const quickCount = FIXTURE_RACES.filter(r => r.level === 'quick').length;

describe('Your routes at a glance: the heat map', () => {
  it('folded, with the count; the summary, the goal select, a cell per bin, the best starred, the legend, the list', async () => {
    const html = await renderHtml(RouteScatter, { ...fixtureBase, rows: FIXTURE_ROWS });
    const t = textOf(html);
    expect(html).not.toMatch(/<details[^>]*data-testid="my-runs-scatter"[^>]*\sopen/);
    expect(t).toContain('Your routes at a glance (31 routes, 2 goals)');
    expect(t).toMatch(/25 routes for Fastest to 490 TE\. The best takes 10\.5 days/);
    // The goal select, unchanged: the busiest goal first picked, every goal listed with its count.
    expect(html).toMatch(/<select[^>]*min-h-\[44px\][^>]*data-testid="my-runs-scatter-goal"/);
    expect(t).toContain('Egg Day 2027 (6)');
    expect(t).toContain('Fastest to 490 TE (25)');
    // Every route counted once; the legend names the busiest cell.
    expect(sum(counts(html))).toBe(25);
    const max = Math.max(...counts(html));
    expect(t).toContain(`fewer routes more routes (most in one cell: ${max})`);
    expect(t).toContain('Best route');
    // Finish date up, ascensions across; the best cell starred, exactly once.
    expect(t).toContain('Finish date');
    expect(t).toContain('Ascensions');
    expect(html.match(/data-testid="my-runs-heat-best"/g)).toHaveLength(1);
    expect(heatOf(html).match(/★/g)).toHaveLength(1);
    expect(html.match(/data-testid="my-runs-heat-xlabel"/g)!.length).toBe(5); // 2 to 6 ascensions
    const rowsN = ylabels(html).length;
    expect(rowsN).toBeGreaterThanOrEqual(6);
    expect(rowsN).toBeLessThanOrEqual(10);
    // The latest finish on top, the earliest at the bottom.
    const ms = ylabels(html).map(l => Date.parse(`${l}, 2026 UTC`));
    expect([...ms].sort((a, b) => b - a)).toEqual(ms);
    // Each cell with routes is a button saying its count and its best, with the same words as a tooltip.
    const cells = [...html.matchAll(/<button[^>]*data-testid="my-runs-heat-(?:cell|best)"[^>]*>/g)].map(m => m[0]);
    expect(cells.length).toBeGreaterThan(3);
    for (const c of cells) {
      const label = c.match(/aria-label="([^"]*)"/)![1];
      expect(label).toMatch(/^\d+ routes?, best \d+( → \d+)+; \d+ ascensions?, finishing /);
      expect(c).toContain(`title="${label}"`);
      expect(c).toContain('min-h-[28px]');
    }
    // The level chips: on, with their counts.
    for (const k of ['Fast', 'Exact', 'Exact (wider)']) expect(t).toContain(k);
    expect(html).toMatch(/data-testid="my-runs-heat-level-quick"[^>]*>|aria-pressed="true"[^>]*data-testid="my-runs-heat-level-quick"/);
    expect(html).not.toMatch(/aria-pressed="false"[^>]*data-testid="my-runs-heat-level/);
    // The line under the map says how to use it until a cell is picked.
    expect(t).toContain('to see how many routes it holds and the best of them.');
    expect(t).toContain('The same routes as a list');
    expect(t).toContain('Every run is also in Your runs below, with its filters.');
  });

  it('a date goal: TE up, the lowest TE at the bottom', async () => {
    const html = await renderHtml(RouteScatter, { ...fixtureBase, rows: FIXTURE_DATED });
    const t = textOf(html);
    expect(t).toContain('TE reached');
    expect(sum(counts(html))).toBe(6);
    const tes = ylabels(html).map(l => Number(l.split('–')[0]));
    expect(tes[0]).toBeGreaterThan(tes[tes.length - 1]);
    expect([...tes].sort((a, b) => b - a)).toEqual(tes);
    const best = html.match(/<button[^>]*data-testid="my-runs-heat-best"[^>]*>/)![0];
    expect(best).toMatch(/aria-label="1 route, best 200 → 226 → 281; 3 ascensions, TE 28\d/);
  });

  it('the level chips filter what is counted; all off says so', async () => {
    const html = await renderHtml(RouteScatter, { ...fixtureBase, rows: FIXTURE_ROWS, startLevelsOff: ['quick'] });
    expect(sum(counts(html))).toBe(25 - quickCount);
    expect(html).toMatch(/aria-pressed="false"[^>]*data-testid="my-runs-heat-level-quick"/);
    expect(html).toMatch(/aria-pressed="true"[^>]*data-testid="my-runs-heat-level-normal"/);
    // The goal's count in the select is all its routes, whatever is filtered.
    expect(textOf(html)).toContain('Fastest to 490 TE (25)');
    const none = await renderHtml(RouteScatter, {
      ...fixtureBase,
      rows: FIXTURE_ROWS,
      startLevelsOff: ['quick', 'normal', 'thorough'],
    });
    expect(textOf(none)).toContain('No routes to show: every level is switched off. Switch one back on below.');
    expect(none).not.toContain('data-testid="my-runs-heat"');
    expect(none).toContain('data-testid="my-runs-heat-levels"'); // the chips stay, to switch back on
    expect(textOf(none)).toContain('The same routes as a list');
    const comp = read('RouteScatter.vue');
    expect(comp).toContain('@click="toggleLevel(l.level)"');
  });

  it('a picked cell: its count, where it sits and its best route under the map, with a 44 px clear button', async () => {
    const t = textOf(await renderHtml(RouteScatter, { ...fixtureBase, rows: FIXTURE_ROWS, startOnBest: true }));
    expect(t).toMatch(/\d+ routes? · \d+ ascensions?, finishing [^.]+\. ★ Best route\. Best in this cell: \d+( → \d+)+ /);
    expect(t).not.toContain('Best · ');
    expect(t).toContain('10.5 days');
    const html = await renderHtml(RouteScatter, { ...fixtureBase, rows: FIXTURE_ROWS, startOnBest: true });
    expect(html).toMatch(/data-testid="my-runs-heat-clear"/);
    expect(html).toMatch(/class="[^"]*min-w-\[44px\][^"]*"[^>]*aria-label="Clear the selected cell"/);
  });

  it('one route: one cell, starred; a run saved here without a finish is left out with a note', async () => {
    const html = await renderHtml(RouteScatter, {
      ...fixtureBase,
      rows: [race(490, [300, 490], 11, { level: 'thorough' })],
      savedRuns: [{ id: 's', savedAt: 1, finalTE: 490, effort: 'quick', bestChain: [100, 490], bestDays: 13 }],
    });
    expect(counts(html)).toEqual([1]);
    expect(html.match(/data-testid="my-runs-heat-best"/g)).toHaveLength(1);
    expect(textOf(html)).toContain('1 saved on this computer has no finish date, so it is left out of this view.');
    expect(textOf(html)).toContain('Exact (wider)');
    expect(textOf(html)).not.toContain('Very high');
  });

  it('a Custom saved run is Custom, not the slider level it was saved with (23 Oct 2026)', async () => {
    const t = textOf(
      await renderHtml(RouteScatter, {
        ...fixtureBase,
        rows: [race(490, [200, 300, 490], 12.5, { level: 'normal', yours: true })],
        savedRuns: [
          { id: 'x', savedAt: 1, finalTE: 490, effort: 'thorough', bestChain: [100, 490], bestDays: 13, space: { kind: 'box' } },
        ],
      })
    );
    const chips = t.slice(t.indexOf('Levels:'));
    expect(chips).toContain('Custom');
    expect(chips).not.toContain('Exact (wider)');
  });

  it('loading and empty say so in one line', async () => {
    expect(textOf(await renderHtml(RouteScatter, { ...fixtureBase, rows: null }))).toContain('Your runs are still loading.');
    expect(textOf(await renderHtml(RouteScatter, { ...fixtureBase, rows: [] }))).toContain(
      'No routes of yours yet: runs you send or save show here.'
    );
  });

  it('wired on My runs from the rows already loaded, above Your runs; nothing fetched or priced', () => {
    const view = read('../MyRunsView.vue');
    expect(view).toMatch(
      /<RouteScatter\s+:rows="boardRows"\s+:saved-runs="store.savedRuns"\s+:saved-answers="store.savedAnswers"/
    );
    expect(view.indexOf('<RouteScatter')).toBeLessThan(view.indexOf('id="my-runs-your-runs"'));
    expect(view.indexOf('<RouteScatter')).toBeGreaterThan(view.indexOf('<TryNext'));
    for (const f of [
      'RouteScatter.vue',
      'PerfectSetGaps.vue',
      '../../lib/routeScatter.ts',
      '../../lib/heatBins.ts',
      '../../lib/perfectSet.ts',
    ]) {
      const src = read(f);
      expect(src, f).not.toMatch(/fetch\(|new Worker|createChainSearchPool|findRoutes\(|startSearch|runExact|echarts/);
    }
    // Closed on a phone, open on a wide screen; a cell reacts to the pointer, a tap and keyboard focus.
    const comp = read('RouteScatter.vue');
    expect(comp).toContain("matchMedia('(max-width: 639px)')");
    expect(comp).toMatch(/@mouseenter=/);
    expect(comp).toMatch(/@focus=/);
    expect(comp).toMatch(/@click="tap\(c\.row, c\.col\)"/);
    expect(comp).toContain('@keydown.esc="clearSel"');
    expect(comp).toContain('aria-live="polite"');
  });
});

describe('Your routes at a glance on a phone', () => {
  const comp = read('RouteScatter.vue');
  it('the grid shrinks to fit 390 px: flexible columns, short y labels, 28 px cells (the line under the map is the reader)', () => {
    expect(comp).toContain('repeat(${heat.cols.length}, minmax(0, 1fr))');
    expect(comp).toContain('max-w-[4.75rem]');
    expect(comp.match(/min-h-\[28px\]/g)!.length).toBeGreaterThanOrEqual(2);
  });
  it('the Goal select, the level chips and the clear button are 44 px tall on a phone', async () => {
    const html = await renderHtml(RouteScatter, { ...fixtureBase, rows: FIXTURE_ROWS });
    expect(html).toMatch(/<select[^>]*min-h-\[44px\]/);
    expect(html).toMatch(/<button[^>]*min-h-\[44px\][^>]*data-testid="my-runs-heat-level-quick"/);
    expect(comp).toContain('w-11 min-w-[44px]');
    expect(comp).toContain('@click="clearSel"');
  });
});

const a = (artifactId: string | null, ...stones: (string | null)[]): EquippedArtifact => ({ artifactId, stones });

describe('Missing for a perfect set', () => {
  const earnings = [
    a('tungsten-ankh-4-3', 'lunar-stone-4', 'lunar-stone-3', 'lunar-stone-3'),
    a('demeters-necklace-4-2', 'lunar-stone-4', 'lunar-stone-4'),
    a('puzzle-cube-4-3', 'lunar-stone-4', 'lunar-stone-4', 'lunar-stone-4'),
    a('lunar-totem-4-3', 'lunar-stone-4', 'lunar-stone-4', 'lunar-stone-4'),
  ];

  it('folded; the count on the fold, then each set grouped, slot by slot', async () => {
    const html = await renderHtml(PerfectSetGaps, {
      equipped: earnings,
      earnings,
      production: null,
      match: 'earnings',
    });
    const t = textOf(html);
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(t).toContain(
      'Missing for a perfect set 1 of 4 artifacts is not T4 Legendary; 2 stones are below tier 4; 1 stone slot is empty. ▸ slot by slot'
    );
    expect(t).toContain('Artifacts to upgrade Slot 2: T4 Epic Demeters necklace vs T4 Legendary');
    expect(t).toContain('Missing stones Slot 2, Demeters necklace: 1 stone missing (has 2, a T4 Legendary holds 3)');
    expect(t).toContain('Stones below tier 4 Slot 1, Tungsten ankh: 2 × T3 Lunar stone vs T4');
    expect(t).toContain('Equipped now is your earnings set: the same gaps.');
  });

  it('no virtue gear in the save: one plain line', async () => {
    const t = textOf(await renderHtml(PerfectSetGaps, { equipped: null, earnings: null, production: null }));
    expect(t).toContain('Missing for a perfect set No virtue gear in the loaded save to compare.');
  });

  it('sits in Gear, under the three rows', async () => {
    const t = textOf(
      await renderHtml(GearBlock, {
        equipped: earnings,
        earnings,
        production: earnings,
        clothedEquipped: null,
        clothedEarnings: null,
        whatIf: null,
        goal: 'fastest',
        match: 'both',
      })
    );
    expect(t.indexOf('Production set')).toBeLessThan(t.indexOf('Missing for a perfect set'));
    expect(read('GearBlock.vue')).toMatch(
      /<PerfectSetGaps :equipped="equipped" :earnings="earnings" :production="production"/
    );
  });
});
