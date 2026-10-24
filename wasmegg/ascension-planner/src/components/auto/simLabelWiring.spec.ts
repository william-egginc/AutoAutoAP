/**
 * The "sim" chip's wiring (lib/simLabel.ts, SimChip.vue), read from the sources: every place on the
 * Leaderboard tab that shows a finish or a TE ranking shows the chip next to it, the toggle sits with
 * the tab's filters, and the `sameBuild` guards are still there.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '../..');
const read = (f: string) => fs.readFileSync(path.join(SRC, f), 'utf8');

/** The source between `start` and the next `end` after it. */
function between(src: string, start: string, end: string): string {
  const i = src.indexOf(start);
  expect(i, start).toBeGreaterThanOrEqual(0);
  const j = src.indexOf(end, i + start.length);
  expect(j, end).toBeGreaterThan(i);
  return src.slice(i, j);
}

describe('the sim chip beside every ranking on the Leaderboard tab', () => {
  const panel = read('components/auto/LeaderboardPanel.vue');

  it('Race: beside the best plan’s finish', () => {
    expect(between(panel, '{{ finishDateText(e.best.finish, viewZone) }}', '</td>')).toContain(
      '<SimChip :stamp="e.best.row.simVersion" />'
    );
  });

  it('Race, opened: beside each plan’s finish', () => {
    const list = read('components/auto/LeaderboardPlanList.vue');
    expect(between(list, '{{ finishDateText(p.finish, viewZone) }}', '</td>')).toContain(
      '<SimChip :stamp="p.row.simVersion" />'
    );
  });

  it('Egg Day and By a date: beside the TE, and beside each other answer', () => {
    expect(between(panel, '{{ e.te }}', '</td>')).toContain('<SimChip :stamp="e.best.simVersion" />');
    expect(between(panel, '{{ o.finalTE }} TE</span>', 'via')).toContain('<SimChip :stamp="o.simVersion" />');
  });

  it('All runs: beside the finish', () => {
    expect(between(panel, '{{ finishDateText(line.finish, viewZone) }}', '</td>')).toContain(
      '<SimChip :stamp="line.row.simVersion" />'
    );
  });

  it('Insights: the runs table, each account’s earliest finish, and its top plans', () => {
    const ex = read('explorer/ChainExplorer.vue');
    expect(between(ex, '{{ finishDateText(judged.byId.get(row.id)?.finish ?? null, viewZone) }}', '</td>')).toContain(
      '<SimChip :stamp="row.simVersion" />'
    );
    expect(between(ex, '{{ finishDateText(block.best.finish, viewZone) }}', '</template>')).toContain(
      '<SimChip :stamp="block.best.row.simVersion" />'
    );
    const top = read('explorer/AccountTopPlans.vue');
    expect(between(top, '{{ p.finishText }}', '</td>')).toContain('<SimChip :stamp="p.sim" />');
  });
});

describe('Show runs from older simulators', () => {
  const panel = read('components/auto/LeaderboardPanel.vue');

  it('sits under the tabs, with the line that says how many are hidden', () => {
    const block = between(panel, 'Show runs from older simulators', '</div>');
    expect(block).toContain('{{\n          simHidden\n        }}');
    expect(panel).toMatch(
      /<label class="inline-flex min-h-\[44px\][^"]*">\s*<input v-model="showOlder" type="checkbox"/
    );
    // Under the tab list, above everything the tabs show.
    expect(panel.indexOf('Show runs from older simulators')).toBeGreaterThan(
      panel.indexOf('aria-label="Leaderboard views"')
    );
    expect(panel.indexOf('Show runs from older simulators')).toBeLessThan(panel.indexOf('<ChainExplorer v-if='));
  });

  it('filters every public view’s rows (not My runs), and Insights when it is embedded here', () => {
    expect(panel).toContain('myRunsMode.value ? publicShown.value : bySimToggle(publicShown.value, showOlder.value)');
    const ex = read('explorer/ChainExplorer.vue');
    expect(ex).toContain("props.embedded && props.part === 'insights' && !showOlder.value");
    // Nothing assigns the filtered list itself: loads go to loadedRows.
    expect(ex).not.toMatch(/\brows\.value = /);
  });

  it('keeps the sameBuild guards', () => {
    expect(read('components/auto/LeaderboardPlanList.vue')).toContain('!sameBuild(p.row, best.row)');
    expect(read('explorer/AccountTopPlans.vue')).toContain('sameBuild(row, bestRow)');
    expect(read('explorer/analysis.ts')).toContain('sameBuild(plan.row, best.row)');
  });
});
