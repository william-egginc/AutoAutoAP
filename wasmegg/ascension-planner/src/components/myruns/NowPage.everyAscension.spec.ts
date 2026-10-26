/**
 * EVERY ASCENSION ON RIGHT NOW (26 Oct 2026, Jordan: the Full timeline said "the instant answer only keeps when each
 * ascension ends", the table had two rows and All planned shifts said "Can't tell"). A plan with the table's times
 * now lists every ascension's prestige in the table (one that waits says so), every ascension with its shifts in the
 * Full timeline ("from the instant answer, to the hour"), and All planned shifts counts the shifts listed.
 */
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import AscensionList from './AscensionList.vue';
import EventsTable from './EventsTable.vue';
import RightNowCard from './RightNowCard.vue';
import YourEggs from './YourEggs.vue';
import {
  markPrestigeWaits,
  planEvents,
  shiftsAfter,
  stepLegsOf,
  tableEvents,
  withTableShifts,
  type NowPlan,
} from '@/lib/nowPlan';
import { ascensionSteps, instantSteps } from '@/lib/instantSteps';
import { planFromEstimate } from '@/lib/followEstimate';
import { withCurrentSim } from '@/lib/followSim';
import type { Availability } from '@/search/availability';
import type { Route } from '@/search/routeFinder';

const ZONE = 'America/Los_Angeles';
const H = 3600;
const D = 86400;
// Monday 4 Jan 2027, 9:00 am PST.
const T0 = Date.parse('2027-01-04T17:00:00Z') / 1000;
const HOURS: Availability = { days: [], fromHour: 9, toHour: 21, timezone: ZONE };

/** A four-ascension route as the estimate prices it: A1 the player's own (no shifts), A2..A4 from the table with
 *  their shifts; A2's prestige reached at 11 pm waits for the morning. */
function route(withShifts = true): Route {
  const sh = (start: number) =>
    withShifts
      ? [
          { at: start + 30 * H, egg: 'humility' },
          { at: start + 31 * H, egg: 'kindness' },
          { at: start + 2 * D, egg: 'curiosity' },
          { at: start + 2.5 * D, egg: 'integrity' },
        ]
      : undefined;
  const a2 = T0 + 1 * D; // 9 am
  const a3 = T0 + 5 * D; // 9 am, after A2's 11 pm end waited
  const a4 = T0 + 9 * D;
  return {
    chain: [226, 277, 317, 490],
    end: a4 + 3 * D,
    seconds: a4 + 3 * D - T0,
    legs: [
      { from: 200, to: 226, endTE: 226, start: T0, end: a2, sales: 0, tier13: false, label: 'continue' },
      { from: 226, to: 277, endTE: 277, start: a2, end: T0 + 4 * D + 14 * H, sales: 1, tier13: false, label: '1-sale', ...(withShifts ? { shifts: sh(a2) } : {}) },
      { from: 277, to: 317, endTE: 317, start: a3, end: a3 + 3 * D, sales: 1, tier13: false, label: '1-sale', ...(withShifts ? { shifts: sh(a3) } : {}) },
      { from: 317, to: 490, endTE: 490, start: a4, end: a4 + 3 * D, sales: 1, tier13: false, label: '1-sale', ...(withShifts ? { shifts: sh(a4) } : {}) },
    ],
  };
}
const SOURCE = { meta: null, pricing: { v: 1 as const, final: 490, options: { startTE: 200, start: T0, firstLegs: [] } } };
const plan = (withShifts = true): NowPlan => planFromEstimate(route(withShifts), { goal: 'fastest', deadline: null }, SOURCE, T0 * 1000);

describe('the estimate carries each ascension\'s shifts (lib/followEstimate.ts planFromEstimate)', () => {
  it('on the table legs, and an estimate without them still works', () => {
    expect(plan().tableLegs!.map(l => l.shifts?.length ?? 0)).toEqual([0, 4, 4, 4]);
    expect(plan(false).tableLegs!.every(l => !l.shifts)).toBe(true);
    expect(planEvents(plan(false), T0).filter(e => e.kind === 'shift')).toHaveLength(0);
  });
});

