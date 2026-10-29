/**
 * YOUR EGGS: NEXT TE | TO GOAL (28 Oct 2026, pieha: the total time to the goal too, not only the next TE). A toggle on
 * Your eggs; "to goal" gives every egg a time: the egg being laid at the save's rate, every other egg from a shift to
 * it (the after-shift model, lib/nextTeEgg.ts), each egg's own thresholds. A By a date goal: the plan's finish. The
 * choice is remembered in this browser; "next TE" by default.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aboutWords, eggClockLines, eggGoalLines, readEggsView, writeEggsView, EGGS_VIEW_KEY } from './nextTeEgg';
import { eggLines } from './farmFacts';
import { getThresholdForTE } from './truthEggs';
import { renderHtml, textOf } from '@/test/renderComponent';
import YourEggs from '@/components/myruns/YourEggs.vue';

const D = 86400;
const NOW = 1_800_000_000;
// 150 TE in all (over 100: habs full straight after a shift). Curiosity laid at 1e12/s, each egg at its 30th TE's start.
const at30 = getThresholdForTE(30);
const delivered = { curiosity: at30, kindness: at30, integrity: at30, humility: at30, resilience: at30 };
const rates = { maxHabs: 1e10, perChicken: 200, maxElr: 2e12, ihr: 1e4 };

function lines(goal: Parameters<typeof eggGoalLines>[0]['goal']) {
  const eggs = eggLines(delivered, {}, 'curiosity', 1e12, goal?.kind === 'te' ? goal.teLeft : null);
  return eggGoalLines({ eggs, delivered, totalTe: 150, rates, goal, now: NOW, saveSeconds: NOW });
}

describe('eggGoalLines: every egg, to the goal', () => {
  it("Fastest to N TE: the egg being laid at the save's rate, the others after a shift, each by its own thresholds", () => {
    const l = lines({ kind: 'te', teLeft: 2 });
    const need = getThresholdForTE(32) - at30;
    expect(l.curiosity).toMatch(/^to goal about .+ at this rate$/);
    expect(l.kindness).toMatch(/^to goal about .+ after you shift here$/);
    // The other eggs at the after-shift rate (2e12, habs full): half the save's-rate time.
    const days = (s: string) => s.replace(/^to goal about ~?/, '').replace(/ (at this rate|after you shift here)$/, '');
    expect(days(l.kindness)).not.toBe(days(l.curiosity));
    expect(need / 2e12).toBeGreaterThan(0);
    expect(Object.keys(l).sort()).toEqual(['curiosity', 'humility', 'integrity', 'kindness', 'resilience']);
  });
  it("more than the egg's room: to its last TE (pieha, below); over about 10 years: not at this rate", () => {
    expect(lines({ kind: 'te', teLeft: 500 }).kindness).toMatch(/^to goal about .+ after you shift here$/);
    const slow = eggGoalLines({
      eggs: eggLines(delivered, {}, 'curiosity', 1e-3, 60),
      delivered,
      totalTe: 150,
      rates: { ...rates, maxElr: 1e-3 },
      goal: { kind: 'te', teLeft: 60 },
      now: NOW,
      saveSeconds: NOW,
    });
    expect(slow.kindness).toBe('to goal after you shift here: not at this rate (over 10 years)');
  });
  it("a By a date goal: the plan's finish for every egg; no plan: nothing", () => {
    const l = lines({ kind: 'date', endTE: 412, finish: NOW + 5 * D + 3 * 3600, zone: 'America/Los_Angeles' });
    expect(l.kindness).toMatch(/^to goal: 412 TE .+, in ~5d 3h$/);
    expect(l.curiosity).toBe(l.kindness);
    expect(lines(null)).toEqual({});
  });
});

/**
 * PIEHA'S CASE (ux35-a, 28 Oct 2026): following Fastest to 490 TE at 350 TE (70 on each egg), 140 TE still to earn.
 * No egg can give all 140 (98 at most each), but every egg has room for its own part: the route takes each to 98.
 * Every egg said "to goal: more TE than this egg has left" (the whole TE left was set against one egg's room); each
 * egg's goal is the TE it still holds, up to the TE left. Only an egg with no TE left says so.
 */
