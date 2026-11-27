/**
 * UX SWEEP R9, 18 Nov 2026 (M3): two help icons for the same job (a "?" 14 px beside the answer's notes, an "i" beside Follow this route and
 * Simulate this plan). One style: the "?" in a small circle (CardHelp.vue); Tip.vue's drawn glyph is the same "?" and size, its button
 * keeps its 44 px target.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');

describe('one help icon', () => {
  const tip = read('Tip.vue');
  it("Tip's drawn glyph is a \"?\", not an \"i\"", () => {
    expect(tip).toMatch(/\.tip-i::before\s*\{\s*content:\s*'\?'/);
    expect(tip).not.toMatch(/content:\s*'i'/);
  });
  it('and the same size as the card help (14 px), the button still 44 px', () => {
    expect(tip).toMatch(/class="tip-i[^"]*\bh-3\.5 w-3\.5\b/);
    expect(tip).toContain('min-h-[44px] min-w-[44px]');
  });
});

describe('every row tight says it once (M3)', () => {
  const src = read('auto/InstantRoute.vue');
  it('the table has one line above the rows when every row is tight, and no tag on each row then', () => {
    expect(src).toContain('allRowsTight');
    expect(src).toContain('data-testid="counts-all-tight"');
    expect(src).toMatch(/v-if="rowTight\(r\) && !allRowsTight"/);
  });
});

describe('Chain Finder has one "?" look (QA ed206e60b, 18 Nov 2026)', () => {
  const goal = read('layout/GoalHelp.vue');
  const card = read('auto/CardHelp.vue');
  const help = read('auto/HelpTip.vue');
  const circle = /h-3\.5 w-3\.5[^"]*border border-slate-400|border border-slate-400[^"]*h-3\.5 w-3\.5/;
  it("About this page's circle is the 14 px card-help circle, its button still 44 px", () => {
    expect(goal).toMatch(circle);
    expect(goal).not.toContain('h-6 w-6');
    expect(goal).toContain('min-h-[44px] min-w-[44px]');
  });
  it('the card help and the plain help tip draw the same circle border', () => {
    expect(card).toMatch(circle);
    expect(help).toMatch(circle);
  });
});

describe('Your routes at a glance fold is a 44 px target on a phone', () => {
  it('its summary is at least 44 px high up to sm', () => {
    const src = read('myruns/RouteScatter.vue');
    expect(src).toMatch(/<summary class="[^"]*min-h-\[44px\][^"]*sm:min-h-0/);
  });
});
