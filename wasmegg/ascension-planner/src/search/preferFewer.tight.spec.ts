/**
 * Prefer fewer picks a tight route like any other (ux35-c, 28 Oct 2026; ux34-c's "never a tight route" was a
 * misunderstanding and is gone). "Same TE" is the lowest ascension count reaching the best TE, even marked tight. What
 * keeps Egg Day's 197 218 247 285 313 is the quick-first-stop rule (preferFewer.firstStop.spec.ts), not its spare.
 * Made-up routes, the save at 196 TE, a fixed plan start; no clock.
 */
import { describe, expect, it } from 'vitest';
import { boxRouteOf, choosePreferFewer, type PreferMargin, type PreferRow } from './preferFewer';
import { isTightSpare } from '@/lib/spareLine';

const H = 3600;
const D = 86400;
const START = 1_860_000_000;
const DEADLINE = START + 400 * D;
const SAVE_TE = 196;
const SAME: PreferMargin = { kind: 'te', te: 0 };

/** A By a date row: the first leg from the save's TE at the plan start, ending `firstDays` later. */
function row(chain: number[], spareH: number, firstDays: number): PreferRow<string> {
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

describe('Prefer fewer and tight routes (By a date)', () => {
  it('the spares used here: 9 h is tight, 25 h is not (the box tag, no gear caveat)', () => {
    expect(isTightSpare(9 * H)).toBe(true);
    expect(isTightSpare(25 * H)).toBe(false);
  });

  it('Egg Day at 196 TE: 218 247 277 313 (9 h, tight) only drops the quick 197, so the box keeps 197 218 247 285 313 (25 h)', () => {
    const best = row([197, 218, 247, 285, 313], 25, 2);
    const tight4 = row([218, 247, 277, 313], 9, 60);
    const c = choosePreferFewer('date', [best, tight4], SAME, best)!;
    expect(c.chosen).toBe(best);
    expect(c.state).toBe('only');
    expect(c.keptFirstStop).toBe(true);
  });

  it('the fewer route is tight and the dropped stop is not a quick first stop: the fewer tight route is picked', () => {
    // The best opens with a long stop (196 to 210, 20 days): dropping a later stop is a real ascension saved.
    const best = row([210, 247, 285, 313], 25, 20);
    const tight3 = row([210, 260, 313], 9, 20);
    const c = choosePreferFewer('date', [best, tight3], SAME, best)!;
    expect(c.state).toBe('fewer');
    expect(c.chosen).toBe(tight3);
    expect(c.ascensionsFewer).toBe(1);
  });

  it('the fewest is tight, a next-fewest has room: the fewest (tight) is picked', () => {
    const best = row([205, 230, 260, 290, 313], 25, 20);
    const tight3 = row([205, 260, 313], 9, 20);
    const roomy4 = row([205, 247, 285, 313], 30, 20);
    const c = choosePreferFewer('date', [best, tight3, roomy4], SAME, best)!;
    expect(c.chosen).toBe(tight3);
    expect(c.ascensionsFewer).toBe(2);
  });

  it('a saved answer (My runs, the instant baseline) follows the same rule', () => {
    const saved = (chain: number[], spareH: number, firstDays: number) => ({
      chain,
      end: DEADLINE - spareH * H,
      legs: chain.map((to, i) => ({
        endTE: to,
        to,
        ...(i === 0 ? { from: SAVE_TE, start: START, end: START + firstDays * D } : {}),
      })),
    });
    const top = saved([210, 247, 285, 313], 25, 20);
    const tight3 = saved([210, 260, 313], 9, 20);
    expect(boxRouteOf('date', top, [null, null, null, tight3, top], SAME, DEADLINE)).toBe(tight3);
    // Egg Day: the tight 4 only drops the quick 197, so the 5 stays.
    const egg = saved([197, 218, 247, 285, 313], 25, 2);
    const egg4 = saved([218, 247, 277, 313], 9, 60);
    expect(boxRouteOf('date', egg, [null, null, null, null, egg4, egg], SAME, DEADLINE)).toBe(egg);
  });
});