describe('the plan\'s events and counts (lib/nowPlan.ts)', () => {
  it('planEvents lists the table\'s shifts; All planned shifts counts those after the save, and can\'t tell without any', () => {
    const ev = planEvents(plan(), T0 + H);
    expect(ev.filter(e => e.kind === 'shift')).toHaveLength(12);
    expect(ev.filter(e => e.kind === 'shift').map(e => e.asc)).toEqual([2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4]);
    expect(shiftsAfter(plan(), T0)).toBe(12);
    expect(shiftsAfter(plan(), T0 + 5 * D)).toBe(8);
    expect(shiftsAfter(plan(false), T0)).toBeNull();
  });

  it('tableEvents: what is next up to the next prestige, then every later ascension\'s prestige, then the goal', () => {
    const shown = tableEvents(planEvents(plan(false), T0 + H));
    expect(shown.map(e => [e.kind, e.asc])).toEqual([
      ['prestige', 1],
      ['prestige', 2],
      ['prestige', 3],
      ['goal', 4],
    ]);
    // With shifts: the next ones up to A1's end, then every prestige (their shifts are in the Full timeline).
    const withShifts = tableEvents(planEvents(plan(), T0 + 1.5 * D));
    expect(withShifts.map(e => e.kind)).toEqual(['prestige', 'shift', 'shift', 'shift', 'shift', 'prestige', 'prestige', 'goal']);
  });

  it('a prestige that waits for the hours is marked with when it happens (instantSteps)', () => {
    const p = plan();
    const lines = instantSteps(stepLegsOf(p), HOURS, null);
    const ev = markPrestigeWaits(planEvents(p, T0), lines);
    const a2end = ev.find(e => e.kind === 'prestige' && e.asc === 2)!;
    expect(a2end).toMatchObject({ wait: 'hours', prestigeAt: T0 + 5 * D });
    expect(ev.find(e => e.kind === 'prestige' && e.asc === 1)!.wait).toBeUndefined();
  });

  it('withTableShifts puts a re-priced route\'s shifts on the same legs only', () => {
    const bare = plan(false);
    const r = route(true);
    const got = withTableShifts(bare, r);
    expect(got.tableLegs!.map(l => l.shifts?.length ?? 0)).toEqual([0, 4, 4, 4]);
    // Another leg (moved by a day): left as it was.
    const moved = { ...r, legs: r.legs.map((l, i) => (i === 2 ? { ...l, end: l.end + D } : l)) };
    expect(withTableShifts(bare, moved).tableLegs!.map(l => l.shifts?.length ?? 0)).toEqual([0, 4, 0, 4]);
    expect(withTableShifts(bare, null)).toBe(bare);
  });
});

