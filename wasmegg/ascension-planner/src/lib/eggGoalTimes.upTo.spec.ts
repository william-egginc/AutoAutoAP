/**
 * YOUR EGGS, "TO GOAL" FOR ONE ASCENSION (Jordan, 17 Nov 2026: "why don't we have a slider or something to pick which ascent they are
 * looking at in their goal plan (1, 2, 3)", the "to goal" view of Your eggs, option 1). `planEggGoalLines({ upTo })` reads the plan only as
 * far as ascension `upTo` (1-based): each egg's last stint among those ascensions, and (exact legs) its TE share at that ascension's end.
 * `ascEndLines` says where each earlier ascension ends. Default (no `upTo`): the whole plan, as before. No simulator, no clock.
 */
import { describe, expect, it } from 'vitest';
import { planEggGoalLines, ascEndLines } from './eggGoalTimes';
import { EGG_LINE } from './yourEggsWords';
import { ascGoalLine } from './timelineWords';
import { whenWords } from './nowWords';
import { renderHtml, textOf } from '@/test/renderComponent';
import EventsTable from '@/components/myruns/EventsTable.vue';
import type { PlanEvent } from './nowPlan';
import { dateAt } from './eventWhen';
import type { NowPlan } from './nowPlan';

const D = 86400;
const ZONE = 'America/Los_Angeles';
const T0 = Date.parse('2028-03-01T17:00:00Z') / 1000;
const NOW = T0 - 30 * D;
/** Two simulated ascensions with shifts: A1 lays kindness, curiosity; A2 lays kindness, humility, curiosity. */
function plan(a1Shifts = true): NowPlan {
  return {
    goal: 'fastest',
    deadline: null,
    chain: [180, 210],
    end: T0 + 9 * D,
    endTE: 210,
    legs: null,
    tableLegs: [
      {
        to: 180,
        endTE: 180,
        start: T0 - 10 * D,
        end: T0 - 2 * D,
        simulated: true,
        ...(a1Shifts ? { shifts: [{ at: T0 - 8 * D, egg: 'kindness' }, { at: T0 - 5 * D, egg: 'curiosity' }] } : {}),
      },
      {
        to: 210,
        endTE: 210,
        start: T0,
        end: T0 + 9 * D,
        simulated: true,
        shifts: [{ at: T0 + 2 * D, egg: 'kindness' }, { at: T0 + 4 * D, egg: 'humility' }, { at: T0 + 7 * D, egg: 'curiosity' }],
      },
    ],
    exact: false,
    instantTE: null,
    calculatedAt: 0,
    planStart: T0 - 10 * D,
    spareHours: null,
  } as unknown as NowPlan;
}
const o = { now: NOW, zone: ZONE, hours: false, saveEgg: 'curiosity' };
const when = (t: number) => dateAt(Math.round(t / 3600) * 3600, NOW, ZONE, true);

describe('planEggGoalLines with upTo', () => {
  it('no upTo (and upTo = every ascension): the whole plan, as before', () => {
    const whole = planEggGoalLines({ plan: plan(), ...o })!;
    expect(planEggGoalLines({ plan: plan(), ...o, upTo: 2 })).toEqual(whole);
    // The final ascension's last stints: humility ends when curiosity is shifted to, curiosity at the plan's end.
    expect(whole.humility.text).toContain(when(T0 + 7 * D));
    expect(whole.curiosity.text).toContain(when(T0 + 9 * D));
  });
  it('upTo 1: each egg\'s last stint in A1 only (not the final ascension\'s)', () => {
    const a1 = planEggGoalLines({ plan: plan(), ...o, upTo: 1 })!;
    expect(a1.kindness.text).toContain(when(T0 - 5 * D));
    expect(a1.curiosity.text).toContain(when(T0 - 2 * D));
    expect(a1.kindness.text).not.toContain(when(T0 + 4 * D));
    // An egg A1 never lays is "done" at that point of the plan, never given a later ascension's time.
    expect(a1.humility.kind).toBe(EGG_LINE.goalEggDone);
  });
  it('an ascension whose shifts are not known gives nothing per egg (null), so the picker has nothing to show for it', () => {
    expect(planEggGoalLines({ plan: plan(false), ...o, upTo: 1 })).toBeNull();
    expect(planEggGoalLines({ plan: plan(false), ...o })).not.toBeNull();
  });
  it('upTo out of range is the whole plan (never a crash)', () => {
    const whole = planEggGoalLines({ plan: plan(), ...o })!;
    expect(planEggGoalLines({ plan: plan(), ...o, upTo: 9 })).toEqual(whole);
    expect(planEggGoalLines({ plan: plan(), ...o, upTo: 0 })).toEqual(whole);
  });
});

