/**
 * Review IN-7 (15 Nov 2026): at 390 px Insights scrolled sideways once "More charts and checks" was open (the plan-drift account select
 * grew to its longest option, 455 px on a 390 px screen), and the charts had no accessible name. The select and its label may shrink; every
 * Insights chart is a role="img" with a plain name (EChart's `label`). DRAFT names (Words reviews). Source and markup pins: no DOM here.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderHtml } from '@/test/renderComponent';
import EChart from '@/components/charts/EChart.vue';

const read = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8');

describe('the plan-drift account select fits a phone', () => {
  const src = read('./PlanDriftChart.vue');
  it('the label and the select may shrink to the screen', () => {
    expect(src).toMatch(/<label class="flex min-w-0 max-w-full items-center gap-1\.5">/);
    expect(src).toMatch(/<select\s+v-model="picked"\s+class="min-w-0 max-w-full /);
  });
});

describe('EChart names itself when given a label', () => {
  it('role="img" and aria-label on the chart box, not on the frame (the reload button stays reachable)', async () => {
    const html = await renderHtml(EChart, { option: {}, label: 'Chart: test' });
    expect(html).toMatch(/<div class="h-full w-full" role="img" aria-label="Chart: test"><\/div>/);
  });
  it('no label, no role (a chart nobody named is not announced as an image)', async () => {
    expect(await renderHtml(EChart, { option: {} })).not.toContain('role="img"');
  });
});

describe('every Insights chart has a name', () => {
  const files: [string, string[]][] = [
    ['./CountCompareChart.vue', ['Chart: which ascension count finishes first, account by account']],
    ['./CountShapeChart.vue', ['Chart: how the stops fall for each ascension count']],
    ['./LegProfileChart.vue', ['Chart: each ascension of the selected routes']],
    ['./SweepCurvesChart.vue', ['Chart: each sweep, every account']],
    ['./GearScoreChart.vue', ['Chart: delivery set scores', 'Chart: earnings set scores']],
    ['./GearMap.vue', ['Chart: gear data still wanted']],
    ['./SaleChoiceMap.vue', ['Chart: which sale plan wins each ascension']],
    ['./PlanDriftChart.vue', ['Chart: how the best plan moves from one day to the next']],
    ['./FinalLegChart.vue', ["Chart: whether each final ascension reached its gear's rate"]],
  ];
  for (const [f, names] of files)
    it(`${f.slice(2)}: ${names.length} named`, () => {
      const src = read(f);
      const uses = src.match(/<EChart\b[^>]*>/g) ?? [];
      expect(uses).toHaveLength(names.length);
      for (const n of names) expect(src).toContain(`label="${n}"`);
    });
});
