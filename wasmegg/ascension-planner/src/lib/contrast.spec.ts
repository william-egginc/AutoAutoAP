/**
 * The contrast fixes of the UX review of 25 Oct 2026: the WCAG ratio itself, then each shade the screens now use,
 * on the background it sits on, at 4.5:1 or more (and the shade it replaced, below it). Tailwind's own palette.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import colors from 'tailwindcss/colors';
import { AA, contrastRatio, over, rgbOf } from './contrast';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');
const WHITE = '#ffffff';
const PAGE = colors.gray[100]; // App.vue's bg-gray-100
const { slate, indigo, emerald } = colors;

describe('contrastRatio', () => {
  it('is 21 for black on white, 1 for a colour on itself, and the same either way round', () => {
    expect(contrastRatio('#000000', WHITE)).toBeCloseTo(21, 5);
    expect(contrastRatio(slate[500], slate[500])).toBe(1);
    expect(contrastRatio(slate[400], WHITE)).toBeCloseTo(contrastRatio(WHITE, slate[400]), 10);
  });
  it('matches the published figures (slate-400 on white about 2.56, slate-500 about 4.76)', () => {
    expect(contrastRatio(slate[400], WHITE)).toBeCloseTo(2.56, 2);
    expect(contrastRatio(slate[500], WHITE)).toBeCloseTo(4.76, 2);
  });
  it('lays an opacity over its background, and refuses a colour it cannot read', () => {
    expect(over('#000000', 0.5, WHITE)).toEqual([128, 128, 128]);
    expect(over(indigo[700], 1, WHITE)).toEqual(rgbOf(indigo[700]));
    expect(() => rgbOf('slate')).toThrow();
  });
});

describe('the shades now used pass AA where they sit', () => {
  const pairs: [string, string | [number, number, number], string, string | [number, number, number]][] = [
    ['Auto Planner and Science tabs, not picked (on the page)', slate[600], 'was slate-400', slate[400]],
    ['the top tabs, not picked (on slate-50)', slate[500], 'was slate-400', slate[400]],
    ['the instant answer table headers and helper lines (on white)', slate[500], 'was slate-400', slate[400]],
    ['Fast / Exact / Custom, not picked (on slate-100)', slate[600], 'was slate-400', slate[400]],
    ['Fast / Exact / Custom picked, their two small lines (on white)', indigo[600], 'was indigo-400', indigo[400]],
  ];
  const bgOf: Record<number, string> = { 0: PAGE, 1: slate[50], 2: WHITE, 3: slate[100], 4: WHITE };
  pairs.forEach(([what, now, , was], i) => {
    it(what, () => {
      expect(contrastRatio(now, bgOf[i])).toBeGreaterThanOrEqual(AA);
      expect(contrastRatio(was, bgOf[i])).toBeLessThan(AA);
    });
  });
  it("the leaderboard's view chips, not picked: indigo-700 at 90% on the panel (indigo-50 at 40% over the page)", () => {
    const panel = over(indigo[50], 0.4, PAGE);
    const hex = '#' + panel.map(v => v.toString(16).padStart(2, '0')).join('');
    expect(contrastRatio(over(indigo[700], 0.9, hex), panel)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(over(indigo[700], 0.6, hex), panel)).toBeLessThan(AA);
  });
  it('the picked Prefer fewer chip: white on emerald-700 (was emerald-600)', () => {
    expect(contrastRatio(WHITE, emerald[700])).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(WHITE, emerald[600])).toBeLessThan(AA);
  });
});

describe('and the screens use them', () => {
  it('App.vue: the Auto Planner and Science tabs not picked are slate-600', () => {
    const app = read('App.vue');
    expect(app.match(/'border-transparent text-slate-600 hover:text-slate-900'/g)).toHaveLength(2);
    // (The Auto Planner's My runs copy, also slate-600, is gone: My runs is a top tab only since 26 Oct 2026.)
    expect(app).not.toContain('data-testid="auto-tab-myruns"');
    expect(app).not.toContain('text-slate-400 hover:text-slate-700');
  });
  it('SiteTabs.vue: slate-500 when not picked', () => {
    expect(read('components/SiteTabs.vue')).toContain("'text-slate-500 hover:text-slate-700 hover:bg-slate-50'");
  });
  it('InstantRoute.vue: both tables’ headers 10 px slate-500; the checked-in and Pricing lines slate-500', () => {
    const src = read('components/auto/InstantRoute.vue');
    expect(src.match(/<tr class="text-left text-\[10px\] font-black uppercase tracking-widest text-slate-500 align-bottom">/g)).toHaveLength(2);
    expect(src).not.toMatch(/<tr class="[^"]*text-\[9px\][^"]*text-slate-400/);
    expect(src).toContain('<span v-if="ms !== null" class="text-small text-slate-500"');
    expect(src).toMatch(/<p v-if="bracketStatus === 'running'[^"]*" class="text-body text-slate-500"/);
  });
  it('SearchPanel.vue: Fast / Exact / Custom in slate-600, indigo-600 when picked', () => {
    const src = read('components/auto/SearchPanel.vue');
    expect(src).toContain(`'bg-white text-indigo-700 shadow' : 'text-slate-600 hover:text-slate-800'`);
    expect(src.match(/selected === o\.id \? 'text-indigo-600' : 'text-slate-600'/g)).toHaveLength(2);
  });
  it('LeaderboardPanel.vue and PreferFewerControl.vue', () => {
    expect(read('components/auto/LeaderboardPanel.vue')).toContain("'border-transparent text-indigo-700/90 hover:text-indigo-800'");
    expect(read('components/auto/PreferFewerControl.vue')).toContain("const ON = 'border-emerald-700 bg-emerald-700 text-white';");
  });
});
