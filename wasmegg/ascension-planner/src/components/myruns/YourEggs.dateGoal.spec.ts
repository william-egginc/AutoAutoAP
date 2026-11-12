/**
 * YOUR EGGS, "to goal" ON A DATE GOAL (spec-myruns-fix, 12 Nov 2026, Jordan's real save, Egg Day 2027 route
 * 218 → 247 → 278 → 313): the goal's line is the same for every egg (the plan's finish), so it is said once above the
 * eggs (spec-uxpass item 5), and under the egg names every line was gone: five names over bars near zero. Each egg
 * keeps its own lines then: its next TE (after a shift to it, or at the save's rate) and its day and time, the same
 * as "next TE" shows, so the bars (to the next TE) say what they measure. A Fastest goal's own lines are unchanged.
 */
import { describe, expect, it } from 'vitest';
import { eggGoalLines } from '@/lib/nextTeEgg';
import { eggLines } from '@/lib/farmFacts';
import { getThresholdForTE } from '@/lib/truthEggs';
import { renderHtml, textOf } from '@/test/renderComponent';
import YourEggs from './YourEggs.vue';

const D = 86400;
const NOW = 1_800_000_000;
const at30 = getThresholdForTE(30);
const delivered = { curiosity: at30, kindness: at30, integrity: at30, humility: at30, resilience: at30 };
const rates = { maxHabs: 1e10, perChicken: 200, maxElr: 2e12, ihr: 1e4 };
const EGGS = ['curiosity', 'integrity', 'humility', 'resilience', 'kindness'];

function lines(goal: Parameters<typeof eggGoalLines>[0]['goal']) {
  const eggs = eggLines(delivered, {}, 'curiosity', 1e12, goal?.kind === 'te' ? goal.teLeft : null);
  return eggGoalLines({ eggs, delivered, totalTe: 150, rates, goal, now: NOW, saveSeconds: NOW });
}

const afterShift = {
  lines: {
    integrity: 'next TE in ~7d 6h after you shift here',
    humility: 'next TE in ~6d 18h after you shift here',
    resilience: 'next TE in ~6d 18h after you shift here',
    kindness: 'next TE in ~2d after you shift here',
  },
  note: 'note',
};
const clockLines = {
  next: Object.fromEntries(EGGS.map(e => [e, `next TE about Sat, Nov 21 at 3:00 AM (${e})`])),
  goal: {} as Record<string, string>,
};
const props = {
  eggs: eggLines(delivered, {}, 'curiosity', 1e12, null),
  facts: null,
  shiftsDone: 0,
  nextShiftCost: null,
  plannedShifts: null,
  clothedEquipped: null,
  clothedEarnings: null,
  now: NOW,
  saveSeconds: NOW,
  afterShift,
  clockLines,
};

/** Each egg's block, text only, in card order. */
function blocks(html: string): string[] {
  return html
    .split('data-testid="now-egg"')
    .slice(1)
    .map(b => textOf(b.split('data-testid="now-eggs-after-shift-note"')[0]));
}

describe('YourEggs: "to goal" on a date goal keeps every egg\'s own lines', () => {
  const goalLines = lines({ kind: 'date', endTE: 313, finish: NOW + 247 * D, zone: 'America/Los_Angeles' });

  it('the goal said once, and under each egg its next TE line and its day and time, as in "next TE"', async () => {
    const goal = await renderHtml(YourEggs, { ...props, goalLines, view: 'goal' });
    expect(goal).toContain('data-testid="now-eggs-goal-once"');
    expect(textOf(goal).split(goalLines.kindness).length - 1).toBe(1);
    const b = blocks(goal);
    expect(b).toHaveLength(5);
    for (const egg of ['integrity', 'humility', 'resilience', 'kindness'] as const) {
      expect(b.find(x => x.includes(afterShift.lines[egg]))).toBeTruthy();
    }
    // The egg being laid: its own next TE at the save's rate (lib/farmFacts.ts `nextTeLine`).
    expect(b[0]).toMatch(/next TE/);
    for (const egg of EGGS) expect(textOf(goal)).toContain(clockLines.next[egg]);
    // The same lines as the "next TE" view.
    const next = await renderHtml(YourEggs, { ...props, goalLines, view: 'next' });
    expect(blocks(goal)).toEqual(blocks(next));
  });

  it('every egg block has a line under its bar (never a name and a bar alone)', async () => {
    const goal = await renderHtml(YourEggs, { ...props, goalLines, view: 'goal' });
    for (const b of blocks(goal)) expect(b.replace(/^\S+ \d+ TE/, '').trim().length).toBeGreaterThan(0);
  });

  it("a Fastest goal's own per-egg lines are unchanged: its goal lines, not the next TE ones", async () => {
    const own = lines({ kind: 'te', teLeft: 2 });
    const html = await renderHtml(YourEggs, { ...props, goalLines: own, view: 'goal' });
    expect(html).not.toContain('data-testid="now-eggs-goal-once"');
    expect(html.match(/data-testid="now-egg-to-goal"/g)).toHaveLength(5);
    expect(textOf(html)).toContain(own.kindness);
    expect(textOf(html)).not.toContain(afterShift.lines.kindness);
  });
});
