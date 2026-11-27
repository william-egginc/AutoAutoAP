/**
 * YOUR EGGS: NEXT TE | TO GOAL (28 Oct 2026, pieha). A toggle on Your eggs, remembered in this browser; "next TE" by
 * default. Since spec-myruns-fix2 (13 Nov 2026, Jordan) "to goal" is what the followed plan says: its goal TE and
 * finish, the same line for every egg (said once above the eggs), for any goal; no plan, no line and no toggle. The
 * per-egg "if every TE still to earn came from this egg" times (28 Oct, pieha's ux35-a case: every egg timed to its
 * own last TE) are gone: they were "if you shift here" hypotheticals. lib/yourEggsViews.spec.ts and
 * components/myruns/YourEggs.views.spec.ts pin each view's lines.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eggGoalLines, readEggsView, writeEggsView, EGGS_VIEW_KEY } from './nextTeEgg';
import { eggLines } from './farmFacts';
import { getThresholdForTE } from './truthEggs';
import { renderHtml, textOf } from '@/test/renderComponent';
import YourEggs from '@/components/myruns/YourEggs.vue';

const D = 86400;
const NOW = 1_800_000_000;
const ZONE = 'America/Los_Angeles';
const at30 = getThresholdForTE(30);
const delivered = { curiosity: at30, kindness: at30, integrity: at30, humility: at30, resilience: at30 };

function lines(goal: Parameters<typeof eggGoalLines>[0]['goal']) {
  return eggGoalLines({ eggs: eggLines(delivered, {}, 'curiosity', 1e12, null), goal, now: NOW });
}

describe('eggGoalLines: the followed plan\'s goal', () => {
  it("the plan's goal TE and finish, the same for every egg; no plan or a finish passed: nothing", () => {
    const l = lines({ endTE: 412, finish: NOW + 5 * D + 3 * 3600, zone: ZONE });
    expect(l.kindness).toMatch(/^to goal: 412 TE .+, in ~5d 3h$/);
    expect(new Set(Object.values(l)).size).toBe(1);
    expect(Object.keys(l).sort()).toEqual(['curiosity', 'humility', 'integrity', 'kindness', 'resilience']);
    expect(lines(null)).toEqual({});
    expect(lines({ endTE: 412, finish: NOW - 60, zone: ZONE })).toEqual({});
  });
});

describe('the choice, remembered in this browser', () => {
  let mem: Map<string, string>;
  beforeEach(() => {
    mem = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("'next' by default; 'goal' once picked; a broken storage reads 'next'", () => {
    expect(readEggsView()).toBe('next');
    writeEggsView('goal');
    expect(mem.get(EGGS_VIEW_KEY)).toBe('goal');
    expect(readEggsView()).toBe('goal');
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(readEggsView()).toBe('next');
    expect(() => writeEggsView('goal')).not.toThrow();
  });
});

describe('YourEggs: the toggle', () => {
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
    afterShift: { lines: { kindness: 'next TE in ~2d after you shift here' }, note: 'note' },
  };
  it("a 44 px segmented control, next TE pressed by default; to goal says the plan's goal once, not under each egg", async () => {
    const goalLines = lines({ endTE: 412, finish: NOW + 5 * D + 3 * 3600, zone: ZONE });
    const html = await renderHtml(YourEggs, { ...props, goalLines });
    expect(html).toContain('data-testid="now-eggs-view"');
    expect(html).toMatch(/min-h-\[44px\][^>]*aria-pressed="true"[^>]*>\s*next TE/);
    expect(textOf(html)).toContain('next TE in ~2d after you shift here');
    const goal = await renderHtml(YourEggs, { ...props, goalLines, view: 'goal' });
    expect(goal).toContain('data-testid="now-eggs-goal-once"');
    expect(textOf(goal).split(goalLines.kindness).length - 1).toBe(1);
    expect(textOf(goal)).not.toContain('next TE in ~2d after you shift here');
  });
  it('no goal lines (no plan): no toggle', async () => {
    expect(await renderHtml(YourEggs, { ...props, goalLines: {} })).not.toContain('data-testid="now-eggs-view"');
  });
});
