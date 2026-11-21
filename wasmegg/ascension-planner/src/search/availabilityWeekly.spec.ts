/**
 * Weekly hours (R10, 21 Nov 2026): `Availability.blocked`, the week's BLOCKED hours as Joo's picker paints them
 * (indices 0-167, Monday 00:00 first), read in the plan's zone, DST included. A daily window is a preset of it
 * (`maskOfWindow`), and a mask made from the window it carries behaves, keys and reads exactly as that window did.
 */
import { describe, expect, it } from 'vitest';
import {
  availabilityKey,
  countUnavailable,
  describeAvailability,
  holdUntilOf,
  isAvailable,
  isConstrained,
  nextAvailable,
  type Availability,
} from './availability';
import { maskOfWindow, WEEK_HOURS, weekIndex } from './availabilitySchedule';

const LA = 'America/Los_Angeles';
const at = (iso: string) => Date.parse(iso) / 1000;
const range = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => a + i);
/** Blocked indices for these Sunday-first days at these hours. */
const blockedAt = (days: number[], hours: number[]) => days.flatMap(d => hours.map(h => weekIndex(d, h)));
const WEEKDAYS = [1, 2, 3, 4, 5];
const ALL = [0, 1, 2, 3, 4, 5, 6];
/** Joo's two presets together: sleep 11 PM-7 AM every day, work 9-5 on weekdays. */
const SLEEP_WORK = [...blockedAt(ALL, [23, ...range(0, 7)]), ...blockedAt(WEEKDAYS, range(9, 17))];
const mask = (blocked: number[], timezone = LA): Availability => ({ days: [], fromHour: 7, toHour: 23, timezone, blocked });

describe('weekIndex and maskOfWindow', () => {
  it('Monday 00:00 is index 0 and Sunday 23:00 is 167', () => {
    expect(weekIndex(1, 0)).toBe(0);
    expect(weekIndex(0, 23)).toBe(WEEK_HOURS - 1);
    expect(weekIndex(6, 10)).toBe(5 * 24 + 10);
  });
  it('7 AM to 11 PM every day blocks the eight night hours of each day', () => {
    expect(maskOfWindow([], 7, 23)).toEqual(blockedAt(ALL, [0, 1, 2, 3, 4, 5, 6, 23]).sort((a, b) => a - b));
    expect(maskOfWindow([0, 1, 2, 3, 4, 5, 6], 7, 23)).toEqual(maskOfWindow([], 7, 23));
  });
  it('a window past midnight belongs to the day it started: Friday 6 PM-2 AM frees Friday evening and early Saturday', () => {
    const blocked = new Set(maskOfWindow([5], 18, 2));
    expect(blocked.has(weekIndex(5, 20))).toBe(false);
    expect(blocked.has(weekIndex(6, 1))).toBe(false);
    expect(blocked.has(weekIndex(5, 1))).toBe(true); // Thursday night is not chosen
    expect(blocked.has(weekIndex(6, 20))).toBe(true);
    expect(WEEK_HOURS - blocked.size).toBe(8);
  });
  it('all hours on chosen days frees those whole days; everything every day blocks nothing', () => {
    expect(WEEK_HOURS - maskOfWindow([6, 0], 9, 9).length).toBe(48);
    expect(maskOfWindow([], 9, 9)).toEqual([]);
  });
});

