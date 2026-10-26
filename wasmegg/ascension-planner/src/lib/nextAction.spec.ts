import { describe, expect, it } from 'vitest';
import { nextAction, nextActionWords, type ActionLeg } from './nextAction';
import { nextPrestigeAt } from '@/search/noPrestige';
import type { Availability } from '@/search/availability';

const H = 3600;
// Monday 4 Jan 2027, 9:00 am PST.
const T0 = Date.parse('2027-01-04T17:00:00Z') / 1000;
const ZONE = 'America/Los_Angeles';
const HOURS: Availability = { days: [], fromHour: 9, toHour: 21, timezone: ZONE };

/** A fresh ascension: builds up until its first shift (K1 at +30 min), then shifts, ends at +40 h. */
const fresh: ActionLeg = {
  to: 226,
  endTE: 227,
  start: T0,
  end: T0 + 40 * H,
  buildEnd: T0 + 20 * H,
  simulated: true,
  shifts: [
    { at: T0 + 0.5 * H, egg: 'kindness' },
    { at: T0 + 10 * H, egg: 'humility' },
    { at: T0 + 30 * H, egg: 'curiosity' },
  ],
};
/** Continuing the ascension as it is: no build-up (its build phase ends where it starts). */
const cont: ActionLeg = { ...fresh, buildEnd: T0 };
const at = (now: number, leg: ActionLeg | null = fresh, last = false, prestigeAt?: (t: number) => number) =>
  nextAction({ now, leg, last, prestigeAt });

describe('nextAction, each phase', () => {
  it('before the ascension starts: prestige then', () => {
    expect(at(T0 - H)).toEqual({ kind: 'prestige', at: T0, te: null });
  });
  it('in the build-up (before the first shift): building up until it', () => {
    expect(at(T0 + 60)).toEqual({ kind: 'build', until: T0 + 0.5 * H });
  });
  it('no build-up when continuing the ascension as it is: the next shift', () => {
    expect(at(T0 + 60, cont)).toEqual({ kind: 'shift', egg: 'kindness', at: T0 + 0.5 * H });
  });
  it('between shifts: the next shift', () => {
    expect(at(T0 + 0.5 * H)).toEqual({ kind: 'shift', egg: 'humility', at: T0 + 10 * H });
    expect(at(T0 + 12 * H)).toEqual({ kind: 'shift', egg: 'curiosity', at: T0 + 30 * H });
  });
  it('after the last shift: the prestige, held for the hours; on the last ascension the goal', () => {
    // Ends 1:00 am: the prestige waits for 9:00 am.
    const held = at(T0 + 31 * H, fresh, false, t => nextPrestigeAt(t, HOURS, []));
    expect(held).toEqual({ kind: 'prestige', at: T0 + 48 * H, te: 227 });
    expect(at(T0 + 31 * H)).toEqual({ kind: 'prestige', at: T0 + 40 * H, te: 227 });
    expect(at(T0 + 31 * H, fresh, true)).toEqual({ kind: 'goal', at: T0 + 40 * H, te: 227 });
  });
  it('nothing known: null', () => {
    expect(at(T0, null)).toBeNull();
    expect(at(T0, { ...fresh, end: NaN })).toBeNull();
  });
});

describe('nextActionWords', () => {
  const when = (t: number) => `<${t - T0}>`;
  it('says each in the player words', () => {
    expect(nextActionWords({ kind: 'shift', egg: 'humility', at: T0 + 5 }, when)).toBe('Shift to Humility at <5>');
    expect(nextActionWords({ kind: 'build', until: T0 + 5 }, when)).toBe('Building up until about <5>');
    expect(nextActionWords({ kind: 'prestige', at: T0 + 5, te: 227 }, when)).toBe('Prestige at <5>');
    expect(nextActionWords({ kind: 'goal', at: T0 + 5, te: 490 }, when)).toBe('Reach 490 TE at <5>');
  });
});
