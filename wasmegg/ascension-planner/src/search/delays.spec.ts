import { describe, expect, it } from 'vitest';
import { hoursText, needleOf, needleText, searchWaits, waitSearchBound, type Waits } from './delays';
import type { ChainResult } from './types';

const H = 3600;
const CHAIN = [197, 222, 247, 313];

/** A made-up route whose end depends on the waits like the main's did: small gains next to cliffs. */
function routeSeconds(w: Waits): number | null {
  let s = 1000 * H;
  // After stop 1: waiting 5 h gains 3 h, 6 h or more falls off a cliff (+20 h); 1-4 h gain a little.
  if (w[0] >= 1 && w[0] <= 4) s -= w[0] * 0.5 * H;
  if (w[0] === 5) s -= 3 * H;
  if (w[0] >= 6) s += 20 * H;
  // After stop 2: alone, waiting loses 0.2 h an hour; but after a 5 h wait at stop 1, waiting 4 h
  // there gains 2 h (the second prestige then lands better): what greedy can't see.
  if (w[0] === 5 && w[1] === 4) s -= 2 * H;
  else s += w[1] * 0.2 * H;
  // After stop 3: nothing to gain; 10 h or more can't be priced.
  if (w[2] >= 10) return null;
  s += w[2] * 0.1 * H;
  return s;
}

function pricer() {
  const asked: string[] = [];
  const price = async (sets: Waits[]) =>
    sets.map(w => {
      asked.push(w.join(','));
      const seconds = routeSeconds(w);
      if (seconds == null) return null;
      // Each stop reached a day apart from the plan start; the legs carry their ends.
      const legs = CHAIN.map((_, i) => ({ endTime: 1_800_000_000 + (i + 1) * 86_400 }));
      return { chain: CHAIN, seconds, legs } as unknown as ChainResult;
    });
  return { asked, price };
}

describe('try waiting before each prestige', () => {
  it('finds each prestige’s best wait alone, its gain and the needle next to it', async () => {
    const { price } = pricer();
    const r = await searchWaits(CHAIN, price, { singlesOnly: true, maxHours: 12 });
    expect(r.baseSeconds).toBe(1000 * H);
    expect(r.singles.map(s => [s.prestige, s.stop, s.bestHours, s.gainSeconds / H])).toEqual([
      [1, 197, 5, 3],
      [2, 222, 0, 0],
      [3, 247, 0, 0],
    ]);
    // 6 h is the cliff next to the best 5 h: 23 h worse than it.
    expect(r.singles[0].needle).toEqual({ hours: 6, lossSeconds: 23 * H });
    expect(r.singles[0].reachedAt).toBe(1_800_000_000 + 86_400);
    // Unpriceable waits are left out, not counted as losses.
    expect(r.singles[2].curve[10]).toBeNull();
    expect(r.combined).toBeNull();
  });

  it('finds the waits that only pay together, which the single waits miss', async () => {
    const { price } = pricer();
    const r = await searchWaits(CHAIN, price, { maxHours: 12 });
    expect(r.combined!.waits).toEqual([5, 4, 0]);
    expect(r.combined!.gainSeconds).toBe(5 * H);
    expect(r.combined!.settled).toBe(true);
    // Moving the first wait to 6 h from there: the cliff, 1020.8 h against 995 h.
    expect(r.combined!.needles[0]!.hours).toBe(6);
    expect(r.combined!.needles[0]!.lossSeconds / H).toBeCloseTo(25.8, 6);
  });

  it('prices each set of waits once, within the bound it states', async () => {
    const { asked, price } = pricer();
    const o = { maxHours: 12, near: 3, passes: 2 };
    const r = await searchWaits(CHAIN, price, o);
    expect(new Set(asked).size).toBe(asked.length);
    expect(r.priced).toBe(asked.length);
    expect(r.priced).toBeLessThanOrEqual(waitSearchBound(CHAIN.length, o));
    expect(r.bound).toBe(waitSearchBound(CHAIN.length, o));
  });

  it('stops between batches when asked, keeping what it has', async () => {
    const { price } = pricer();
    let batches = 0;
    const r = await searchWaits(CHAIN, price, { maxHours: 6, shouldStop: () => batches++ > 0 });
    expect(r.stopped).toBe(true);
    expect(r.singles[0].bestHours).toBe(5);
  });

  it('leaves a one-stop route alone', async () => {
    const { asked, price } = pricer();
    const r = await searchWaits([313], price);
    expect(r.singles).toEqual([]);
    expect(asked).toEqual(['']);
  });

  it('words the needle for players', () => {
    expect(needleOf([10, 8, 30, null], 1, 2)).toEqual({ hours: 2, lossSeconds: 22 });
    expect(needleOf([10, 8, 9], 1, 2)).toEqual({ hours: 2, lossSeconds: 1 });
    // Waiting 0 (prestiging at once) is the gain itself, not a needle.
    expect(needleOf([10, 12], 1, 2)).toBeNull();
    expect(needleOf([10, 9, 12], 1, 2)).toEqual({ hours: 2, lossSeconds: 3 });
    expect(needleText({ hours: 7, lossSeconds: 40 * H }, 5)).toBe('needle-sharp: waiting 7 h (off by 2 h) costs 40 h');
    expect(needleText({ hours: 3, lossSeconds: 3.6 * H }, 2)).toBe('needle-sharp: waiting 3 h (off by 1 h) costs 3.6 h');
    expect(hoursText(28.14 * H)).toBe('28.1 h');
    expect(needleText({ hours: 3, lossSeconds: 0.2 * H }, 2)).toBeNull();
    expect(hoursText(25 * 60)).toBe('25 min');
  });
});

describe('the panel’s words', () => {
  it('says each prestige’s wait, the waits together and how sharp they are', async () => {
    const { waitLines } = await import('./delays');
    const { price } = pricer();
    const r = await searchWaits(CHAIN, price, { maxHours: 12 });
    const show = (t: number) => `T${t - 1_800_000_000}`;
    const lines = waitLines(r, show);
    expect(lines.singles[0]).toEqual({
      stop: 197,
      text: 'After 197 (reached T86400): wait 5 h, prestige T104400. Finishes 3 h sooner.',
      warn: 'Needle-sharp: waiting 6 h instead (1 h more) finishes 23 h later.',
      wait: true,
    });
    expect(lines.singles[1].text).toBe('After 222 (reached T172800): prestige at once. No wait helps.');
    expect(lines.together).toBe(
      'Together: wait 5 h after 197 (prestige T104400), 4 h after 222 (prestige T187200). Finishes 5 h sooner than prestiging at once.'
    );
    expect(lines.togetherWarns[0]).toBe('After 197: Needle-sharp: waiting 6 h instead (1 h more) finishes 25.8 h later.');
  });
});
