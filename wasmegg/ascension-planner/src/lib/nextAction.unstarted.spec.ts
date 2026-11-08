/**
 * B1 (spec-r7qa, 3 Nov 2026): a fresh start the save hasn't prestiged into (`unstarted`: the save is producing) reads its
 * prestige first, never "Building up until …"; without `unstarted` the build-up line is as before.
 */
import { describe, expect, it } from 'vitest';
import { nextAction, nextActionWords, nextShifts, type ActionLeg } from './nextAction';

const NOW = 1_800_000_000;
const H = 3600;
const fresh: ActionLeg = {
  to: 151,
  endTE: 151,
  start: NOW - 60,
  end: NOW + 100 * H,
  buildEnd: NOW + 7 * 24 * H,
  shifts: [
    { at: NOW + 29 * 60, egg: 'kindness' },
    { at: NOW + 44 * 60, egg: 'integrity' },
  ],
  simulated: true,
};

describe('nextAction: a fresh start not begun', () => {
  it('without the save saying so: the build-up, as before', () => {
    expect(nextAction({ now: NOW, leg: fresh, last: false })).toEqual({ kind: 'build', until: NOW + 29 * 60 });
  });
  it('the save producing: the prestige, as soon as the hours allow', () => {
    const leg = { ...fresh, unstarted: { te: 147 } };
    expect(nextAction({ now: NOW, leg, last: false })).toEqual({ kind: 'prestige', at: NOW, te: null });
    const a = nextAction({ now: NOW, leg, last: false, prestigeAt: t => t + 2 * H })!;
    expect(a).toEqual({ kind: 'prestige', at: NOW + 2 * H, te: null });
    expect(nextActionWords(a, t => String(t))).toBe(`Prestige on ${NOW + 2 * H}`);
    const lines = nextShifts({ now: NOW, legs: [leg], more: true });
    expect(lines.map(l => [l.kind, l.egg ?? l.te])).toEqual([
      ['prestige', 147],
      ['shift', 'kindness'],
      ['shift', 'integrity'],
      ['prestige', 151],
    ]);
  });
  it('a leg carrying on the farm is never unstarted', () => {
    const leg = { ...fresh, live: true, unstarted: { te: 147 } };
    expect(nextAction({ now: NOW, leg, last: false })).toEqual({ kind: 'shift', egg: 'kindness', at: NOW + 29 * 60 });
  });
});
