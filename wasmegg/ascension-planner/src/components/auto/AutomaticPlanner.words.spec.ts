/** Review W8 (15 Nov 2026): the tab is "Auto Planner", so its card is too, not Joo's "Auto-AP". */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync(new URL('./AutomaticPlanner.vue', import.meta.url), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

describe('Auto Planner card words', () => {
  it('says Auto Planner, never Auto-AP, to the player', () => {
    expect(src).not.toContain('Auto-AP');
    expect(src).toContain('<h2 class="text-title font-bold text-slate-900">Auto Planner</h2>');
    expect(src).toContain("The Auto Planner doesn't plan around your awake hours.");
    expect(src).toContain('The Auto Planner is really built for players farther along.');
    expect(src).toContain('The Auto Planner tries several build lengths and keeps the fastest');
  });
});
