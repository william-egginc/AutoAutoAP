/**
 * THE FULL TIMELINE'S A1 FROM THE SIMULATION (27 Oct 2026, Jordan): with no shifts left in the ascension you are in the
 * Full timeline said "No shifts left in it: worked out on your save." and nothing about what to do; and its times were
 * off from hour rounding: A2's prestige stayed the instant answer's (to the hour, from the table's A1 end), and the
 * events table rounded the simulated A1's shifts and prestige to the hour. Now A1's times are the simulation's to the
 * minute: A2's prestige comes from A1's simulated end (held for the hours), the events of A1 are exact, and A1 with no
 * shifts left says "No shifts left: stay on <egg> until you prestige at about <time>".
 */
import { describe, expect, it } from 'vitest';
import { ascensionSteps, prestigeAfterSimulated, stayWords, withStayLine } from './instantSteps';
import { planEvents, type NowPlan } from './nowPlan';
import { renderHtml, textOf } from '@/test/renderComponent';
import AscensionList from '@/components/myruns/AscensionList.vue';
import EventsTable from '@/components/myruns/EventsTable.vue';
import { nextPrestigeAt } from '@/search/noPrestige';
import type { Availability } from '@/search/availability';

const ZONE = 'America/Los_Angeles';
const H = 3600;
// Monday 4 Jan 2027, 9:00 am PST.
const T0 = Date.parse('2027-01-04T17:00:00Z') / 1000;
const HOURS: Availability = { days: [], fromHour: 9, toHour: 21, timezone: ZONE };
// A1 simulated on the save: started an hour before T0, its last shift at T0 + 2 h, reached at 3:17 pm (T0 + 6 h 17 m).
const A1_END = T0 + 6 * H + 17 * 60;
const a1 = {
  from: 200,
  to: 226,
  endTE: 226,
  start: T0 - H,
  end: A1_END,
  simulated: true,
  shifts: [
    { at: T0 - 0.5 * H, egg: 'humility' },
    { at: T0 + 2 * H, egg: 'kindness' },
  ],
};
// A2 from the instant answer: its start the table's, to the hour (from the table's own A1 end, 5:00 pm).
const a2 = {
  from: 226,
  to: 277,
  endTE: 277,
  start: T0 + 8 * H,
  end: T0 + 60 * H,
  shifts: [{ at: T0 + 30 * H, egg: 'humility' }],
};

describe("A2's prestige from the simulated A1's end, to the minute", () => {
  it("without hours: at A1 simulated end; with hours: the hours' next start after it", () => {
    expect(prestigeAfterSimulated([a1, a2], t => t)[1].start).toBe(A1_END);
    // 3:17 pm is inside 9-9: at once.
    expect(prestigeAfterSimulated([a1, a2], t => nextPrestigeAt(t, HOURS, []))[1].start).toBe(A1_END);
    const late = { ...a1, end: T0 + 13 * H + 17 * 60 }; // 10:17 pm: waits for 9 am
    expect(prestigeAfterSimulated([late, a2], t => nextPrestigeAt(t, HOURS, []))[1].start).toBe(T0 + 24 * H);
    // A1 not simulated: the table's start stays.
    expect(prestigeAfterSimulated([{ ...a1, simulated: false }, a2], t => t)[1].start).toBe(T0 + 8 * H);
  });
  it('ascensionSteps marks that prestige exact', () => {
    const steps = ascensionSteps(
      prestigeAfterSimulated([a1, a2], t => t),
      null,
      null
    );
    expect(steps[1]).toMatchObject({ prestigeAt: A1_END, prestigeExact: true });
    expect(steps[0].prestigeExact).toBeUndefined();
  });
});

describe('A1 with no shifts left', () => {
  const steps = () =>
    ascensionSteps(
      prestigeAfterSimulated([a1, a2], t => t),
      null,
      null
    );
  it('stays on the egg of its last shift until the prestige', () => {
    const s = withStayLine(steps(), T0 + 3 * H, 'curiosity');
    expect(s[0].stay).toEqual({ egg: 'kindness', at: A1_END, kind: 'prestige', te: 226 });
    expect(stayWords(s[0].stay!, t => `<${(t - T0) / 60}m>`)).toBe(
      'No shifts left: stay on Kindness until you prestige at about <377m>'
    );
  });
  it("a shift still ahead: none; no shift in it at all: the egg the save is on; the route's last ascension: reach its TE", () => {
    expect(withStayLine(steps(), T0 + H, 'humility')[0].stay).toBeUndefined();
    const bare = ascensionSteps([{ ...a1, shifts: [] }], null, null);
    expect(withStayLine(bare, T0, 'curiosity')[0].stay).toEqual({
      egg: 'curiosity',
      at: A1_END,
      kind: 'goal',
      te: 226,
    });
    expect(stayWords({ egg: 'curiosity', at: A1_END, kind: 'goal', te: 226 }, () => 'X')).toBe(
      'No shifts left: stay on Curiosity until you reach 226 TE at about X'
    );
    // From the table (not simulated): its shifts aren't known, nothing said.
    const table = ascensionSteps([{ ...a1, simulated: false, shifts: [] }, a2], null, null);
    expect(withStayLine(table, T0 + 3 * H, 'curiosity')[0].stay).toBeUndefined();
  });
  it("the Full timeline says it, A1 and A2's prestige to the minute", async () => {
    const lines = withStayLine(steps(), T0 + 3 * H, 'curiosity');
    const t = textOf(await renderHtml(AscensionList, { lines, zone: ZONE }));
    expect(t).toContain('No shifts left: stay on Kindness until you prestige at about Jan 4, 2027, 3:17');
    expect(t).not.toContain('No shifts left in it');
    expect(t).toMatch(/A2 · prestige Jan 4, 2027, 3:17/);
  });
});

describe('the events table: the simulated A1 to the minute while the rest is rounded', () => {
  const plan = {
    chain: [226, 277],
    goal: 'fastest',
    endTE: 277,
    legs: null,
    tableLegs: [
      { ...a1, simulated: true },
      { ...a2, start: A1_END },
    ],
  } as unknown as NowPlan;
  it("planEvents marks the simulated ascension's events exact", () => {
    const ev = planEvents(plan, T0);
    expect(ev.filter(e => e.asc === 1).every(e => e.exact)).toBe(true);
    expect(ev.filter(e => e.asc === 2).some(e => e.exact)).toBe(false);
  });
  it('rendered: A1 prestige at 3:17, not "around 3:00"', async () => {
    const events = planEvents(plan, T0);
    const t = textOf(
      await renderHtml(EventsTable, {
        events,
        goal: 'fastest',
        goalName: 'Fastest to 490',
        now: T0,
        zone: ZONE,
        saveWhen: 'x',
        calculatedWhen: 'y',
        rounded: true,
      })
    );
    expect(t).toMatch(/A1 ends · Prestige[^]*3:17/);
    expect(t).not.toMatch(/Jan 4 at around/);
    // A2 from the instant answer stays rounded.
    expect(t).toContain('Tue, Jan 5 at around 3:00 PM');
  });
});
