/**
 * My runs' Next steps (lib/myRunsDashboard.ts, reworked 24 Oct 2026): only what changes what the player should do: a
 * followed route a priced result beats by about a day or more, time off or a no-prestige day on its prestiges, a save
 * over about 3 days old, results not sent. The old nags ("No Egg Day run yet", "priced by an older simulator", "priced
 * with other hours / time off", "your save moved on", "only Fast so far", hidden runs) and the six cards are gone.
 * Also the shared words and checks the saved-answer tiles still use (hoursDiffer, simulatorAge) and openFor.
 */
import { describe, expect, it } from 'vitest';
import {
  BEATS_SECONDS,
  SAVE_OLD_SECONDS,
  SIM_STAMPED_FROM_MS,
  beatsFollowed,
  buildSteps,
  goalKey,
  hoursDiffer,
  openFor,
  simulatorAge,
  type FollowedForSteps,
  type StepsInput,
} from './myRunsDashboard';
import { eggDaySeconds } from './eggDay';
import { SIM_VERSION } from '@/search/simVersion';
import { describeAvailability, type Availability } from '@/search/availabilitySchedule';
import type { BoardRow } from './leaderboardRank';

const DAY = 86_400;
const NOW = Date.UTC(2026, 9, 24, 19, 0) / 1000; // 24 Oct 2026, 12 PM Pacific
const ZONE = 'America/Los_Angeles';
const EGG = eggDaySeconds(2027);
const NOV1 = Date.UTC(2026, 10, 1, 16) / 1000;
const HOURS: Availability = { days: [], fromHour: 9, toHour: 1, timezone: ZONE };

function follow(over: Partial<FollowedForSteps> = {}): FollowedForSteps {
  return {
    goalKey: 'eggday-2027',
    name: 'Egg Day 2027',
    goal: 'date',
    target: 490,
    deadline: EGG,
    eggDay: true,
    chain: [225, 300],
    finish: { end: EGG - 5 * 3600, endTE: 300 },
    prestiges: [{ at: NOW + 2 * DAY, te: 225 }],
    result: null,
    ...over,
  };
}
function input(over: Partial<StepsInput> = {}): StepsInput {
  return { now: NOW, zone: ZONE, pending: 0, saveSeconds: NOW - 2 * 3600, follows: [], windows: [], ...over };
}
const ids = (i: StepsInput) => buildSteps(i).steps.map(s => s.id);