describe('every ascension and its shifts (AscensionList.vue, lib/instantSteps.ts ascensionSteps)', () => {
  it('A1..An with prestige and stop times, the wait marked, each ascension\'s shifts from the instant answer', async () => {
    const p = plan();
    const lines = ascensionSteps(
      stepLegsOf(p).map((l, i) => ({ ...l, shifts: p.tableLegs![i].shifts })),
      HOURS,
      null
    );
    expect(lines.map(l => [l.asc, l.now, l.wait, l.shifts.length])).toEqual([
      [1, true, null, 0],
      [2, false, null, 4],
      [3, false, 'hours', 4],
      [4, false, null, 4],
    ]);
    const html = await renderHtml(AscensionList, { lines, zone: ZONE });
    const t = textOf(html);
    expect(t).toContain('A1 · now, in the ascension you are in → 226 TE reached about');
    expect(t).toMatch(/A3 · prestige about Jan 9, 2027,? 9(:00)? AM waits for your hours \(ready about/);
    expect(t).toContain('Shift to Humility · about');
    expect(t).toContain('from the instant answer, to the hour');
    expect(t).toContain("The instant answer doesn't keep the shifts of the ascension you are in.");
    expect(html.match(/data-testid="now-ascension"/g)).toHaveLength(4);
    expect(html.match(/data-testid="now-ascension-shift"/g)).toHaveLength(12);
  });

  it('Right now\'s Full timeline shows the list for a plan with no exact legs, and the table every prestige with its wait', async () => {
    const p = plan();
    const events = markPrestigeWaits(planEvents(p, T0 + H), instantSteps(stepLegsOf(p), HOURS, null));
    const lines = ascensionSteps(stepLegsOf(p).map((l, i) => ({ ...l, shifts: p.tableLegs![i].shifts })), HOURS, null);
    const html = await renderHtml(RightNowCard, {
      card: { plan: p, goal: { goal: 'fastest', target: 490, deadline: null }, state: 'this-save' },
      onVirtue: true,
      currentEgg: 'curiosity',
      teSoFar: 200,
      ascNow: 1,
      track: null,
      events,
      shownEvents: tableEvents(events),
      gear: null,
      now: T0 + H,
      zone: ZONE,
      saveSeconds: T0,
      eggDayYear: 2027,
      ascensions: lines,
    });
    expect(html).toContain('data-testid="now-ascensions"');
    expect(html).not.toContain("The instant answer keeps when each ascension ends");
    const t = textOf(html);
    expect(t).toContain('A1 ends · Prestige at 226 TE');
    expect(t).toContain('A3 ends · Prestige at 317 TE');
    expect(t).toContain('A2 ends · Prestige at 277 TE');
    expect(t).toMatch(/Waits for your hours: prestige [^·]*at around 9:00 (am|AM)/i);
  });

  it('EventsTable: a passed prestige or one that does not wait has no wait line', async () => {
    const p = plan();
    const events = markPrestigeWaits(planEvents(p, T0 + H), instantSteps(stepLegsOf(p), null, null));
    const html = await renderHtml(EventsTable, {
      events: tableEvents(events),
      goal: 'fastest',
      goalName: 'Fastest to 490 TE',
      now: T0 + H,
      zone: ZONE,
      saveWhen: 'x',
      calculatedWhen: 'y',
      rounded: true,
    });
    expect(html).not.toContain('now-event-wait');
  });
});

describe('the ascension you are in, simulated (lib/followSim.ts)', () => {
  it('its shifts are exact and say so; while it is worked out A1 says so', async () => {
    const p = withCurrentSim(plan(), {
      key: 'continue',
      startTime: T0,
      endTime: T0 + 20 * H,
      endTE: 226,
      buildPhaseEndTime: T0,
      shifts: [{ at: T0 + 2 * H + 17 * 60, egg: 'kindness' }],
    });
    const lines = ascensionSteps(
      stepLegsOf(p).map((l, i) => ({ ...l, shifts: p.tableLegs![i].shifts, simulated: p.tableLegs![i].simulated })),
      null,
      null
    );
    expect(lines[0]).toMatchObject({ simulated: true, shifts: [{ egg: 'kindness' }] });
    const t = textOf(await renderHtml(AscensionList, { lines, zone: ZONE }));
    expect(t).toMatch(/Shift to Kindness · Jan 4, 2027,? 11:17 AM/);
    expect(t).toContain('worked out on your save, to the minute');
    const bare = ascensionSteps(stepLegsOf(plan()), null, null);
    expect(textOf(await renderHtml(AscensionList, { lines: bare, zone: ZONE, working: true }))).toContain('Working out your shifts…');
    // All planned shifts counts the simulated ones too.
    expect(shiftsAfter(p, T0)).toBe(13);
  });
});

describe('All planned shifts (YourEggs.vue)', () => {
  const base = {
    eggs: [],
    facts: null,
    shiftsDone: 100,
    nextShiftCost: null,
    clothedEquipped: null,
    clothedEarnings: null,
    now: T0,
    saveSeconds: T0,
  };
  it('counted from the instant answer\'s shifts: says the new ascensions\' first hours are left out', async () => {
    const t = textOf(await renderHtml(YourEggs, { ...base, plannedShifts: { count: 12, cost: 1e18, partial: true } }));
    expect(t).toContain('12 shifts');
    expect(t).toContain("at today's soul eggs · the shifts listed, without each new ascension's first hours");
  });
  it("with none listed: Can't tell", async () => {
    const t = textOf(await renderHtml(YourEggs, { ...base, plannedShifts: null }));
    expect(t).toContain("Can't tell");
  });
});