describe('ascEndLines: where each earlier ascension ends, the way its row in You are here says it', () => {
  const ev = (o: Partial<PlanEvent>): PlanEvent => ({ kind: 'prestige', at: T0 - 2 * D, asc: 1, te: 180, past: false, next: false, ...o }) as PlanEvent;
  const args = { goal: 'fastest' as const, now: NOW, zone: ZONE, rounded: true };
  it('one line per ascension before the last, from its prestige row: the stop TE and the row\'s own time words, in lib/timelineWords.ts', () => {
    const lines = ascEndLines({ ...args, events: [ev({}), ev({ asc: 2, te: 210, at: T0 + 9 * D }), { kind: 'goal', at: T0 + 20 * D, asc: 3, te: 490 } as PlanEvent] });
    expect(Object.keys(lines)).toEqual(['1', '2']);
    expect(lines[1]).toBe(ascGoalLine(1, 180, whenWords({ at: T0 - 2 * D, kind: 'prestige' }, 'fastest', NOW, ZONE, true)));
  });
  it('QA 18 Nov 2026: the prestige time, not the time the stop was reached (A1 10:17 PM row, 10:00 PM line): a later prestigeAt wins, as in the row', () => {
    const reached = T0 - 2 * D;
    const starts = reached + 43 * 60; // the next ascension starts on the hour after the stop
    const lines = ascEndLines({ ...args, events: [ev({ at: reached, prestigeAt: starts })] });
    expect(lines[1]).toContain(whenWords({ at: starts, kind: 'prestige' }, 'fastest', NOW, ZONE, true));
    // And a prestige that waits for the hours is said at the held time.
    const held = ascEndLines({ ...args, events: [ev({ at: reached, wait: 'hours', prestigeAt: reached + 6 * 3600 })] });
    expect(held[1]).toContain(whenWords({ at: reached + 6 * 3600, kind: 'prestige' }, 'fastest', NOW, ZONE, true));
  });
  it('the same words as the row in the You are here table', async () => {
    const e = ev({ at: T0 - 2 * D, prestigeAt: T0 - 2 * D + 43 * 60, next: true });
    const html = await renderHtml(EventsTable, { events: [e], goal: 'fastest', goalName: 'Fastest to 490 TE', now: NOW, zone: ZONE, saveWhen: 'x', calculatedWhen: 'y', rounded: true });
    const line = ascEndLines({ ...args, events: [e] })[1];
    const when = /TE, (.*)\.$/.exec(line)![1];
    expect(textOf(html)).toContain(when);
  });
  it('a one-ascension plan, or no prestige rows, has none', () => {
    expect(ascEndLines({ ...args, events: [{ kind: 'goal', at: T0, asc: 1, te: 490 } as PlanEvent] })).toEqual({});
    expect(ascEndLines({ ...args, events: [] })).toEqual({});
  });
});

describe('an earlier ascension is not "the goal" (UX sweep R9, M1)', () => {
  const lines = (upTo?: number) => planEggGoalLines({ plan: plan(), now: NOW, zone: ZONE, hours: false, saveEgg: null, upTo })!;
  it('the whole plan keeps the goal words', () => {
    const t = Object.values(lines()).map(l => l.text).join(' ');
    expect(t).toMatch(/reaches|done/);
    expect(t).not.toMatch(/for A\d/);
  });
  it('A1 of two names the ascension, never "its goal"', () => {
    const rows = Object.values(lines(1)).filter(l => l.kind !== EGG_LINE.goalEggDone);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.text).toContain('for A1');
      expect(r.text).not.toMatch(/its goal/);
    }
  });
});
