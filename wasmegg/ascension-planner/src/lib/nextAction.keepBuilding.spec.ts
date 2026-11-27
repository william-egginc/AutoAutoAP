/**
 * AN UNFINISHED BUILD (27 Oct 2026, pieha and Jordan): pieha is mid-ascension with not all vehicles bought, and Next
 * step said "Shift to Curiosity", then the delivery loop from Humility, with no build-up and Kindness not first. When
 * the save's build isn't finished (lib/saveBuild.ts), the ascension you are in is simulated as the build-up carried on
 * from the save, and Next step and Next shifts START with "Keep building: <what> until about <the build phase's end>".
 */
import { describe, expect, it } from 'vitest';
import { nextAction, nextActionWords, nextShiftWords, nextShifts, type ActionLeg } from './nextAction';
import { buildLeftWords } from './saveBuild';

const H = 3600;
const T0 = Date.parse('2027-01-04T17:00:00Z') / 1000;

/** pieha's state: the build-up carried on from the save ('buildup', live), its build phase ending at +20 h, its first
 *  shift there (a shift before it drops the line: lib/saveBuild.producing.spec.ts), then H1 and K3. */
const building: ActionLeg = {
  to: 226,
  endTE: 226,
  start: T0,
  end: T0 + 60 * H,
  buildEnd: T0 + 20 * H,
  simulated: true,
  live: true,
  building: ['vehicles', 'habs'],
  shifts: [
    { at: T0 + 20 * H, egg: 'curiosity' },
    { at: T0 + 40 * H, egg: 'humility' },
    { at: T0 + 40 * H + 60, egg: 'kindness' },
  ],
};

describe('Next step with the build unfinished', () => {
  it('keep building until the build phase ends, never the first shift', () => {
    expect(nextAction({ now: T0 + H, leg: building, last: false })).toEqual({
      kind: 'keepbuilding',
      until: T0 + 20 * H,
      left: ['vehicles', 'habs'],
    });
    // Past the build phase: the shifts as before.
    expect(nextAction({ now: T0 + 21 * H, leg: building, last: false })).toEqual({
      kind: 'shift',
      egg: 'humility',
      at: T0 + 40 * H,
    });
  });
  it('a live leg without the unfinished parts still never builds up (the producing farm on Curiosity)', () => {
    const { building: _b, ...done } = building;
    expect(nextAction({ now: T0 + H, leg: done, last: false })).toEqual({
      kind: 'shift',
      egg: 'curiosity',
      at: T0 + 20 * H,
    });
  });
  it('words', () => {
    const when = (t: number) => `<${(t - T0) / H}h>`;
    expect(nextActionWords({ kind: 'keepbuilding', until: T0 + 20 * H, left: ['vehicles', 'habs'] }, when)).toBe(
      'Keep building: vehicles and habs until about <20h>'
    );
    expect(nextActionWords({ kind: 'keepbuilding', until: T0 + 20 * H, left: ['vehicles'] }, when)).toBe(
      'Keep building: vehicles until about <20h>'
    );
  });
});

describe('Next shifts with the build unfinished', () => {
  it('starts with the keep-building line, then the shifts', () => {
    const l = nextShifts({ now: T0 + H, legs: [building], more: true });
    expect(l.map(x => [x.kind, x.egg ?? null])).toEqual([
      ['keepbuilding', null],
      ['shift', 'curiosity'],
      ['shift', 'humility'],
      ['shift', 'kindness'],
      ['prestige', null],
    ]);
    expect(l[0]).toEqual({ kind: 'keepbuilding', at: T0 + 20 * H, left: ['vehicles', 'habs'], exact: true });
    const when = (t: number, exact: boolean) => `${exact ? 'x' : 'h'}${(t - T0) / H}`;
    expect(nextShiftWords(l[0], when)).toBe('Keep building: vehicles and habs until about x20');
  });
  it('past the build phase: no keep-building line', () => {
    expect(nextShifts({ now: T0 + 21 * H, legs: [building], more: true })[0]).toMatchObject({
      kind: 'shift',
      egg: 'humility',
    });
  });
});

describe("the save's build (lib/saveBuild.ts; what is unfinished: saveBuild.producing.spec.ts)", () => {
  it('words', () => {
    expect(buildLeftWords(['vehicles', 'habs'])).toBe('vehicles and habs');
    expect(buildLeftWords(['habs'])).toBe('habs');
  });
});
