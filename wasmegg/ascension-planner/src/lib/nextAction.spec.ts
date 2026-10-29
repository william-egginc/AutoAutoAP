import { describe, expect, it } from 'vitest';
import { continuesFarm, nextAction, nextActionWords, nextShiftWords, nextShifts, type ActionLeg } from './nextAction';
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

describe('nextShifts: the short list under the Next step', () => {
  const D = 86400;
  // A2 and A3 from the table (each with its shifts from H1 on), A2 starting on the hour after A1's end.
  const table = (start: number, to: number): ActionLeg => ({
    to,
    endTE: to,
    start,
    end: start + 3 * D,
    shifts: [
      { at: start + 30 * H, egg: 'humility' },
      { at: start + 31 * H, egg: 'kindness' },
      { at: start + 2 * D, egg: 'curiosity' },
    ],
  });
  const a2 = T0 + 41 * H;
  const legs = [fresh, table(a2, 277), table(a2 + 3 * D + H, 317)];

  it('in the build-up the list starts at the first shift (the build-up ends there: never two lines at one time); ends with a prestige once it holds 3', () => {
    const l = nextShifts({ now: T0 + 60, legs });
    expect(l.map(x => [x.kind, x.egg ?? x.te ?? null, x.exact])).toEqual([
      ['shift', 'kindness', true],
      ['shift', 'humility', true],
      ['shift', 'curiosity', true],
      ['prestige', 227, true],
    ]);
  });

  it('between shifts: fewer than 3 before the prestige, so it goes on into the next ascension\'s table shifts', () => {
    const l = nextShifts({ now: T0 + 12 * H, legs, prestigeAt: t => nextPrestigeAt(t, HOURS, []) });
    expect(l.map(x => [x.kind, x.at, x.exact])).toEqual([
      ['shift', T0 + 30 * H, true],
      ['prestige', T0 + 48 * H, true],
      ['shift', a2 + 30 * H, false],
      ['shift', a2 + 31 * H, false],
      ['shift', a2 + 2 * D, false],
      ['prestige', a2 + 3 * D + H, false],
    ]);
  });

  it('at most 5 shifts, and the goal ends it on the last ascension', () => {
    const many = { ...fresh, shifts: Array.from({ length: 8 }, (_, i) => ({ at: T0 + (i + 1) * H, egg: 'kindness' })) };
    expect(nextShifts({ now: T0 + 0.5 * H, legs: [{ ...many, buildEnd: T0 }] }).filter(x => x.kind === 'shift')).toHaveLength(5);
    const last = nextShifts({ now: T0 + 31 * H, legs: [fresh] });
    expect(last).toEqual([{ kind: 'goal', at: T0 + 40 * H, te: 227, exact: true }]);
  });

  it('without the simulation: no building line; the current ascension\'s prestige from the table, then the later shifts', () => {
    const l = nextShifts({ now: T0 + 60, legs: [{ to: 226, endTE: 226, start: T0, end: T0 + 40 * H }, ...legs.slice(1)] });
    expect(l[0]).toEqual({ kind: 'prestige', at: a2, te: 226, exact: false });
    expect(l.filter(x => x.kind === 'shift')).toHaveLength(3);
  });

  it('only the ascension you are in known (`more`): it ends with its prestige, held for the hours, not the goal', () => {
    const l = nextShifts({ now: T0 + 12 * H, legs: [fresh], more: true, prestigeAt: t => nextPrestigeAt(t, HOURS, []) });
    expect(l).toEqual([
      { kind: 'shift', egg: 'curiosity', at: T0 + 30 * H, exact: true },
      { kind: 'prestige', at: T0 + 48 * H, te: 227, exact: true },
    ]);
  });

  it('nothing ahead: empty', () => {
    expect(nextShifts({ now: T0 + 100 * D, legs })).toEqual([]);
    expect(nextShifts({ now: T0, legs: [] })).toEqual([]);
  });

  it('words', () => {
    const when = (t: number, exact: boolean) => `${exact ? 'x' : 'h'}${t - T0}`;
    expect(nextShiftWords({ kind: 'shift', egg: 'humility', at: T0 + 5, exact: false }, when)).toBe('Shift to Humility · about h5');
    expect(nextShiftWords({ kind: 'build', at: T0 + 5, exact: true }, when)).toBe('Building up until about x5');
    expect(nextShiftWords({ kind: 'prestige', at: T0 + 5, te: 277, exact: false }, when)).toBe('Prestige at 277 TE · about h5');
    expect(nextShiftWords({ kind: 'goal', at: T0 + 5, te: 490, exact: false }, when)).toBe('490 TE reached · about h5');
  });
});

describe("the save's own farm, already laying (26 Oct 2026: a producing farm on Curiosity said \"Building up until …\" twice)", () => {
  // Jordan's state: ascension 1 of 4 continued from the live save at 195 TE, the farm on Curiosity; the simulated leg's
  // build phase ends at the very moment of its first shift, to Humility.
  const H1 = T0 + 18 * 86400 + 23 * 60;
  const live = (key: string): ActionLeg => ({
    to: 226,
    endTE: 226,
    start: T0,
    end: T0 + 40 * 86400,
    buildEnd: H1,
    simulated: true,
    ...(continuesFarm(key) ? { live: true } : {}),
    shifts: [
      { at: H1, egg: 'humility' },
      { at: H1 + 60, egg: 'kindness' },
      { at: H1 + 5 * 86400, egg: 'integrity' },
    ],
  });
  it("a 'continue' or 'buildup' leg never builds up: the Next step is the first shift", () => {
    expect(continuesFarm('continue')).toBe(true);
    expect(continuesFarm('buildup')).toBe(true);
    expect(continuesFarm('2-sale')).toBe(false);
    for (const key of ['continue', 'buildup']) expect(nextAction({ now: T0 + H, leg: live(key), last: false })).toEqual({ kind: 'shift', egg: 'humility', at: H1 });
    // A fresh start in its build-up still says so.
    expect(nextAction({ now: T0 + H, leg: live('2-sale'), last: false })).toEqual({ kind: 'build', until: H1 });
  });
  it('the list starts at the first shift, and no two lines share a time', () => {
    for (const key of ['continue', '2-sale']) {
      const l = nextShifts({ now: T0 + H, legs: [live(key)], more: true });
      expect(l.map(x => [x.kind, x.egg ?? null])).toEqual([
        ['shift', 'humility'],
        ['shift', 'kindness'],
        ['shift', 'integrity'],
        ['prestige', null],
      ]);
      const minutes = l.map(x => Math.floor(x.at / 60));
      expect(new Set(minutes).size).toBe(minutes.length);
    }
  });
  it('the same shift twice at one minute is one line', () => {
    const twice = { ...live('continue'), shifts: [{ at: H1, egg: 'humility' }, { at: H1 + 10, egg: 'humility' }] };
    expect(nextShifts({ now: T0, legs: [twice], more: true }).filter(x => x.kind === 'shift')).toHaveLength(1);
  });
  it('a fresh leg with no shifts listed still has its building-up line', () => {
    const bare = { ...live('2-sale'), shifts: [] };
    expect(nextShifts({ now: T0 + H, legs: [bare], more: true }).map(x => x.kind)).toEqual(['build', 'prestige']);
  });
});