describe('a mask made from its own window is that window, exactly', { timeout: 120_000 }, () => {
  const windows: [number[], number, number][] = [
    [[], 7, 23],
    [[1, 2, 3, 4, 5], 18, 23],
    [[5], 18, 2],
    [[0, 6], 0, 0],
    [[2, 4], 22, 6],
    [[3], 9, 17],
  ];
  const zones = [LA, 'Europe/London', 'Australia/Sydney', 'Asia/Kolkata'];
  // Every 3 h 7 min through 2027, plus every 13 minutes across each zone's clock changes (the four dates below give a
  // day either side of every change in these zones).
  const changes = ['2027-03-14', '2027-03-28', '2027-04-04', '2027-10-03', '2027-10-31', '2027-11-07'];
  const instants = [
    ...Array.from({ length: 2810 }, (_, i) => at('2027-01-01T00:00:00Z') + i * 187 * 60),
    ...changes.flatMap(d => Array.from({ length: 330 }, (_, i) => at(`${d}T00:00:00Z`) - 86400 + i * 13 * 60)),
  ];
  for (const [days, f, t] of windows)
    for (const tz of zones) {
      const w: Availability = { days, fromHour: f, toHour: t, timezone: tz };
      const m: Availability = { ...w, blocked: maskOfWindow(days, f, t) };
      it(`${describeAvailability(w)}: same answers, key and words`, () => {
        expect(availabilityKey(m)).toBe(availabilityKey(w));
        expect(describeAvailability(m)).toBe(describeAvailability(w));
        expect(isConstrained(m)).toBe(isConstrained(w));
        for (const s of instants) {
          if (isAvailable(s, m) !== isAvailable(s, w)) throw new Error(`isAvailable differs at ${new Date(s * 1000).toISOString()}`);
          if (nextAvailable(s, m) !== nextAvailable(s, w)) throw new Error(`nextAvailable differs at ${new Date(s * 1000).toISOString()}`);
        }
      });
    }
});

describe('sleep plus weekday work hours (America/Los_Angeles)', () => {
  const a = mask(SLEEP_WORK);
  it('reads the mask, hour by hour', () => {
    expect(isAvailable(at('2026-11-24T18:30:00Z'), a)).toBe(false); // Tue 10:30 AM PST: at work
    expect(isAvailable(at('2026-11-25T02:00:00Z'), a)).toBe(true); // Tue 6 PM
    expect(isAvailable(at('2026-11-28T18:30:00Z'), a)).toBe(true); // Sat 10:30 AM
    expect(isAvailable(at('2026-11-25T08:00:00Z'), a)).toBe(false); // Wed midnight: asleep
    expect(isAvailable(at('2026-11-24T15:00:00Z'), a)).toBe(true); // Tue 7 AM: up before work
  });
  it('the next free instant: after work, after the night, past a whole working day', () => {
    expect(nextAvailable(at('2026-11-24T18:30:00Z'), a)).toBe(at('2026-11-25T01:00:00Z')); // Tue 10:30 AM -> 5 PM
    expect(nextAvailable(at('2026-11-28T07:30:00Z'), a)).toBe(at('2026-11-28T15:00:00Z')); // Fri 11:30 PM -> Sat 7 AM
    expect(nextAvailable(at('2026-11-24T16:30:00Z'), a)).toBe(at('2026-11-24T16:30:00Z')); // Tue 8:30 AM: free now
  });
  it('holdUntilOf gives nextAvailable to the second, and countUnavailable reads the mask', () => {
    const hold = holdUntilOf(a);
    for (let s = at('2026-11-23T00:00:00Z'); s < at('2026-12-07T00:00:00Z'); s += 1337) expect(hold(s)).toBe(nextAvailable(s, a));
    expect(countUnavailable([at('2026-11-24T18:30:00Z'), at('2026-11-25T02:00:00Z'), at('2026-11-25T08:00:00Z')], a)).toBe(2);
  });
});

