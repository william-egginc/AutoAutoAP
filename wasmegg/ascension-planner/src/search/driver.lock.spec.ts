/**
 * LOCKED STOPS IN THE SEARCH DRIVER (code review 22 Nov 2026, R2). With "Lock the first N" (`pin`):
 *   - R2.2: the Exact count probe inserts a stop midway between the last locked stop and the next one, not midway
 *     between the player's TE and the next one (the gap the probe asks about is the one after the lock).
 *   - R2.4: a lock above the route's stops never lets the search move a locked one (resolveLast moved the last).
 * The cost landscape is arithmetic, as driver.spec.ts's: a quadratic pull to a known route.
 */
import { describe, expect, it } from 'vitest';
import { clampPin, runChainSearch, type EvaluateBatch } from './driver';
import type { ChainResult } from './types';

const FINAL = 490;
const CURRENT_TE = 175;

function makeEvaluator(optimum: number[]): { evaluate: EvaluateBatch; priced: number[][] } {
  const priced: number[][] = [];
  const evaluate: EvaluateBatch = async chains => {
    priced.push(...chains.map(c => [...c]));
    const results: ChainResult[] = chains.map(chain => {
      let cost = 700 * 86400;
      for (let i = 0; i < chain.length - 1; i++) cost += (chain[i] - (optimum[i] ?? chain[i])) ** 2 * 600;
      return { chain: [...chain], seconds: cost, legs: [] };
    });
    return { results, legSims: chains.length, workersUsed: 1 };
  };
  return { evaluate, priced };
}

describe('the count probe after locked stops (R2.2)', () => {
  it('with the first stop locked, the stop it inserts after it is the midpoint of the first two', async () => {
    const route = [195, 219, 248, 286, 327, FINAL];
    const { evaluate, priced } = makeEvaluator(route.slice(0, -1));
    await runChainSearch({
      seedChain: route,
      final: FINAL,
      currentTE: CURRENT_TE,
      effort: 'normal',
      pin: 1,
      evaluateBatch: evaluate,
    });
    const longer = priced.filter(c => c.length === route.length + 1);
    expect(longer.length).toBeGreaterThan(0);
    // (195 + 219) / 2 = 207 after the locked 195; before the fix it was (175 + 219) / 2 = 197.
    expect(longer.some(c => c[0] === 195 && c[1] === 207)).toBe(true);
    // The locked stop never moves.
    expect(priced.every(c => c[0] === 195)).toBe(true);
  });
});

describe('a lock above the route (R2.4)', () => {
  it('locking more stops than the route has moves none of them, however hard the search looks', async () => {
    const route = [195, 219, 248, 286, 327, FINAL];
    // The best route is elsewhere, so a search free to move a stop would.
    const { evaluate, priced } = makeEvaluator([190, 225, 255, 280, 320]);
    const out = await runChainSearch({
      seedChain: route,
      final: FINAL,
      currentTE: CURRENT_TE,
      effort: 'normal',
      pin: 9,
      evaluateBatch: evaluate,
    });
    expect(out.chain.slice(0, 5)).toEqual(route.slice(0, 5));
    expect(priced.every(c => c.slice(0, 5).join() === route.slice(0, 5).join())).toBe(true);
  });

  it("clampPin: a whole number from 0, one stop of the route left free (the panel box's max)", () => {
    expect(clampPin(9, 6)).toBe(4);
    expect(clampPin(2.7, 6)).toBe(2);
    expect(clampPin(-1, 6)).toBe(0);
    expect(clampPin(Number.NaN, 6)).toBe(0);
    expect(clampPin(3, 1)).toBe(0);
  });
});
