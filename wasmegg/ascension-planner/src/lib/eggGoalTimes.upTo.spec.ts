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

describe('ascEndLines: where each earlier ascension ends', () => {
  it('one line per ascension before the last: its stop TE and when it ends, in the lib/timelineWords.ts words', () => {
    const lines = ascEndLines({ plan: plan(), ...o });
    expect(Object.keys(lines)).toEqual(['1']);
    expect(lines[1]).toBe(ascGoalLine(1, 180, dateAt(Math.round((T0 - 2 * D) / 3600) * 3600, NOW, ZONE, true)));
  });
  it('a one-ascension plan has none', () => {
    const p = plan();
    const one = { ...p, chain: [210], tableLegs: [p.tableLegs![1]] } as unknown as NowPlan;
    expect(ascEndLines({ plan: one, ...o })).toEqual({});
  });
});
