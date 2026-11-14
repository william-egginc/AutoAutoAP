/**
 * Jordan, 14 Nov 2026, once the tabs are the page headings: (1) bigger tabs: about 56 px tall and text up a step (lg,
 * 18 px) from lg up, the picked tab clearly the strongest thing on the page; the phone keeps its 2 x 3 grid and a modest
 * step; (2) to pay for it, the intro line ("The soonest you can reach 490 TE…" and By a date's) moves into a "?" beside
 * the Target TE | By a date switch (layout/GoalHelp.vue), closed by default.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import SiteTabs from '@/components/SiteTabs.vue';
import { BYDATE_LINE, fastestLine } from '@/lib/layoutWords';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', f), 'utf8');
const tplOf = (src: string) => src.slice(src.indexOf('<template>'), src.lastIndexOf('</template>')).replace(/<!--[\s\S]*?-->/g, '');
const tab = (id: string, label: string) => ({ id, label, on: 'bg-indigo-600 text-white' });

describe('bigger tabs', () => {
  it('from lg: 56 px tall, from xl (1280) text-title (18 px), padding trimmed so six tabs stay on one row; the phone keeps 48 px and its grid', async () => {
    const html = await renderHtml(SiteTabs, { tabs: [tab('manual', 'Manual Planner'), tab('chain', 'Chain Finder')], current: 'chain' });
    const buttons = html.match(/<button\b[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(2);
    for (const b of buttons) {
      expect(b).toContain('lg:min-h-[56px]');
      expect(b).toContain('xl:text-title');
      expect(b).toContain('min-h-[48px]');
    }
    expect(html).toContain('grid grid-cols-2 w-full');
  });
  it('the picked tab is the strongest: its fill and a ring (the type scale has no heavier weight at this size)', async () => {
    const html = await renderHtml(SiteTabs, { tabs: [tab('manual', 'Manual Planner'), tab('chain', 'Chain Finder')], current: 'chain' });
    const [off, on] = html.match(/<button\b[^>]*>/g) ?? [];
    expect(on).toContain('ring-2 ring-indigo-200');
    expect(on).toContain('bg-indigo-600');
    expect(off).not.toContain('ring-2');
    expect(off).toContain('text-slate-500');
  });
});

describe('the intro in a "?" beside the switch', () => {
  it('the screens no longer draw their intro line', () => {
    expect(tplOf(read('components/auto/FastestRoute.vue'))).not.toContain('data-testid="fastest-line"');
    expect(tplOf(read('components/auto/ByDateScreen.vue'))).not.toContain('data-testid="bydate-line"');
  });
  it('GoalHelp: a real "?" button (aria-expanded, aria-controls, 44 px), the panel closed by default, the words unchanged', async () => {
    const { default: GoalHelp } = await import('./GoalHelp.vue');
    const html = await renderHtml(GoalHelp, { text: fastestLine(490), testid: 'fastest-line' });
    const btn = html.match(/<button[^>]*data-testid="goal-help"[^>]*>/)?.[0] ?? '';
    expect(btn).toContain('aria-expanded="false"');
    expect(btn).toMatch(/aria-controls="goal-help-/);
    expect(btn).toContain('min-h-[44px] min-w-[44px]');
    const panel = html.match(/<div[^>]*data-testid="goal-help-panel"[^>]*>/)?.[0] ?? '';
    expect(panel).toContain('hidden');
    expect(textOf(html)).toContain('The soonest you can reach 490 TE from your save and Setup.');
    expect(html).toContain('data-testid="fastest-line"');
  });
  it('App.vue puts it in the switch row, with the words of the side shown', () => {
    const app = tplOf(read('App.vue'));
    const g = app.indexOf('<GoalHelp');
    expect(g).toBeGreaterThan(app.indexOf('<GoalSwitch'));
    expect(g).toBeLessThan(app.indexOf('<FastestRoute'));
    expect(app.slice(g, app.indexOf('/>', g))).toMatch(/:text="autoView === 'fastest' \? fastestLine\(chainSearchStore\.finalTE\) : BYDATE_LINE"/);
    expect(BYDATE_LINE).toContain('The most TE you can reach by a date');
    // On a phone the switch gives up the room the "?" needs, so the "?" shares its row (no extra row).
    expect(app.slice(app.indexOf('<GoalSwitch'), app.indexOf('/>', app.indexOf('<GoalSwitch')))).toContain('class="min-w-0 flex-1 sm:flex-none"');
  });
});
