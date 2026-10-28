/**
 * Prefer fewer never trades a route with room for a tight one (ux34-c, 28 Oct 2026). On Egg Day the default "same TE"
 * picked 218 247 277 313 (9 h to spare, marked tight) over 197 218 247 285 313 (25 h to spare). Tight is the box's
 * own test (lib/spareLine.ts `isTightSpare`). Made-up routes, a fixed clock.
 */
import { describe, expect, it } from 'vitest';
import { boxRouteOf, choosePreferFewer, type PreferMargin, type PreferRow } from './preferFewer';

const H = 3600;
const DEADLINE = 1_866_000_000;
const SAME: PreferMargin = { kind: 'te', te: 0 };

function row(chain: number[], spareH: number): PreferRow<string> {
  return {
    item: chain.join(' '),
    ascensions: chain.length,
    finish: DEADLINE - spareH * H,
    endTE: chain[chain.length - 1],
    spare: spareH * H,
    shifts: null,
  };
}

// The Egg Day pair: the highest TE with 25 h to spare, and one fewer ascension to the same TE with 9 h.
const best = row([197, 218, 247, 285, 313], 25);
const tight4 = row([218, 247, 277, 313], 9);

describe('Prefer fewer and tight routes (By a date)', () => {
  it('Egg Day: the best has room, the fewer one is tight: the box keeps the best', () => {
    const c = choosePreferFewer('date', [best, tight4], SAME, best)!;
    expect(c.chosen).toBe(best);
    expect(c.state).toBe('none');
    expect(c.skippedTight).toBe(true);
  });

  it('the fewest is tight: the next-fewest with room is picked', () => {
    const tight3 = row([247, 285, 313], 9);
    const roomy4 = row([218, 247, 285, 313], 30);
    const c = choosePreferFewer('date', [best, tight3, roomy4], SAME, best)!;
    expect(c.state).toBe('fewer');
    expect(c.chosen).toBe(roomy4);
    expect(c.ascensionsFewer).toBe(1);
    expect(c.skippedTight).toBe(true);
  });

  it('every fewer route is tight: the best', () => {
    const tight3 = row([247, 285, 313], 3);
    const c = choosePreferFewer('date', [best, tight3, tight4], SAME, best)!;
    expect(c.chosen).toBe(best);
    expect(c.state).toBe('none');
  });

  it('the best is tight itself: unchanged, the fewer (tight) route is still picked', () => {
    const tightBest = row([197, 218, 247, 285, 313], 20);
    const c = choosePreferFewer('date', [tightBest, tight4], SAME, tightBest)!;
    expect(c.state).toBe('fewer');
    expect(c.chosen).toBe(tight4);
    expect(c.skippedTight).toBe(false);
  });

  it('the fewer route has room: still picked', () => {
    const roomy4 = row([218, 247, 277, 313], 26);
    const c = choosePreferFewer('date', [best, roomy4], SAME, best)!;
    expect(c.state).toBe('fewer');
    expect(c.chosen).toBe(roomy4);
    expect(c.skippedTight).toBe(false);
  });

  it('with the gear caveat showing, 25 h is tight too (inside its window): unchanged', () => {
    const c = choosePreferFewer('date', [best, tight4], SAME, best, { gearCaveat: true })!;
    expect(c.chosen).toBe(tight4);
  });

  it('Off: the best, nothing skipped', () => {
    const c = choosePreferFewer('date', [best, tight4], { kind: 'off' }, best)!;
    expect(c.chosen).toBe(best);
    expect(c.skippedTight).toBe(false);
  });

  it('a saved answer (My runs, the instant baseline) follows the same rule', () => {
    const saved = (chain: number[], spareH: number) => ({
      chain,
      end: DEADLINE - spareH * H,
      legs: chain.map(to => ({ endTE: to })),
    });
    const top = saved([197, 218, 247, 285, 313], 25);
    const four = saved([218, 247, 277, 313], 9);
    expect(boxRouteOf('date', top, [null, null, null, null, four, top], SAME, DEADLINE)).toBe(top);
    const roomy = saved([218, 247, 277, 313], 26);
    expect(boxRouteOf('date', top, [null, null, null, null, roomy, top], SAME, DEADLINE)).toBe(roomy);
    const tightTop = saved([197, 218, 247, 285, 313], 20);
    expect(boxRouteOf('date', tightTop, [four, tightTop], SAME, DEADLINE)).toBe(four);
  });
});
