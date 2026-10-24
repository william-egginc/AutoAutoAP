/**
 * The Egg Day rule (lib/eggDayRule.ts, Jordan 22 Oct 2026): a route counts for Egg Day only when its last TE comes
 * before Egg Day starts (Jul 14, 2027, 9:00 am Pacific = 10:00 am Mountain); By a date's own dates the same.
 */
import { describe, expect, it } from 'vitest';
import {
  deadlineKind,
  finishesBefore,
  lateMarker,
  lateRoutes,
  lateSeconds,
  lateSpanWords,
  nearestLate,
  noRouteInTimeWords,
  onTimeRoutes,
  splitOnTime,
} from './eggDayRule';
import { eggDaySeconds } from './eggDay';

const START = eggDaySeconds(2027);
const H = 3600;
const MAR3 = Date.UTC(2027, 2, 3, 7) / 1000;

describe('finishesBefore: before, exactly at, after the start', () => {
  it('Egg Day 2027 starts Jul 14, 2027 at 16:00 UTC (9:00 am Pacific, 10:00 am Mountain)', () => {
    expect(START).toBe(Date.UTC(2027, 6, 14, 16) / 1000);
  });

  it('a route that lands before the start counts', () => {
    expect(finishesBefore(START - 1, START)).toBe(true);
    expect(finishesBefore(START - 30 * H, START)).toBe(true);
    expect(lateSeconds(START - H, START)).toBeNull();
  });

  it('exactly at the start counts (as the boards’ madeDeadline always had it)', () => {
    expect(finishesBefore(START, START)).toBe(true);
    expect(lateSeconds(START, START)).toBeNull();
  });

  it('a route that lands after the start does not, by how much it is late', () => {
    expect(finishesBefore(START + 1, START)).toBe(false);
    expect(finishesBefore(START + 6.5 * H, START)).toBe(false);
    expect(lateSeconds(START + 7 * H, START)).toBe(7 * H);
  });

  it('known to miss but untimed (Infinity) is late; an unknown time (NaN) is late too', () => {
    expect(finishesBefore(Infinity, START)).toBe(false);
    expect(lateSeconds(Infinity, START)).toBe(Infinity);
    expect(finishesBefore(NaN, START)).toBe(false);
    expect(lateSeconds(NaN, START)).toBe(Infinity);
  });
});

describe('mixed lists', () => {
  const routes = [
    { id: 'late-high', te: 249, at: START + 7 * H },
    { id: 'early', te: 247, at: START - 20 * H },
    { id: 'at', te: 248, at: START },
    { id: 'later', te: 250, at: START + 30 * H },
    { id: 'untimed', te: 251, at: Infinity },
  ];
  const at = (r: (typeof routes)[number]) => r.at;

  it('splits into the routes in time and the late ones, each in the list’s order', () => {
    const { onTime, late } = splitOnTime(routes, at, START);
    expect(onTime.map(r => r.id)).toEqual(['early', 'at']);
    expect(late.map(r => r.id)).toEqual(['late-high', 'later', 'untimed']);
    expect(onTimeRoutes(routes, at, START)).toEqual(onTime);
    expect(lateRoutes(routes, at, START)).toEqual(late);
  });

  it('the nearest late route: the soonest after the start, never an untimed one', () => {
    expect(nearestLate(routes, at, START)).toEqual({ item: routes[0], seconds: 7 * H });
    expect(nearestLate([routes[4]], at, START)).toBeNull();
    expect(nearestLate([routes[1], routes[2]], at, START)).toBeNull();
  });

  it('no route in time: nothing to pick, every route late', () => {
    const late = routes.filter(r => r.at > START);
    expect(onTimeRoutes(late, at, START)).toEqual([]);
    expect(lateRoutes(late, at, START)).toHaveLength(3);
  });
});

describe('By a date: the same rule against the player’s own date', () => {
  it('before, at, after Mar 3', () => {
    expect(finishesBefore(MAR3 - H, MAR3)).toBe(true);
    expect(finishesBefore(MAR3, MAR3)).toBe(true);
    expect(finishesBefore(MAR3 + H, MAR3)).toBe(false);
    expect(splitOnTime([MAR3 - H, MAR3 + 2 * H], x => x, MAR3)).toEqual({ onTime: [MAR3 - H], late: [MAR3 + 2 * H] });
  });

  it('which marker: Egg Day’s start (any year) or another date', () => {
    expect(deadlineKind(START)).toBe('eggday');
    expect(deadlineKind(eggDaySeconds(2028))).toBe('eggday');
    expect(deadlineKind(START + 3600)).toBe('date');
    expect(deadlineKind(MAR3)).toBe('date');
  });
});

describe('the words', () => {
  it('the markers', () => {
    expect(lateMarker('eggday')).toBe('after Egg Day starts');
    expect(lateMarker('date')).toBe('after your date');
  });

  it('no route in time: said plainly, with how far the nearest is', () => {
    expect(noRouteInTimeWords('eggday', 7 * H)).toBe('No route finishes before Egg Day starts. The nearest is 7 hours after.');
    expect(noRouteInTimeWords('date', 7 * H)).toBe('No route finishes before your date. The nearest is 7 hours after.');
    expect(noRouteInTimeWords('eggday', 1.2 * H)).toBe('No route finishes before Egg Day starts. The nearest is 1 hour after.');
    expect(noRouteInTimeWords('eggday', 20 * 60)).toBe('No route finishes before Egg Day starts. The nearest is under an hour after.');
    expect(noRouteInTimeWords('eggday', 5 * 24 * H)).toBe('No route finishes before Egg Day starts. The nearest is 5 days after.');
  });

  it('with no timed nearest, the first sentence only', () => {
    expect(noRouteInTimeWords('eggday', null)).toBe('No route finishes before Egg Day starts.');
    expect(noRouteInTimeWords('date', Infinity)).toBe('No route finishes before your date.');
  });

  it('the span: hours under two days, then days', () => {
    expect(lateSpanWords(59 * 60)).toBe('under an hour');
    expect(lateSpanWords(H)).toBe('1 hour');
    expect(lateSpanWords(47 * H)).toBe('47 hours');
    expect(lateSpanWords(48 * H)).toBe('2 days');
  });
});
