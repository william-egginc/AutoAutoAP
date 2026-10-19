/** Q9 on My runs: "Your routes at a glance" (RouteScatter.vue) and "Missing for a perfect set" (PerfectSetGaps.vue,
 *  under GearBlock.vue), server-rendered, and how they are wired. */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import type { BoardRow } from '@/lib/leaderboardRank';
import type { EquippedArtifact } from '@/lib/artifacts/types';
import RouteScatter from './RouteScatter.vue';
import PerfectSetGaps from './PerfectSetGaps.vue';
import GearBlock from './GearBlock.vue';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
const EGG_DAY = 1_815_840_000;
const race = (finalTE: number, chain: number[], days: number, extra: Partial<BoardRow> = {}): BoardRow => ({
  id: `r${finalTE}-${chain.join('-')}-${days}`,
  chain,
  finalTE,
  durationDays: days,
  startUtc: '2026-10-01T00:00:00Z',
  submittedAt: '2026-10-01T00:00:00Z',
  timezone: 'UTC',
  ...extra,
});
const base = { eggDayAt: EGG_DAY, eggDayYear: 2027, zone: 'UTC' };

describe('Your routes at a glance', () => {
  it('folded, with the count; the summary sentence, the controls, a point per route, the best ringed, the key', async () => {
    const html = await renderHtml(RouteScatter, {
      ...base,
      rows: [
        race(490, [200, 300, 490], 12.5, { level: 'normal', yours: true }),
        race(490, [300, 490], 11, { level: 'thorough' }),
      ],
      savedRuns: [{ id: 's', savedAt: 1, finalTE: 490, effort: 'quick', bestChain: [100, 490], bestDays: 13 }],
    });
    const t = textOf(html);
    expect(html).toContain('data-testid="my-runs-scatter"');
    expect(html).not.toMatch(/<details[^>]*data-testid="my-runs-scatter"[^>]*\sopen/);
    expect(t).toContain('Your routes at a glance (3 routes, 1 goal)');
    expect(t).toContain(
      '3 routes for Race to 490. The best takes 11.0 days with 2 ascensions, finishing Oct 12 at 12:00 am. Across them: 2 to 3 ascensions, 11.0 to 13.0 days.'
    );
    expect(t).toContain('Race to 490 (3)');
    expect(t).toContain('Ascensions');
    expect(t).toContain('Finish date');
    expect(t).not.toContain('Hours to spare'); // a race is drawn in days
    expect(t).toContain('Days to finish (lower is sooner)');
    expect(html.match(/r="12"/g)).toHaveLength(3); // one hit area per point
    expect(html).toContain('data-testid="my-runs-scatter-best"');
    expect(html).toMatch(/<svg[^>]*role="img"[^>]*tabindex="0"/);
    for (const k of [
      'Fast',
      'Exact',
      'Very high',
      'Sent from this browser',
      'Looks like yours',
      'Saved on this computer',
      'Best',
    ])
      expect(t).toContain(k);
    expect(t).toContain('The same routes as a list');
    expect(t).toContain('Every run is also in Your runs below, with its filters.');
  });

  it('loading and empty say so in one line', async () => {
    expect(textOf(await renderHtml(RouteScatter, { ...base, rows: null }))).toContain('Your runs are still loading.');
    expect(textOf(await renderHtml(RouteScatter, { ...base, rows: [] }))).toContain(
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
      '../../lib/perfectSet.ts',
    ]) {
      const src = read(f);
      expect(src, f).not.toMatch(/fetch\(|new Worker|createChainSearchPool|findRoutes\(|startSearch|runExact|echarts/);
    }
    // Closed on a phone, open on a wide screen; the hover card reacts to pointer, tap and the keys.
    const comp = read('RouteScatter.vue');
    expect(comp).toContain("matchMedia('(max-width: 639px)')");
    expect(comp).toMatch(/@pointerenter=/);
    expect(comp).toMatch(/@click="tap\(/);
    expect(comp).toMatch(/@keydown="onKey"/);
    expect(comp).toContain('aria-live="polite"');
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
