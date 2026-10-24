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

describe('when a wait is suggested', () => {
  it('needs a gain over half an hour and a 2 h slip costing under three times it', async () => {
    const { waitVerdict } = await import('./delays');
    expect(waitVerdict(0.5 * H, null)).toBe('tooSmall');
    expect(waitVerdict(0.6 * H, null)).toBe('wait');
    expect(waitVerdict(2 * H, { hours: 3, lossSeconds: 5.9 * H })).toBe('wait');
    expect(waitVerdict(2 * H, { hours: 3, lossSeconds: 6 * H })).toBe('tooRisky');
    // The main's save on his hours (19 Oct): 1 h after 197 gained 44 min, 3 h cost 92 h.
    expect(waitVerdict(44 * 60, { hours: 3, lossSeconds: 92 * H })).toBe('tooRisky');
  });

  it('looks 2 h either side, whatever the needle window', async () => {
    const { price } = pricer();
    const r = await searchWaits(CHAIN, price, { maxHours: 12, near: 0 });
    // 6 h is 1 h past the best 5 h: the risk still sees it with no needle window.
    expect(r.singles[0].needle).toBeNull();
    expect(r.singles[0].risk).toEqual({ hours: 6, lossSeconds: 23 * H });
    expect(r.combined!.risks[0]!.hours).toBe(6);
  });
});

describe('the panel’s words', () => {
  const show = (t: number) => `T${t - 1_800_000_000}`;

  it('says prestige as soon as you reach it when the best wait is too sharp', async () => {
    const { waitLines } = await import('./delays');
    const { price } = pricer();
    const r = await searchWaits(CHAIN, price, { maxHours: 12 });
    const lines = waitLines(r, show);
    expect(lines.singles[0]).toEqual({
      stop: 197,
      text: 'After 197 (reached T86400): prestige as soon as you reach it. (Waiting 5 h gains 3 h, but 1 h later costs 23 h.)',
      warn: null,
      wait: false,
    });
    expect(lines.singles[1].text).toBe('After 222 (reached T172800): prestige as soon as you reach it. No wait helps.');
    expect(lines.together).toBe(
      'Together: prestige as soon as you reach each stop. (The best waits together gain 5 h, but after 197, 1 h later costs 25.8 h.)'
    );
    expect(lines.togetherWarns).toEqual([]);
  });

  it('gives a wait that passes as a clock time, with the slip warning', async () => {
    const { waitLines } = await import('./delays');
    const reachedAt = 1_800_000_000 + 86_400;
    const r = {
      chain: [197, 313],
      baseSeconds: 1000 * H,
      singles: [
        {
          prestige: 1, stop: 197, reachedAt, bestHours: 2, gainSeconds: 2 * H,
          needle: { hours: 4, lossSeconds: 5 * H }, risk: { hours: 4, lossSeconds: 5 * H }, curve: [],
        },
      ],
      combined: {
        waits: [2], seconds: 998 * H, gainSeconds: 2 * H,
        needles: [{ hours: 4, lossSeconds: 5 * H }], risks: [{ hours: 4, lossSeconds: 5 * H }],
        reachedAt: [reachedAt, null], passes: 1, settled: true,
      },
      priced: 0, bound: 0, stopped: false,
    };
    const lines = waitLines(r, show);
    expect(lines.singles[0]).toEqual({
      stop: 197,
      text: 'After 197 (reached T86400): prestige at T93600 (wait 2 h). Finishes 2 h sooner.',
      warn: 'Needle-sharp: 2 h later costs 5 h.',
      wait: true,
    });
    expect(lines.together).toBe('Together: after 197, prestige at T93600 (wait 2 h). Finishes 2 h sooner than prestiging at once.');
    expect(lines.togetherWarns).toEqual(['After 197: Needle-sharp: 2 h later costs 5 h.']);
  });

  it('says a gain under half an hour is too small', async () => {
    const { waitLines } = await import('./delays');
    const r = {
      chain: [197, 313], baseSeconds: 1000 * H, combined: null, priced: 0, bound: 0, stopped: false,
      singles: [{ prestige: 1, stop: 197, reachedAt: null, bestHours: 1, gainSeconds: 20 * 60, needle: null, risk: null, curve: [] }],
    };
    expect(waitLines(r, show).singles[0].text).toBe('After 197: prestige as soon as you reach it. (Waiting 1 h gains only 20 min.)');
  });
});
