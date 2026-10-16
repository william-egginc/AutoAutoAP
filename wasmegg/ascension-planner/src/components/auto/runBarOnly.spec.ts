/**
 * The floating run bar is the one progress display (Jordan, 16 Oct 2026): the panels' in-page progress
 * header, bar and time line are gone, each keeps a small `data-run-progress` anchor for Jump to it, and what
 * only the in-page block said is under the bar's Details (lib/runDetails.ts). And item 10: a result names
 * the hours and time off it was priced with (lib/pricedWith.ts) rather than pointing at Your setup.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import RouteResultCard from './RouteResultCard.vue';
import ByDateRouteCard from './ByDateRouteCard.vue';
import { renderHtml, textOf } from '@/test/renderComponent';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');

describe('the run bar is the only progress', () => {
  const panels: [string, string][] = [
    ['ChainSearchPanel.vue', 'smart'],
    ['InsanePanel.vue', 'full'],
    ['DeadlinePanel.vue', 'by-date'],
  ];

  it.each(panels)('%s: no in-page progress header, bar or time line; the anchor stays', (file, kind) => {
    const src = read(file);
    expect(src).not.toMatch(/<RunProgress\b/);
    expect(src).not.toContain("import RunProgress from './RunProgress.vue'");
    expect(src).not.toMatch(/<ProgressBar\b/);
    expect(src).toContain(`data-run-progress="${kind}"`);
    // The time line's words are the bar's now.
    expect(src).not.toMatch(/\{\{ elapsedLabel \}\} so far|s\/chain\s+here\)|timing the first batch/);
  });

  it('RunProgress.vue and ProgressBar.vue are gone', () => {
    expect(fs.existsSync(path.resolve(__dirname, 'RunProgress.vue'))).toBe(false);
    expect(fs.existsSync(path.resolve(__dirname, 'ProgressBar.vue'))).toBe(false);
  });

  it("the bar carries the rest under a folded Details (lib/runDetails.ts), and keeps its buttons", () => {
    const bar = read('RunProgressBar.vue');
    expect(bar).toContain('<details v-if="details" class="text-[10px] text-white/60" data-testid="run-bar-details">');
    expect(bar).toContain('runDetailLine(');
    expect(bar).toContain('data-testid="run-bar-show"');
    expect(bar).toContain('data-testid="run-bar-best-so-far"');
    expect(bar).toContain('Stop &amp; keep best');
    // Wraps rather than widening the page at 390.
    expect(bar).toContain('<p class="mt-1 break-words leading-snug">{{ details }}</p>');
  });
});

describe('the result names its hours and time off (item 10)', () => {
  const line = 'Priced with your hours 9 am to 1 am, no time off';

  it("Fastest's card says it once finished, not while running", async () => {
    const base = { chain: [212, 280, 490], days: 760.5, finalTE: 490, endLabel: 'Feb 15, 2029', pricedWith: line };
    expect(textOf(await renderHtml(RouteResultCard, { ...base, running: false }))).toContain(`${line}.`);
    expect(await renderHtml(RouteResultCard, { ...base, running: true })).not.toContain('priced-with');
  });

  it("By a date's card says it", async () => {
    const t = textOf(
      await renderHtml(ByDateRouteCard, {
        route: { chain: [166, 247], reachAt: 1_815_000_000, ascendAt: 1_815_000_000, spare: 3600, legs: [] },
        deadline: 1_815_003_600,
        zone: 'UTC',
        pricedWith: line,
      })
    );
    expect(t).toContain(`${line}.`);
  });

  it('the panels pass the RUN\'s settings, and By a date no longer points at Your setup', () => {
    for (const f of ['ChainSearchPanel.vue', 'InsanePanel.vue']) {
      const src = read(f);
      expect(src, f).toContain(':priced-with="pricedWith"');
      expect(src, f).toContain('store.runSettingsUsed ? pricedWithLine(store.runSettingsUsed)');
    }
    const deadline = read('DeadlinePanel.vue');
    expect(deadline).not.toContain('with the hours and time off in Your setup');
    expect(deadline).toContain('result.value?.settings ? pricedWithLine(result.value.settings)');
    expect(deadline).toContain('{{ resultPricedWith }}.');
    const instant = read('InstantRoute.vue');
    expect(instant).toMatch(/exactPricedWith\.value = pricedWithLine\(\{\s+availability: inputs\.availability,/);
  });
});
