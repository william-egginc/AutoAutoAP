/**
 * YOUR EGGS, EACH VIEW SHOWS ONLY ITS LINES (spec-myruns-fix2, 13 Nov 2026). The view-level contract on the rendered
 * card: every line under an egg carries its kind (data-line, lib/yourEggsWords.ts `EGG_LINE`), and each view shows
 * only its own kinds (`EGG_VIEW_LINES`), with the phrases one view must never say kept out of it. The lines come from
 * the real words functions (lib/nextTeEgg.ts). Fixtures: the egg being laid with a goal's TE left, four other eggs,
 * a followed plan with a planned shift to Kindness; and no plan.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { afterShiftLines, eggClockLines, eggGoalLines } from '@/lib/nextTeEgg';
import { planEggGoalLines } from '@/lib/eggGoalTimes';
import type { NowPlan } from '@/lib/nowPlan';
import { eggLines } from '@/lib/farmFacts';
import { getThresholdForTE } from '@/lib/truthEggs';
import {
  AFTER_SHIFT_TAIL,
  EGG_LINE,
  EGG_VIEW_LINES,
  GOAL_EGG_DONE_WORDS,
  GOAL_WORDS,
  IF_SHIFT_NOW_TAIL,
  PLAN_SHIFT_LEAD,
  PLANNED_SHIFT_TAIL,
} from '@/lib/yourEggsWords';
import { renderHtml, textOf } from '@/test/renderComponent';
import YourEggs from './YourEggs.vue';

const D = 86400;
const ZONE = 'America/Los_Angeles';
const FIXED = Date.parse('2027-10-15T21:40:00Z');
let NOW = 0;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXED);
  NOW = Math.floor(Date.now() / 1000);
});
afterEach(() => vi.useRealTimers());

const at30 = getThresholdForTE(30);
const delivered = { curiosity: at30 * 1.01, kindness: at30, integrity: at30, humility: at30, resilience: at30 };
const rates = { maxHabs: 1e10, perChicken: 200, maxElr: 2e12, ihr: 1e4 };
const ORDER = ['curiosity', 'integrity', 'humility', 'resilience', 'kindness'];

function props(plan: boolean) {
  const eggs = eggLines(delivered, {}, 'curiosity', 1e12, 60);
  const shifts = plan ? [{ kind: 'shift', egg: 'kindness', at: NOW + 2 * D }] : [];
  return {
    eggs,
    facts: null,
    shiftsDone: 0,
    nextShiftCost: null,
    plannedShifts: null,
    clothedEquipped: null,
    clothedEarnings: null,
    now: NOW,
    saveSeconds: NOW,
    afterShift: { lines: afterShiftLines({ eggs, delivered, totalTe: 150, rates }), note: 'note' },
    goalLines: eggGoalLines({ eggs, goal: plan ? { endTE: 210, finish: NOW + 600 * D, zone: ZONE } : null, now: NOW }),
    clockLines: eggClockLines({ eggs, delivered, totalTe: 150, rates, now: NOW, saveSeconds: NOW, zone: ZONE, shifts, plan }),
  };
}

/** Each egg's block: its line kinds and its text, in card order. */
function blocks(html: string): { kinds: string[]; text: string }[] {
  return html
    .split('data-testid="now-egg"')
    .slice(1)
    .map(b => b.split('data-testid="now-eggs-after-shift-note"')[0])
    .map(b => ({ kinds: [...b.matchAll(/data-line="([^"]+)"/g)].map(m => m[1]), text: textOf(b) }));
}
/** The line kinds above the eggs. */
function blockKinds(html: string): string[] {
  return [...html.split('data-testid="now-egg"')[0].matchAll(/data-line="([^"]+)"/g)].map(m => m[1]);
}

describe('YourEggs, "next TE" view', () => {
  for (const plan of [true, false]) {
    it(`only next TE lines, no goal words, no planned shift (${plan ? 'followed plan' : 'no plan'})`, async () => {
      const html = await renderHtml(YourEggs, { ...props(plan), view: 'next' });
      expect(blockKinds(html)).toEqual([]);
      const b = blocks(html);
      expect(b).toHaveLength(5);
      expect(b[ORDER.indexOf('curiosity')].kinds).toEqual([EGG_LINE.nextAtSaveRate, EGG_LINE.nextClock]);
      for (const egg of ORDER.filter(e => e !== 'curiosity')) {
        expect(b[ORDER.indexOf(egg)].kinds).toEqual([EGG_LINE.nextAfterShift, EGG_LINE.nextClock]);
      }
      for (const x of b) {
        for (const k of x.kinds) expect(EGG_VIEW_LINES.next).toContain(k);
        for (const banned of [GOAL_WORDS, PLANNED_SHIFT_TAIL, PLAN_SHIFT_LEAD]) expect(x.text).not.toContain(banned);
      }
    });
  }
});

describe('YourEggs, "to goal" view', () => {
  it('the plan\'s goal once above the eggs, then each egg only its plan line; no "if you shift here"', async () => {
    const p = props(true);
    const html = await renderHtml(YourEggs, { ...p, view: 'goal' });
    expect(blockKinds(html)).toEqual([EGG_LINE.goalPlan]);
    expect(textOf(html).split(p.goalLines.kindness).length - 1).toBe(1);
    const b = blocks(html);
    expect(b[ORDER.indexOf('kindness')].kinds).toEqual([EGG_LINE.goalShift]);
    expect(b[ORDER.indexOf('kindness')].text).toContain(PLAN_SHIFT_LEAD);
    expect(b[ORDER.indexOf('curiosity')].kinds).toEqual([EGG_LINE.goalOnEgg]);
    for (const egg of ['integrity', 'humility', 'resilience']) expect(b[ORDER.indexOf(egg)].kinds).toEqual([EGG_LINE.goalNoShift]);
    for (const x of b) {
      for (const k of x.kinds) expect(EGG_VIEW_LINES.goal).toContain(k);
      for (const banned of [AFTER_SHIFT_TAIL, IF_SHIFT_NOW_TAIL, PLANNED_SHIFT_TAIL]) expect(x.text).not.toContain(banned);
    }
    // The after-a-shift note is about the "next TE" times: not under the goal view.
    expect(html).not.toContain('data-testid="now-eggs-after-shift-note"');
  });
  it('no plan: no switch, and a remembered "to goal" shows the next TE lines', async () => {
    const html = await renderHtml(YourEggs, { ...props(false), view: 'goal' });
    expect(html).not.toContain('data-testid="now-eggs-view"');
    for (const x of blocks(html)) for (const k of x.kinds) expect(EGG_VIEW_LINES.next).toContain(k);
  });
});

/** A followed table replay plan (spec-myruns-goal): its final ascension's shifts in a non-standard tail order. The
 *  farm is in it now, Kindness's stint (K3) already over. */
function replayPlan(): NowPlan {
  const start = NOW - 3 * D;
  const eggs = ['humility', 'kindness', 'resilience', 'curiosity', 'humility', 'integrity'];
  return {
    goal: 'fastest',
    deadline: null,
    chain: [210],
    end: start + 7 * D,
    endTE: 210,
    legs: null,
    tableLegs: [{ to: 210, endTE: 210, start, end: start + 7 * D, shifts: eggs.map((egg, i) => ({ at: start + (i + 1) * D, egg })) }],
    exact: false,
    instantTE: null,
    calculatedAt: 0,
    planStart: start,
    spareHours: null,
  } as NowPlan;
}

describe('YourEggs, "to goal" per egg on the followed plan (spec-myruns-goal)', () => {
  function goalProps(hours: boolean) {
    const p = props(true);
    return { ...p, goalTimes: planEggGoalLines({ plan: replayPlan(), now: NOW, zone: ZONE, hours, saveEgg: 'curiosity' }) };
  }
  it('each egg one goal-time line (the plan\'s goal once above), Kindness done; no hypotheticals, no plan-shift lines', async () => {
    const p = goalProps(false);
    const html = await renderHtml(YourEggs, { ...p, view: 'goal' });
    expect(blockKinds(html)).toEqual([EGG_LINE.goalPlan]);
    const b = blocks(html);
    expect(b[ORDER.indexOf('kindness')].kinds).toEqual([EGG_LINE.goalEggDone]);
    expect(b[ORDER.indexOf('kindness')].text).toContain(GOAL_EGG_DONE_WORDS);
    for (const egg of ['curiosity', 'integrity', 'humility', 'resilience']) {
      expect(b[ORDER.indexOf(egg)].kinds).toEqual([EGG_LINE.goalEggAt]);
      expect(b[ORDER.indexOf(egg)].text).toContain(p.goalTimes![egg].text);
    }
    for (const x of b) {
      for (const k of x.kinds) expect(EGG_VIEW_LINES.goal).toContain(k);
      for (const banned of [AFTER_SHIFT_TAIL, IF_SHIFT_NOW_TAIL, PLANNED_SHIFT_TAIL, PLAN_SHIFT_LEAD]) expect(x.text).not.toContain(banned);
    }
  });
  it('awake hours on: every egg still on the plan says its time approximately', async () => {
    const b = blocks(await renderHtml(YourEggs, { ...goalProps(true), view: 'goal' }));
    for (const egg of ['curiosity', 'integrity', 'humility', 'resilience']) expect(b[ORDER.indexOf(egg)].kinds).toEqual([EGG_LINE.goalEggByAbout]);
  });
  it('"next TE" with goal times given: still only next TE lines, no goal words', async () => {
    const html = await renderHtml(YourEggs, { ...goalProps(false), view: 'next' });
    for (const x of blocks(html)) {
      for (const k of x.kinds) expect(EGG_VIEW_LINES.next).toContain(k);
      for (const banned of [GOAL_WORDS, GOAL_EGG_DONE_WORDS, PLAN_SHIFT_LEAD]) expect(x.text).not.toContain(banned);
    }
  });
});