describe("eggGoalLines: a goal bigger than one egg's room (pieha)", () => {
  const at70 = getThresholdForTE(70);
  const d70 = { curiosity: at70, kindness: at70, integrity: at70, humility: at70, resilience: at70 };
  it('following 490 at 350 TE: every egg with room gets a time to its last TE, not "more TE than this egg has left"', () => {
    const eggs = eggLines(d70, {}, 'curiosity', 1e15, 140);
    const l = eggGoalLines({
      eggs,
      delivered: d70,
      totalTe: 350,
      rates,
      goal: { kind: 'te', teLeft: 140 },
      now: NOW,
      saveSeconds: NOW,
    });
    expect(eggs[0].goalInSeconds).toBeCloseTo((getThresholdForTE(98) - at70) / 1e15, 3);
    expect(l.curiosity).toMatch(/^to goal about .+ at this rate$/);
    for (const egg of ['kindness', 'integrity', 'humility', 'resilience']) {
      expect(l[egg]).not.toBe('to goal: more TE than this egg has left');
      expect(l[egg]).toMatch(/^to goal about .+ after you shift here$/);
    }
    // Kindness at the after-shift rate (habs full over 100 TE): its 98th TE's threshold, less what it has.
    const t = (getThresholdForTE(98) - at70) / rates.maxElr;
    expect(l.kindness).toBe(`to goal about ${aboutWords(t)} after you shift here`);
  });
  it("a smaller goal still fits in one egg: the TE left, not the egg's last TE", () => {
    const eggs = eggLines(d70, {}, 'curiosity', 1e15, 5);
    const l = eggGoalLines({
      eggs,
      delivered: d70,
      totalTe: 350,
      rates,
      goal: { kind: 'te', teLeft: 5 },
      now: NOW,
      saveSeconds: NOW,
    });
    expect(l.kindness).toBe(
      `to goal about ${aboutWords((getThresholdForTE(75) - at70) / rates.maxElr)} after you shift here`
    );
  });
  it('an egg with no TE left (98) says so; the clock lines time the others', () => {
    const d = { ...d70, kindness: getThresholdForTE(98) };
    const eggs = eggLines(d, {}, 'curiosity', 1e15, 112);
    const l = eggGoalLines({
      eggs,
      delivered: d,
      totalTe: 378,
      rates,
      goal: { kind: 'te', teLeft: 112 },
      now: NOW,
      saveSeconds: NOW,
    });
    expect(l.kindness).toBe('to goal: more TE than this egg has left');
    expect(l.integrity).toMatch(/^to goal about .+ after you shift here$/);
    const c = eggClockLines({
      eggs,
      delivered: d,
      totalTe: 378,
      rates,
      teLeft: 112,
      now: NOW,
      saveSeconds: NOW,
      zone: 'America/Los_Angeles',
      shifts: [],
    });
    expect(c.goal.integrity).toMatch(/^to goal about .+ if you shift now$/);
    expect(c.goal.curiosity).toMatch(/^to goal about /);
    expect(c.goal.kindness).toBeUndefined();
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
    eggs: eggLines(delivered, {}, 'curiosity', 1e12, 2),
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
  it("a 44 px segmented control, next TE pressed by default; to goal shows every egg's goal line", async () => {
    const goalLines = lines({ kind: 'te', teLeft: 2 });
    const html = await renderHtml(YourEggs, { ...props, goalLines });
    expect(html).toContain('data-testid="now-eggs-view"');
    expect(html).toMatch(/min-h-\[44px\][^>]*aria-pressed="true"[^>]*>\s*next TE/);
    expect(textOf(html)).toContain('next TE in ~2d after you shift here');
    const goal = await renderHtml(YourEggs, { ...props, goalLines, view: 'goal' });
    expect(textOf(goal)).toContain(goalLines.kindness);
    expect(textOf(goal)).toContain(goalLines.curiosity);
    expect(textOf(goal)).not.toContain('next TE in ~2d after you shift here');
  });
  it('no goal lines: no toggle', async () => {
    expect(await renderHtml(YourEggs, { ...props, goalLines: {} })).not.toContain('data-testid="now-eggs-view"');
  });
});
