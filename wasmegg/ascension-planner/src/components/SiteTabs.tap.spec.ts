/**
 * Tab buttons at least 44 px tall on a phone (Jordan, 21 Oct 2026): the top tabs (SiteTabs.vue) and the
 * Auto Planner's sub-tabs (App.vue), with the old sizes from sm up and the 3, 4 and 5 tab grids unchanged.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import SiteTabs from './SiteTabs.vue';

const tab = (id: string, label: string) => ({ id, tab: id, label, on: 'bg-white text-slate-900' });
const ALL = [
  tab('manual', 'Manual Planner'),
  tab('auto', 'Auto Planner'),
  tab('myruns', 'My runs'),
  tab('compare', 'Leaderboard'),
  tab('science', 'Science'),
];

describe('SiteTabs', () => {
  for (const n of [3, 4, 5])
    it(`${n} tabs: each at least 44 px below sm, the old size from sm, the two-row grid kept`, async () => {
      const html = await renderHtml(SiteTabs, { tabs: ALL.slice(0, n), current: 'auto' });
      const buttons = html.match(/<button\b[^>]*>/g) ?? [];
      expect(buttons).toHaveLength(n);
      for (const b of buttons) {
        expect(b).toContain('min-h-[44px]');
        expect(b).toContain('sm:min-h-0');
        expect(b).toContain('py-2.5');
      }
      const spans = buttons.map(b => b.match(/col-span-\d/)?.[0]);
      const second = { 3: 'col-span-6', 4: 'col-span-3', 5: 'col-span-2' }[n];
      expect(spans).toEqual(['col-span-3', 'col-span-3', ...Array(n - 2).fill(second)]);
      expect(textOf(html)).toContain('Auto Planner');
    });
});

describe('Auto Planner sub-tabs (App.vue)', () => {
  const app = fs.readFileSync(path.resolve(__dirname, '../App.vue'), 'utf8');
  const nav = app.slice(
    app.indexOf('<nav v-if="playerId"'),
    app.indexOf('<div v-else-if="plannerTab === \'science\'"')
  );

  it('Single run, Fastest, Highest TE by a date and My runs: at least 44 px below sm, old size from sm', () => {
    const buttons = nav.match(/<button\b[\s\S]*?>/g) ?? [];
    expect(buttons).toHaveLength(2); // the v-for and My runs
    for (const b of buttons) {
      expect(b).toContain('min-h-[44px] sm:min-h-0');
      expect(b).toContain('py-2 -mb-px border-b-2');
    }
  });
});