describe('Next steps: only what changes what to do', () => {
  it('nothing to change: a fresh save, a followed route nothing beats, no days on its prestiges, everything sent', () => {
    expect(buildSteps(input({ follows: [follow()] })).steps).toEqual([]);
    expect(buildSteps(input()).steps).toEqual([]);
  });

  it('a Fast run that reaches more TE by the date than the followed route: Show me, on Right now', () => {
    const f = follow({ result: { level: 'Fast', chain: [227, 278, 310], end: EGG - 23 * 3600, endTE: 310 } });
    const [s] = buildSteps(input({ follows: [f] })).steps;
    expect(s).toMatchObject({ id: 'beaten:eggday-2027', kinds: ['beaten'], button: 'Show me', action: { to: 'right-now', goalKey: 'eggday-2027' } });
    expect(s.text).toBe('Egg Day 2027: your Fast run beats the route you follow');
    expect(s.reason).toBe('It reaches 310 TE by the date (227 278 310); the route you follow, 300 TE.');
  });

  it('a race: only when the result lands about a day or more sooner; the same route never', () => {
    const base = { goalKey: 'fastest-490', name: 'Fastest to 490 TE', goal: 'fastest' as const, deadline: null, eggDay: false, chain: [230, 490], finish: { end: NOW + 300 * DAY, endTE: 490 } };
    const by = (h: number) => follow({ ...base, result: { level: 'Exact', chain: [229, 490], end: NOW + 300 * DAY - h * 3600, endTE: 490 } });
    expect(ids(input({ follows: [by(19)] }))).toEqual([]);
    const s = buildSteps(input({ follows: [by(30)] })).steps[0];
    expect(s.id).toBe('beaten:fastest-490');
    expect(s.text).toBe('Fastest to 490 TE: your Exact run beats the route you follow');
    expect(s.reason).toMatch(/^It gets there 30 h sooner \(229 490, .+\) than the route you follow\.$/);
    const same = follow({ ...base, result: { level: 'Fast', chain: [230, 490], end: NOW, endTE: 490 } });
    expect(ids(input({ follows: [same] }))).toEqual([]);
    // No priced finish for the followed route: can't tell, so nothing said.
    expect(ids(input({ follows: [{ ...by(48), finish: null }] }))).toEqual([]);
  });

  it('beatsFollowed: a date by TE first, then about a day sooner at the same TE', () => {
    expect(BEATS_SECONDS).toBeGreaterThanOrEqual(18 * 3600);
    expect(BEATS_SECONDS).toBeLessThanOrEqual(24 * 3600);
    expect(beatsFollowed('date', { end: 100, endTE: 301 }, { end: 0, endTE: 300 })).toBe(true);
    expect(beatsFollowed('date', { end: 0, endTE: 299 }, { end: 10 * DAY, endTE: 300 })).toBe(false);
    expect(beatsFollowed('date', { end: 0, endTE: 300 }, { end: DAY, endTE: 300 })).toBe(true);
    expect(beatsFollowed('date', { end: 0, endTE: 300 }, { end: 3 * 3600, endTE: 300 })).toBe(false);
    expect(beatsFollowed('fastest', { end: 0, endTE: 490 }, { end: DAY, endTE: 490 })).toBe(true);
  });

  it('time off or a no-prestige day on a prestige of the followed route: Run Fast on its screen; days off the route say nothing', () => {
    const off = { from: NOW + 1.5 * DAY, to: NOW + 2.5 * DAY, words: 'your time off Oct 26', kind: 'time off' as const };
    const [s] = buildSteps(input({ follows: [follow()], windows: [off] })).steps;
    expect(s).toMatchObject({ id: 'prestige:eggday-2027', kinds: ['prestige'], button: 'Run Fast', action: { to: 'by-date', deadline: EGG, eggDay: true, tab: 'nearby' } });
    expect(s.text).toBe('Egg Day 2027: a prestige of your route lands in your time off');
    expect(s.reason).toMatch(/^It prestiges at 225 TE .+ inside your time off Oct 26\. Run Fast for a route that works around it\.$/);
    expect(s.reason).toMatch(/\d:\d\d [AP]M/);
    const np = { ...off, words: 'your no-prestige days Oct 26', kind: 'no-prestige day' as const };
    expect(buildSteps(input({ follows: [follow()], windows: [np] })).steps[0].text).toBe('Egg Day 2027: a prestige of your route lands on a no prestige day');
    // A race: Fast, Nearby routes.
    const race = follow({ goalKey: 'fastest-490', name: 'Fastest to 490 TE', goal: 'fastest', deadline: null, eggDay: false });
    expect(buildSteps(input({ follows: [race], windows: [off] })).steps[0].action).toEqual({ to: 'fastest', target: 490, tab: 'nearby', level: 'quick' });
    // The days miss every prestige, or the prestige is already past: nothing.
    expect(ids(input({ follows: [follow()], windows: [{ ...off, from: NOW + 3 * DAY, to: NOW + 4 * DAY }] }))).toEqual([]);
    expect(ids(input({ follows: [follow({ prestiges: [{ at: NOW - 3600, te: 225 }] })], windows: [{ ...off, from: NOW - DAY }] }))).toEqual([]);
    // No priced times for the route: can't tell, nothing said.
    expect(ids(input({ follows: [follow({ prestiges: [] })], windows: [off] }))).toEqual([]);
  });

  it('a save more than about 3 days old: Load a fresh one', () => {
    expect(SAVE_OLD_SECONDS).toBe(3 * DAY);
    expect(ids(input({ saveSeconds: NOW - 3 * DAY + 60 }))).toEqual([]);
    const [s] = buildSteps(input({ saveSeconds: NOW - 4 * DAY - 60 })).steps;
    expect(s).toMatchObject({ id: 'save', text: 'Your save is 4 days old', button: 'Load a fresh one', action: { to: 'fresh' } });
    expect(ids(input({ saveSeconds: 0 }))).toEqual([]);
  });

  it('results not sent, last; the order: beaten, prestige, save, unsent', () => {
    const off = { from: NOW + 1.5 * DAY, to: NOW + 2.5 * DAY, words: 'your time off', kind: 'time off' as const };
    const f = follow({ result: { level: 'Fast', chain: [227, 278, 310], end: EGG - 23 * 3600, endTE: 310 } });
    const all = input({ follows: [f], windows: [off], saveSeconds: NOW - 5 * DAY, pending: 3 });
    expect(ids(all)).toEqual(['beaten:eggday-2027', 'prestige:eggday-2027', 'save', 'unsent']);
    const u = buildSteps(all).steps[3];
    expect(u).toMatchObject({ text: '3 results not sent', button: 'Show me', action: { to: 'unsent' } });
    expect(buildSteps(input({ pending: 1 })).steps[0].text).toBe('1 result not sent');
  });

  it('never the removed nags, never the words players don\u2019t read', () => {
    const off = { from: NOW + 1.5 * DAY, to: NOW + 2.5 * DAY, words: 'your time off', kind: 'time off' as const };
    const f = follow({ result: { level: 'Fast', chain: [227, 278, 310], end: EGG - 23 * 3600, endTE: 310 } });
    const text = JSON.stringify(buildSteps(input({ follows: [f], windows: [off], saveSeconds: NOW - 5 * DAY, pending: 3 })));
    expect(text).not.toMatch(/older simulator|other time off|priced with|No Egg Day|never Exact|hidden from the public/);
    expect(text).not.toMatch(/\btables?\b|\bchain\b|checkpoint|\bLight\b/);
  });
});

