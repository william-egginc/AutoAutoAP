/**
 * YOUR EGGS, THE TWO VIEWS (spec-myruns-fix2, 13 Nov 2026; Jordan's own save on live 648165408 mixed them): the words
 * functions (lib/nextTeEgg.ts) give each view only its own lines.
 *   "next TE": if you switched to this egg now, how long until its next TE. No goal words, no planned shift.
 *   "to goal": what the followed plan says (its goal once, when it shifts to each egg). No "if you shift here".
 * Pinned by the line kinds and phrases in lib/yourEggsWords.ts, never by literal player words.
 * Fixtures: the egg being laid (Curiosity) with a Fastest goal's TE left, four other eggs, a followed plan with a
 * planned shift to Kindness; and no plan.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { afterShiftLines, eggClockLines, eggGoalLines, eggViewLines } from './nextTeEgg';
import { eggLines } from './farmFacts';
import { getThresholdForTE } from './truthEggs';
import {
  AFTER_SHIFT_TAIL,
  EGG_LINE,
  EGG_VIEW_LINES,
  GOAL_WORDS,
  IF_SHIFT_NOW_TAIL,
  PLAN_SHIFT_LEAD,
  PLANNED_SHIFT_TAIL,
} from './yourEggsWords';

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
const OTHERS = ['kindness', 'integrity', 'humility', 'resilience'];

function state(o: { plan: boolean }) {
  // The save's own goal TE left (a Fastest goal): farmFacts gives the laid egg a goal time, which "next TE" must drop.
  const eggs = eggLines(delivered, {}, 'curiosity', 1e12, 60);
  const shifts = o.plan ? [{ kind: 'shift', egg: 'kindness', at: NOW + 2 * D }] : [];
  const afterShift = afterShiftLines({ eggs, delivered, totalTe: 150, rates });
  const clockLines = eggClockLines({ eggs, delivered, totalTe: 150, rates, now: NOW, saveSeconds: NOW, zone: ZONE, shifts, plan: o.plan });
  const goalLines = eggGoalLines({
    eggs,
    goal: o.plan ? { endTE: 210, finish: NOW + 600 * D, zone: ZONE } : null,
    now: NOW,
  });
  return { eggs, afterShift, clockLines, goalLines };
}

function viewLines(view: 'next' | 'goal', plan: boolean) {
  const s = state({ plan });
  return Object.fromEntries(
    s.eggs.map(e => [e.egg, eggViewLines(view, e, { now: NOW, saveSeconds: NOW, afterShift: s.afterShift, clockLines: s.clockLines })])
  );
}

describe('"next TE": if you switched to this egg now, only that', () => {
  for (const plan of [true, false]) {
    it(`no goal words and no planned shift on any egg (${plan ? 'a followed plan' : 'no plan'})`, () => {
      for (const lines of Object.values(viewLines('next', plan))) {
        for (const l of lines) {
          expect(EGG_VIEW_LINES.next).toContain(l.kind);
          expect(l.text).not.toContain(GOAL_WORDS);
          expect(l.text).not.toContain(PLANNED_SHIFT_TAIL);
          expect(l.text).not.toContain(PLAN_SHIFT_LEAD);
        }
      }
    });
    it(`each egg's lines exactly (${plan ? 'a followed plan' : 'no plan'})`, () => {
      const v = viewLines('next', plan);
      expect(v.curiosity.map(l => l.kind)).toEqual([EGG_LINE.nextAtSaveRate, EGG_LINE.nextClock]);
      for (const egg of OTHERS) {
        expect(v[egg].map(l => l.kind)).toEqual([EGG_LINE.nextAfterShift, EGG_LINE.nextClock]);
        // The clock line is from a shift now, never from the plan's shift.
        expect(v[egg][1].text).toContain(IF_SHIFT_NOW_TAIL);
      }
    });
  }
});

describe('"to goal": what the followed plan says, no hypotheticals', () => {
  it('no "after you shift here" / "if you shift now" / timed-from-a-planned-shift line on any egg', () => {
    const s = state({ plan: true });
    for (const line of Object.values(s.goalLines)) {
      expect(line).not.toContain(AFTER_SHIFT_TAIL);
      expect(line).not.toContain(IF_SHIFT_NOW_TAIL);
    }
    for (const lines of Object.values(viewLines('goal', true))) {
      for (const l of lines) {
        expect(EGG_VIEW_LINES.goal).toContain(l.kind);
        for (const banned of [AFTER_SHIFT_TAIL, IF_SHIFT_NOW_TAIL, PLANNED_SHIFT_TAIL]) expect(l.text).not.toContain(banned);
      }
    }
  });
  it("the plan's goal is one line, the same for every egg (said once above them)", () => {
    const s = state({ plan: true });
    const all = Object.values(s.goalLines);
    expect(all).toHaveLength(5);
    expect(new Set(all).size).toBe(1);
    expect(all[0]).toContain(GOAL_WORDS);
  });
  it('each egg: when the plan shifts there, or that you are on it, or no shift in the next shifts', () => {
    const v = viewLines('goal', true);
    expect(v.kindness.map(l => l.kind)).toEqual([EGG_LINE.goalShift]);
    expect(v.kindness[0].text).toContain(PLAN_SHIFT_LEAD);
    expect(v.curiosity.map(l => l.kind)).toEqual([EGG_LINE.goalOnEgg]);
    for (const egg of ['integrity', 'humility', 'resilience']) expect(v[egg].map(l => l.kind)).toEqual([EGG_LINE.goalNoShift]);
  });
  it('no plan: no goal line (the card then has no "to goal" view)', () => {
    expect(state({ plan: false }).goalLines).toEqual({});
  });
});
