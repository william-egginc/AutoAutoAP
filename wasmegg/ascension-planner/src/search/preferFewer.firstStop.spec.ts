/**
 * Prefer fewer does not count a dropped first stop that only finishes the current ascension soon (Jordan, 28 Oct 2026).
 * "Same TE" swapped 197 218 247 285 313 (prestige at 197 two days out) for 218 247 277 313 (the current ascension kept
 * going from 196 for two months): it ends either way, so nothing is saved. Made-up routes, the save at 196 TE, a fixed
 * plan start; no clock.
 */
import { describe, expect, it } from 'vitest';
import {
  boxRouteOf,
  choosePreferFewer,
  firstStopOf,
  quickFirstStop,
  QUICK_FIRST_STOP_SECONDS,
  QUICK_FIRST_STOP_TE,
  type PreferMargin,
  type PreferRow,
} from './preferFewer';

const H = 3600;
const D = 86400;
const START = 1_860_000_000;
const DEADLINE = START + 400 * D;
const SAVE_TE = 196;
const SAME: PreferMargin = { kind: 'te', te: 0 };

/** A By a date row: the first leg from the save's TE at the plan start, ending `firstDays` later. */
function row(chain: number[], firstDays: number, spareH = 30): PreferRow<string> {
  return {
    item: chain.join(' '),
    ascensions: chain.length,
    finish: DEADLINE - spareH * H,
    endTE: chain[chain.length - 1],
    spare: spareH * H,
    shifts: null,
    first: { from: SAVE_TE, to: chain[0], start: START, end: START + firstDays * D },
  };
}

const jordanBest = row([197, 218, 247, 285, 313], 2);
const jordanFewer = row([218, 247, 277, 313], 60);

describe('quickFirstStop: the first stop only finishes the current ascension soon', () => {
  it('the thresholds', () => {
    expect(QUICK_FIRST_STOP_TE).toBe(2);
    expect(QUICK_FIRST_STOP_SECONDS).toBe(3 * D);
  });
  it('TE: 2 above the save is quick even ending in months; 3 above is not', () => {
    expect(quickFirstStop({ from: 196, to: 198, start: START, end: START + 90 * D })).toBe(true);
    expect(quickFirstStop({ from: 196, to: 199, start: START, end: START + 90 * D })).toBe(false);
  });
  it('days: ending 3 days after the plan start is quick however far in TE; a second more is not', () => {
    expect(quickFirstStop({ from: 196, to: 205, start: START, end: START + 3 * D })).toBe(true);
    expect(quickFirstStop({ from: 196, to: 205, start: START, end: START + 3 * D + 1 })).toBe(false);
  });
  it('nothing known: not quick', () => {
    expect(quickFirstStop(null)).toBe(false);
    expect(quickFirstStop({ to: 197 })).toBe(false);
  });
  it('firstStopOf reads the first leg', () => {
    expect(firstStopOf([{ from: 196, to: 197, endTE: 197, start: START, end: START + D }], [197, 218])).toEqual({
      from: 196,
      to: 197,
      start: START,
      end: START + D,
    });
    expect(firstStopOf(null)).toBeNull();
  });
});

describe('Prefer fewer and a quick first stop', () => {
  it("Jordan's routes at 196 TE: dropping 197 is not fewer, the box keeps 197 218 247 285 313", () => {
    const c = choosePreferFewer('date', [jordanBest, jordanFewer], SAME, jordanBest)!;
    expect(c.chosen).toBe(jordanBest);
    expect(c.state).toBe('only');
    expect(c.keptFirstStop).toBe(true);
  });

  it('the Egg Day numbers too (25 h and 9 h to spare): the best', () => {
    const best = row([197, 218, 247, 285, 313], 2, 25);
    const fewer = row([218, 247, 277, 313], 60, 9);
    expect(choosePreferFewer('date', [best, fewer], SAME, best)!.chosen).toBe(best);
  });

  it('a first stop far away (230 from 196, weeks out) dropped still counts as fewer', () => {
    const best = row([230, 260, 290, 313], 40);
    const fewer = row([260, 290, 313], 70);
    const c = choosePreferFewer('date', [best, fewer], SAME, best)!;
    expect(c.state).toBe('fewer');
    expect(c.chosen).toBe(fewer);
    expect(c.ascensionsFewer).toBe(1);
    expect(c.keptFirstStop).toBe(false);
  });

  it('dropping a stop that is not the first still counts as fewer', () => {
    const fewer = row([197, 218, 247, 313], 2);
    const c = choosePreferFewer('date', [jordanBest, fewer], SAME, jordanBest)!;
    expect(c.chosen).toBe(fewer);
    expect(c.ascensionsFewer).toBe(1);
  });

  it('a first stop 2 TE up that ends in months is still quick (TE alone is enough): kept', () => {
    const best = row([198, 218, 247, 285, 313], 90);
    const c = choosePreferFewer('date', [best, jordanFewer], SAME, best)!;
    expect(c.chosen).toBe(best);
    const three = row([199, 218, 247, 285, 313], 90);
    expect(choosePreferFewer('date', [three, jordanFewer], SAME, three)!.chosen).toBe(jordanFewer);
  });

  it('a route that opens with a quick stop of its own saves all it drops', () => {
    const fewer = row([198, 247, 313], 3);
    const c = choosePreferFewer('date', [jordanBest, fewer], SAME, jordanBest)!;
    expect(c.chosen).toBe(fewer);
    expect(c.ascensionsFewer).toBe(2);
  });

  it('dropping the quick stop and another: one counted', () => {
    const fewer = row([218, 247, 313], 60);
    const c = choosePreferFewer('date', [jordanBest, jordanFewer, fewer], SAME, jordanBest)!;
    expect(c.chosen).toBe(fewer);
    expect(c.ascensionsFewer).toBe(1);
    expect(c.prestigesFewer).toBe(1);
  });

  it('Fastest: the same rule', () => {
    const fast = (chain: number[], firstDays: number, behindH: number): PreferRow<string> => ({
      item: chain.join(' '),
      ascensions: chain.length,
      finish: START + 100 * D + behindH * H,
      shifts: null,
      first: { from: SAVE_TE, to: chain[0], start: START, end: START + firstDays * D },
    });
    const best = fast([197, 250, 300, 350, 490], 2, 0);
    const fewer = fast([250, 300, 350, 490], 30, 3);
    expect(choosePreferFewer('fastest', [best, fewer], { kind: 'time', seconds: 12 * H }, best)!.chosen).toBe(best);
  });

  it('routes without a known first stop: unchanged', () => {
    const { first: _a, ...best } = jordanBest;
    const { first: _b, ...fewer } = jordanFewer;
    expect(choosePreferFewer('date', [best, fewer], SAME, best)!.chosen).toBe(fewer);
  });

  it('a saved answer (My runs, the instant baseline) follows the same rule', () => {
    const saved = (chain: number[], firstDays: number) => ({
      chain,
      end: DEADLINE - 30 * H,
      legs: chain.map((to, k) => ({
        from: k ? chain[k - 1] : SAVE_TE,
        to,
        endTE: to,
        start: START,
        end: START + firstDays * D,
      })),
    });
    const top = saved([197, 218, 247, 285, 313], 2);
    const four = saved([218, 247, 277, 313], 60);
    expect(boxRouteOf('date', top, [four, top], SAME, DEADLINE)).toBe(top);
    const far = saved([230, 260, 290, 313], 40);
    const farFewer = saved([260, 290, 313], 70);
    expect(boxRouteOf('date', far, [farFewer, far], SAME, DEADLINE)).toBe(farFewer);
  });
});
