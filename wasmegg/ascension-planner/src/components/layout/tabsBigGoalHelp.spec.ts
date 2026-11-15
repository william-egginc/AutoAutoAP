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

describe('the site tabs are back at their round-2 size (Jordan: "not the chain finder tabs, those were fine")', () => {
  it('48 px at every width from sm, body-size bold; the picked tab keeps its ring', async () => {
    const html = await renderHtml(SiteTabs, { tabs: [tab('manual', 'Manual Planner'), tab('chain', 'Chain Finder')], current: 'chain' });
    const [off, on] = html.match(/<button\b[^>]*>/g) ?? [];
    for (const b of [off, on]) {
      expect(b).toContain('min-h-[48px] sm:min-h-[48px]');
      expect(b).not.toContain('lg:min-h-[56px]');
      expect(b).not.toContain('xl:text-title');
      expect(b).toMatch(/text-body font-bold/);
      // Six tabs beside Home and the menu fit one row at 1100 px (the full tour's pictures): trimmed padding from lg, the old from xl.
      expect(b).toContain('lg:px-4 xl:px-6');
    }
    expect(on).toContain('ring-2 ring-indigo-200');
    expect(off).not.toContain('ring-2');
    expect(html).toContain('grid grid-cols-2 w-full');
  });
});

describe('the Target TE | By a date switch is the page\'s subheading: bigger', () => {
  const sw = tplOf(read('components/auto/GoalSwitch.vue'));
  const btn = sw.match(/<button\b[^>]*>/)?.[0] ?? '';
  it('each side 48 px tall at every width, title-size bold words in mixed case (no caps label)', () => {
    expect(btn).toContain('min-h-[48px]');
    expect(btn).not.toContain('sm:min-h-0');
    expect(btn).toMatch(/text-title font-bold/);
    expect(btn).not.toMatch(/\blabel\b/);
  });
  it('wider sides, the picked one white and shadowed on the slate track, the other slate-600', () => {
    expect(btn).toMatch(/px-5 sm:px-8/);
    expect(sw).toContain("'bg-white text-slate-900 shadow-sm'");
    expect(sw).toContain("'text-slate-600 hover:text-slate-900'");
    expect(sw).toContain('bg-slate-100');
  });
  it('the words are Words\' own, as typed (Target TE, By a date)', async () => {
    const { GOAL_SWITCH } = await import('@/lib/chainFinderWords');
    expect([GOAL_SWITCH.target, GOAL_SWITCH.byDate]).toEqual(['Target TE', 'By a date']);
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
