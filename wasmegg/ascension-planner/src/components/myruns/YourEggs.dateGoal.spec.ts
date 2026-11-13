/**
 * YOUR EGGS, "to goal" ON A DATE GOAL (spec-myruns-fix, 12 Nov 2026, Jordan's real save, Egg Day 2027 route
 * 218 → 247 → 278 → 313): the goal's line is the same for every egg (the plan's finish), so it is said once above the
 * eggs (spec-uxpass item 5), and under the egg names every line was gone: five names over bars near zero. That fix gave
 * each egg the "next TE" lines in "to goal" too, which mixed the views (spec-myruns-fix2, 13 Nov 2026: Jordan). Now
 * each egg says what the plan says of it (a shift to it, on it now, or none in the next shifts): still never a name
 * over a bar alone, and never a "next TE" line in "to goal". YourEggs.views.spec.ts pins each view's lines.
 */
import { describe, expect, it } from 'vitest';
import { eggClockLines, eggGoalLines } from '@/lib/nextTeEgg';
import { eggLines } from '@/lib/farmFacts';
import { getThresholdForTE } from '@/lib/truthEggs';
import { EGG_LINE, EGG_VIEW_LINES } from '@/lib/yourEggsWords';
import { renderHtml, textOf } from '@/test/renderComponent';
import YourEggs from './YourEggs.vue';

const D = 86400;
const NOW = 1_800_000_000;
const ZONE = 'America/Los_Angeles';
const at30 = getThresholdForTE(30);
const delivered = { curiosity: at30, kindness: at30, integrity: at30, humility: at30, resilience: at30 };
const rates = { maxHabs: 1e10, perChicken: 200, maxElr: 2e12, ihr: 1e4 };
const eggs = eggLines(delivered, {}, 'curiosity', 1e12, null);

const props = {
  eggs,
  facts: null,
  shiftsDone: 0,
  nextShiftCost: null,
  plannedShifts: null,
  clothedEquipped: null,
  clothedEarnings: null,
  now: NOW,
  saveSeconds: NOW,
  afterShift: { lines: { kindness: 'next TE in ~2d after you shift here' }, note: 'note' },
  goalLines: eggGoalLines({ eggs, goal: { endTE: 313, finish: NOW + 247 * D, zone: ZONE }, now: NOW }),
  clockLines: eggClockLines({
    eggs,
    delivered,
    totalTe: 150,
    rates,
    now: NOW,
    saveSeconds: NOW,
    zone: ZONE,
    shifts: [{ kind: 'shift', egg: 'kindness', at: NOW + 3 * D }],
    plan: true,
  }),
};

/** Each egg's block: its text and line kinds, in card order. */
function blocks(html: string): { text: string; kinds: string[] }[] {
  return html
    .split('data-testid="now-egg"')
    .slice(1)
    .map(b => b.split('data-testid="now-eggs-after-shift-note"')[0])
    .map(b => ({ text: textOf(b), kinds: [...b.matchAll(/data-line="([^"]+)"/g)].map(m => m[1]) }));
}

describe('YourEggs: "to goal" on a date goal', () => {
  it('the goal said once; every egg block has a plan line under its bar (never a name and a bar alone)', async () => {
    const goal = await renderHtml(YourEggs, { ...props, view: 'goal' });
    expect(goal).toContain('data-testid="now-eggs-goal-once"');
    expect(textOf(goal).split(props.goalLines.kindness).length - 1).toBe(1);
    const b = blocks(goal);
    expect(b).toHaveLength(5);
    for (const x of b) {
      expect(x.text.replace(/^\S+ \d+ TE/, '').trim().length).toBeGreaterThan(0);
      expect(x.kinds).toHaveLength(1);
      expect(EGG_VIEW_LINES.goal).toContain(x.kinds[0]);
    }
    expect(b[4].kinds).toEqual([EGG_LINE.goalShift]);
  });
  it('not the "next TE" lines (the views are no longer the same)', async () => {
    const goal = await renderHtml(YourEggs, { ...props, view: 'goal' });
    const next = await renderHtml(YourEggs, { ...props, view: 'next' });
    expect(blocks(goal)).not.toEqual(blocks(next));
    expect(textOf(goal)).not.toContain(props.afterShift.lines.kindness);
  });
});
