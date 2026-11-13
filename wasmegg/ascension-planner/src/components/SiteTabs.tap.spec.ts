/**
 * Tab buttons at least 44 px tall on a phone (Jordan, 21 Oct 2026): the top tabs (SiteTabs.vue) and Chain Finder's goal
 * switch (GoalSwitch.vue; was the Auto Planner's sub-tabs in App.vue), with the old sizes from sm up. Since Chain Finder
 * (12 Nov 2026) the top tabs sit two a row below lg (2 x 2 with My runs; an odd last tab across its row).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import SiteTabs from './SiteTabs.vue';

const tab = (id: string, label: string) => ({ id, label, on: 'bg-white text-slate-900' });
const ALL = [
  tab('manual', 'Manual Planner'),
  tab('auto', 'Auto Planner'),
  tab('chain', 'Chain Finder'),
  tab('myruns', 'My runs'),
  tab('compare', 'Leaderboard'),
  tab('science', 'Science'),
];

describe('SiteTabs', () => {
  for (const n of [3, 4, 5, 6])
    it(`${n} tabs: each at least 44 px below sm, the old size from sm, two a row`, async () => {
      const html = await renderHtml(SiteTabs, { tabs: ALL.slice(0, n), current: 'auto' });
      expect(html).toContain('grid grid-cols-2 w-full');
      const buttons = html.match(/<button\b[^>]*>/g) ?? [];
      expect(buttons).toHaveLength(n);
      for (const b of buttons) {
        expect(b).toContain('min-h-[44px]');
        expect(b).toContain('sm:min-h-0');
        expect(b).toContain('py-2.5');
      }
      const spans = buttons.map(b => b.match(/col-span-\d/)?.[0]);
      expect(spans).toEqual(Array.from({ length: n }, (_, i) => (n % 2 === 1 && i === n - 1 ? 'col-span-2' : 'col-span-1')));
      expect(textOf(html)).toContain('Auto Planner');
    });

  it('lights the tab whose id is current: the Auto Planner and Chain Finder apart (they share plannerTab)', async () => {
    for (const current of ['auto', 'chain']) {
      const buttons = (await renderHtml(SiteTabs, { tabs: ALL.slice(0, 4), current })).match(/<button\b[^>]*>/g) ?? [];
      const lit = buttons.map(b => b.includes('aria-current="page"'));
      expect(lit).toEqual([false, current === 'auto', current === 'chain', false]);
    }
  });

  it('Chain Finder has its own icon', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'SiteTabs.vue'), 'utf8');
    const icons = src.slice(src.indexOf('const ICONS'));
    expect(icons).toMatch(/\n  chain:\n    'M13\.828 10\.172/);
  });
});

describe("Chain Finder's goal switch (GoalSwitch.vue; was the Auto Planner sub-tabs in App.vue)", () => {
  const sw = fs.readFileSync(path.resolve(__dirname, 'auto/GoalSwitch.vue'), 'utf8');

  it('Target TE and By a date: at least 44 px below sm, the old size from sm', () => {
    const buttons = sw.match(/<button\b[\s\S]*?>/g) ?? [];
    expect(buttons).toHaveLength(1); // the v-for
    expect(buttons[0]).toContain('min-h-[44px] sm:min-h-0');
  });
});