// --------------------------------------------------------------------------- shared words and checks

let n = 0;
function race(over: Partial<BoardRow> = {}): BoardRow {
  return {
    id: `r${++n}`,
    chain: [200, 300, 400, 490],
    durationDays: 100,
    startUtc: '2026-10-14T16:00:00Z',
    timezone: ZONE,
    finalTE: 490,
    currentTE: 180,
    backupTE: 180,
    window: describeAvailability(HOURS),
    effort: 'normal',
    simVersion: SIM_VERSION,
    receivedAt: new Date(NOW * 1000 - DAY * 1000).toISOString(),
    yours: true,
    ...over,
  };
}

describe('the checks the saved-answer tiles still use', () => {
  it('keys a race by its target and a date by its moment', () => {
    expect(goalKey(race())).toBe('race:490');
    expect(goalKey({ finalTE: 251, deadline: NOV1 } as BoardRow)).toBe(`date:${NOV1}`);
  });
  it('hours: a row from before `window` is not judged; time off that has ended is not compared', () => {
    const now = NOW * 1000;
    expect(hoursDiffer(race({ window: null }), { availability: HOURS, timeOff: [] }, now, ZONE).hours).toBe(true);
    expect(hoursDiffer(race({ window: undefined }), { availability: null, timeOff: [] }, now, ZONE).hours).toBe(false);
    const ended = race({ timeOff: [{ from: '2026-09-01', to: '2026-09-03' }] });
    expect(hoursDiffer(ended, { availability: HOURS, timeOff: [] }, now, ZONE)).toEqual({ hours: false, timeOff: false });
    expect(hoursDiffer(race(), { availability: HOURS, timeOff: [{ from: '2026-10-30', to: '2026-10-31' }] }, now, ZONE).timeOff).toBe(true);
  });
  it('an older simulator: another stamp; no stamp before 13 Oct is "likely"; no stamp after is not judged', () => {
    expect(simulatorAge(race())).toBeNull();
    expect(simulatorAge(race({ simVersion: '2026-10-01-old' }))).toBe('older');
    const early = new Date(SIM_STAMPED_FROM_MS - DAY * 1000).toISOString();
    expect(simulatorAge(race({ simVersion: undefined, receivedAt: early }))).toBe('likely');
    expect(simulatorAge(race({ simVersion: undefined }))).toBeNull();
  });
});

describe('actions', () => {
  it('openFor: Fastest with its depth and target; By a date with Egg Day or the date in the planner\u2019s zone', () => {
    expect(openFor({ to: 'fastest', target: 490, tab: 'nearby', level: 'normal' }, ZONE)).toEqual({
      auto: 'fastest',
      depth: 'smart',
      tab: 'nearby',
      target: 490,
      level: 'normal',
    });
    expect(openFor({ to: 'fastest', target: 400, tab: 'exhaustive' }, ZONE).depth).toBe('full');
    expect(openFor({ to: 'by-date', deadline: EGG, eggDay: true, tab: 'nearby' }, ZONE)).toEqual({
      auto: 'by-date',
      tab: 'nearby',
      byDate: { eggDay: true },
    });
    expect(openFor({ to: 'by-date', deadline: NOV1, eggDay: false, tab: 'exhaustive' }, ZONE).byDate).toEqual({
      deadline: NOV1,
      zone: ZONE,
    });
  });
});