describe('the days the clocks change', () => {
  it('America/Los_Angeles spring forward (14 Mar 2027): the 2 AM hour does not exist, so it blocks nothing', () => {
    const a = mask(blockedAt([0], [0, 1, 2]));
    // Sun 00:30 PST -> 3:00 AM PDT (10:00Z), the first hour after the skipped one.
    expect(nextAvailable(at('2027-03-14T08:30:00Z'), a)).toBe(at('2027-03-14T10:00:00Z'));
    expect(isAvailable(at('2027-03-14T10:00:00Z'), a)).toBe(true);
    // Sleep 11 PM-7 AM: Saturday 11:30 PM PST -> Sunday 7:00 AM PDT (14:00Z).
    expect(nextAvailable(at('2027-03-14T07:30:00Z'), mask(blockedAt(ALL, [23, ...range(0, 7)])))).toBe(at('2027-03-14T14:00:00Z'));
  });
  it('America/Los_Angeles fall back (7 Nov 2027): the 1 AM hour happens twice and both are blocked', () => {
    const a = mask(blockedAt([0], [1]));
    expect(isAvailable(at('2027-11-07T08:15:00Z'), a)).toBe(false); // 1:15 AM PDT
    expect(isAvailable(at('2027-11-07T09:15:00Z'), a)).toBe(false); // 1:15 AM PST, the second time
    expect(nextAvailable(at('2027-11-07T08:15:00Z'), a)).toBe(at('2027-11-07T10:00:00Z')); // 2:00 AM PST
  });
  it('Europe/London spring forward (28 Mar 2027): 1 AM is skipped', () => {
    const a = mask(blockedAt([0], [0, 1]), 'Europe/London');
    expect(nextAvailable(at('2027-03-28T00:30:00Z'), a)).toBe(at('2027-03-28T01:00:00Z')); // 2:00 AM BST
  });
  it('Australia/Sydney (spring forward on 3 Oct 2027, the other half of the year) and Asia/Kolkata (+5:30)', () => {
    // Sydney: 2 AM AEST -> 3 AM AEDT on Sunday 3 Oct 2027 (15:00Z on 2 Oct). Blocked Sunday 0-2: from 1:30 AM AEST -> 3 AM AEDT.
    const syd = mask(blockedAt([0], [0, 1, 2]), 'Australia/Sydney');
    expect(nextAvailable(at('2027-10-02T15:30:00Z'), syd)).toBe(at('2027-10-02T16:00:00Z'));
    // Kolkata: work 9-5 Monday; from 10:00 IST (04:30Z) -> 17:00 IST (11:30Z).
    const kol = mask(blockedAt([1], range(9, 17)), 'Asia/Kolkata');
    expect(nextAvailable(at('2026-11-23T04:30:00Z'), kol)).toBe(at('2026-11-23T11:30:00Z'));
  });
});

describe('edges', () => {
  it('nothing blocked is no schedule, and so is EVERY hour blocked (decided 21 Nov 2026: Setup will not save a week with no hour to play; an old or odd saved one plans as if no hours were set, never as "never")', () => {
    for (const odd of [[], [-1, 168, 3.5], range(0, WEEK_HOURS)]) {
      const a = mask(odd);
      expect(isConstrained(a)).toBe(false);
      expect(availabilityKey(a)).toBe('');
      expect(describeAvailability(a)).toBe('any time');
      expect(isAvailable(at('2026-11-24T18:30:00Z'), a)).toBe(true);
      expect(nextAvailable(at('2026-11-24T18:30:00Z'), a)).toBe(at('2026-11-24T18:30:00Z'));
      expect(countUnavailable([at('2026-11-24T18:30:00Z')], a)).toBe(0);
    }
    // One free hour is a schedule.
    expect(isConstrained(mask(range(1, WEEK_HOURS)))).toBe(true);
  });
  it('a mask that is not its window gets its own key, the same in any order, and its own words', () => {
    const a = mask(SLEEP_WORK);
    const b = mask([...SLEEP_WORK].reverse());
    expect(availabilityKey(a)).toBe(availabilityKey(b));
    expect(availabilityKey(a)).not.toBe(availabilityKey(mask(maskOfWindow([], 7, 23))));
    expect(availabilityKey(a)).not.toBe(availabilityKey(mask(SLEEP_WORK, 'Europe/London')));
    expect(describeAvailability(a)).not.toBe(describeAvailability(mask(maskOfWindow([], 7, 23))));
    expect(describeAvailability(a).length).toBeLessThanOrEqual(64);
  });
});
