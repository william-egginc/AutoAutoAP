/** "Prefer fewer ascensions if within X of the best" (Q6, Wolfcry1993): the choice, the words and the setting. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  choosePreferFewer,
  laterWords,
  marginWords,
  preferFewerCopy,
  PREFER_KEY,
  PREFER_OFF,
  readPreferFewer,
  shiftCount,
  writePreferFewer,
  type PreferMargin,
  type PreferRow,
} from './preferFewer';

const H = 3600;
const D = 86400;
const T = 1_866_000_000;
const show = (unix: number) => (unix === T ? 'Feb 18, 2029, 3:00 PM' : `t+${unix - T}`);
const within = (seconds: number): PreferMargin => ({ kind: 'time', seconds });
const te = (n: number): PreferMargin => ({ kind: 'te', te: n });

/** Fastest rows: the best (5 ascensions), and others behind it. */
function fast(ascensions: number, behind: number, shifts: number | null = null, name = `${ascensions}`): PreferRow<string> {
  return { item: name, ascensions, finish: T + behind, shifts };
}
const best5 = fast(5, 0, 60);
const four = fast(4, 0.5 * D, 47);
const three = fast(3, 3 * D, 35);
const six = fast(6, 0.1 * D, 70);
const FAST = [best5, four, three, six];

/** By a date rows: the best is 313 TE with 5 ascensions. */
function date(ascensions: number, endTE: number, spare: number, shifts: number | null = null, name = `${ascensions}@${endTE}`) {
  return { item: name, ascensions, finish: T - spare, endTE, spare, shifts } as PreferRow<string>;
}
const top5 = date(5, 313, 1 * D, 60);

describe('choosePreferFewer: Fastest (margin in time)', () => {
  it('Off: the best, nothing else', () => {
    const c = choosePreferFewer('fastest', FAST, PREFER_OFF, best5)!;
    expect(c.state).toBe('off');
    expect(c.chosen).toBe(best5);
  });

  it('within 1 day: the 4-ascension route half a day behind; cost and saving', () => {
    const c = choosePreferFewer('fastest', FAST, within(D), best5)!;
    expect(c.state).toBe('fewer');
    expect(c.chosen).toBe(four);
    expect(c.costSeconds).toBe(0.5 * D);
    expect(c.ascensionsFewer).toBe(1);
    expect(c.prestigesFewer).toBe(1);
    expect(c.shiftsFewer).toBe(13);
  });

  it('within 12 h includes a route exactly 12 h behind; within 2 days still the 4 (the 3 is 3 days behind)', () => {
    expect(choosePreferFewer('fastest', FAST, within(12 * H), best5)!.chosen).toBe(four);
    expect(choosePreferFewer('fastest', FAST, within(2 * D), best5)!.chosen).toBe(four);
  });

  it('custom 3 days: the fewest ascensions inside it wins (3), not the nearest', () => {
    const c = choosePreferFewer('fastest', FAST, within(3 * D), best5)!;
    expect(c.chosen).toBe(three);
    expect(c.ascensionsFewer).toBe(2);
    expect(c.shiftsFewer).toBe(25);
  });

  it('nothing with fewer ascensions inside the margin: the best stays, state none', () => {
    const c = choosePreferFewer('fastest', FAST, within(6 * H), best5)!;
    expect(c.state).toBe('none');
    expect(c.chosen).toBe(best5);
  });

  it('a route with MORE ascensions inside the margin is never chosen', () => {
    expect(choosePreferFewer('fastest', [best5, six], within(D), best5)!.state).toBe('only');
  });

  it('ties on the count go to the faster', () => {
    const slow4 = fast(4, 0.8 * D, 40, 'slow4');
    expect(choosePreferFewer('fastest', [best5, slow4, four], within(D), best5)!.chosen).toBe(four);
    expect(choosePreferFewer('fastest', [best5, four, slow4], within(D), best5)!.chosen).toBe(four);
  });

  it('the best already has the fewest ascensions: state only', () => {
    expect(choosePreferFewer('fastest', [three, best5], within(5 * D), three)!.state).toBe('only');
  });

  it('without a given best, the fastest of the rows is the best (ties: fewer ascensions)', () => {
    const tie4 = fast(4, 0, 50, 'tie4');
    expect(choosePreferFewer('fastest', FAST, PREFER_OFF)!.best).toBe(best5);
    expect(choosePreferFewer('fastest', [best5, tie4], PREFER_OFF)!.best).toBe(tie4);
    expect(choosePreferFewer('fastest', [], within(D))).toBeNull();
  });

  it('shifts not known for either route: no shift saving claimed', () => {
    const blind = fast(4, 0.5 * D, null);
    expect(choosePreferFewer('fastest', [best5, blind], within(D), best5)!.shiftsFewer).toBeNull();
    const blindBest = fast(5, 0, null);
    expect(choosePreferFewer('fastest', [blindBest, four], within(D), blindBest)!.shiftsFewer).toBeNull();
    // More shifts on the shorter route: nothing said about shifts either.
    const busy = fast(4, 0.5 * D, 70);
    expect(choosePreferFewer('fastest', [best5, busy], within(D), best5)!.shiftsFewer).toBeNull();
  });
});

describe('choosePreferFewer: By a date (margin in TE)', () => {
  it('same TE: the fewest ascensions that reach the best TE', () => {
    const same4 = date(4, 313, 0.2 * D, 47);
    const c = choosePreferFewer('date', [top5, date(4, 312, 1.5 * D), same4], te(0), top5)!;
    expect(c.chosen).toBe(same4);
    expect(c.costTE).toBe(0);
    expect(c.shiftsFewer).toBe(13);
  });

  it('within 1 TE: one TE lower with fewer ascensions', () => {
    const low4 = date(4, 312, 1.5 * D, 47);
    const c = choosePreferFewer('date', [top5, low4], te(1), top5)!;
    expect(c.chosen).toBe(low4);
    expect(c.costTE).toBe(1);
  });

  it('ties on the count: the higher TE, then the more spare', () => {
    const a = date(4, 312, 2 * D, null, 'a');
    const b = date(4, 313, 0.5 * D, null, 'b');
    const c = date(4, 313, 0.9 * D, null, 'c');
    expect(choosePreferFewer('date', [top5, a, b, c], te(2), top5)!.chosen).toBe(c);
  });

  it('within 2 TE leaves out a route 3 TE lower; custom 3 TE takes it', () => {
    const three310 = date(3, 310, 2 * D);
    expect(choosePreferFewer('date', [top5, three310], te(2), top5)!.state).toBe('none');
    const c = choosePreferFewer('date', [top5, three310], te(3), top5)!;
    expect(c.chosen).toBe(three310);
    expect(c.ascensionsFewer).toBe(2);
  });

  it('a route with no spare (or past the date) is not offered', () => {
    expect(choosePreferFewer('date', [top5, date(4, 313, 0)], te(0), top5)!.state).toBe('none');
    expect(choosePreferFewer('date', [top5, date(4, 313, -60)], te(1), top5)!.state).toBe('none');
  });

  it('without a given best: highest TE, then most spare', () => {
    const more = date(5, 313, 2 * D, null, 'more');
    expect(choosePreferFewer('date', [top5, more, date(3, 311, 3 * D)], PREFER_OFF)!.best).toBe(more);
  });

  it('a time margin means nothing on By a date', () => {
    expect(choosePreferFewer('date', [top5, date(4, 313, D)], within(D), top5)!.state).toBe('none');
  });
});

describe('preferFewerCopy', () => {
  it('Fastest: cost first, then ascensions, shifts and prestiges', () => {
    const c = choosePreferFewer('fastest', FAST, within(D), best5);
    expect(preferFewerCopy(c, 'fastest', within(D), show)).toEqual({
      chip: 'Fewest ascensions within 1 day',
      line: 'Half a day slower than the fastest (Feb 18, 2029, 3:00 PM), and 1 fewer ascension: 13 fewer shifts, 1 fewer prestige.',
      muted: '',
    });
    const c3 = choosePreferFewer('fastest', FAST, within(3 * D), best5);
    expect(preferFewerCopy(c3, 'fastest', within(3 * D), show).line).toBe(
      '3 days slower than the fastest (Feb 18, 2029, 3:00 PM), and 2 fewer ascensions: 25 fewer shifts, 2 fewer prestiges.'
    );
  });

  it('Fastest without shifts (the instant answer before Check exactly): prestiges only', () => {
    const blind = fast(4, 3 * H, null);
    const c = choosePreferFewer('fastest', [fast(5, 0, null), blind], within(12 * H));
    expect(preferFewerCopy(c, 'fastest', within(12 * H), show)).toEqual({
      chip: 'Fewest ascensions within 12 h',
      line: '~3 h slower than the fastest (Feb 18, 2029, 3:00 PM), and 1 fewer ascension: 1 fewer prestige.',
      muted: '',
    });
  });

  it('Fastest at the same finish', () => {
    const c = choosePreferFewer('fastest', [best5, fast(4, 0, null)], within(D), best5);
    expect(preferFewerCopy(c, 'fastest', within(D), show).line).toBe(
      'Same finish as the fastest (Feb 18, 2029, 3:00 PM), with 1 fewer ascension: 1 fewer prestige.'
    );
  });

  it('By a date: TE below the highest, with its ascensions; same TE', () => {
    const low = choosePreferFewer('date', [top5, date(4, 312, 1.5 * D, 47)], te(1), top5);
    expect(preferFewerCopy(low, 'date', te(1), show)).toEqual({
      chip: 'Fewest ascensions within 1 TE',
      line: '1 TE below the highest (313, 5 ascensions), and 1 fewer ascension: 13 fewer shifts.',
      muted: '',
    });
    const same = choosePreferFewer('date', [top5, date(4, 313, 0.5 * D, 47)], te(0), top5);
    expect(preferFewerCopy(same, 'date', te(0), show)).toEqual({
      chip: 'Fewest ascensions, same TE',
      line: 'Same TE as the highest (313), with 1 fewer ascension: 13 fewer shifts.',
      muted: '',
    });
    const blind = choosePreferFewer('date', [top5, date(3, 311, D)], te(2), top5);
    expect(preferFewerCopy(blind, 'date', te(2), show).line).toBe(
      '2 TE below the highest (313, 5 ascensions), and 2 fewer ascensions.'
    );
  });

  it('nothing inside the margin: the muted line', () => {
    const c = choosePreferFewer('fastest', FAST, within(6 * H), best5);
    expect(preferFewerCopy(c, 'fastest', within(6 * H), show)).toEqual({
      chip: '',
      line: '',
      muted: 'No route with fewer ascensions is within 6 h.',
    });
    const d = choosePreferFewer('date', [top5, date(4, 312, D)], te(0), top5);
    expect(preferFewerCopy(d, 'date', te(0), show).muted).toBe('No route with fewer ascensions reaches the same TE.');
    const d2 = choosePreferFewer('date', [top5, date(3, 310, D)], te(2), top5);
    expect(preferFewerCopy(d2, 'date', te(2), show).muted).toBe('No route with fewer ascensions is within 2 TE.');
  });

  it('off, or the best already has the fewest: nothing', () => {
    const empty = { chip: '', line: '', muted: '' };
    expect(preferFewerCopy(choosePreferFewer('fastest', FAST, PREFER_OFF, best5), 'fastest', PREFER_OFF, show)).toEqual(empty);
    expect(preferFewerCopy(choosePreferFewer('fastest', [three, best5], within(D), three), 'fastest', within(D), show)).toEqual(empty);
    expect(preferFewerCopy(null, 'fastest', within(D), show)).toEqual(empty);
  });
});

describe('words', () => {
  it('how much later', () => {
    expect(laterWords(20 * 60)).toBe('under an hour');
    expect(laterWords(H)).toBe('~1 h');
    expect(laterWords(3.2 * H)).toBe('~3 h');
    expect(laterWords(12 * H)).toBe('half a day');
    expect(laterWords(18 * H)).toBe('~18 h');
    expect(laterWords(D)).toBe('about a day');
    expect(laterWords(1.5 * D)).toBe('1.5 days');
    expect(laterWords(2.1 * D)).toBe('2 days');
  });

  it('margins', () => {
    expect(marginWords(PREFER_OFF)).toBe('');
    expect(marginWords(within(12 * H))).toBe('12 h');
    expect(marginWords(within(D))).toBe('1 day');
    expect(marginWords(within(2 * D))).toBe('2 days');
    expect(marginWords(within(1.5 * D))).toBe('1.5 days');
    expect(marginWords(within(30 * H))).toBe('30 h');
    expect(marginWords(within(30 * 60))).toBe('30 min');
    expect(marginWords(te(0))).toBe('same TE');
    expect(marginWords(te(1))).toBe('1 TE');
  });
});

describe('shiftCount', () => {
  const leg = (n: number) => ({ shifts: Array.from({ length: n }, () => ({}) as never) });
  it('adds each leg’s recorded shifts', () => {
    expect(shiftCount([leg(12), leg(11), leg(12)], 3)).toBe(35);
    expect(shiftCount([leg(0)], 1)).toBe(0);
  });
  it('null when the legs do not cover the route or a leg kept no shifts (never a guess)', () => {
    expect(shiftCount(null, 2)).toBeNull();
    expect(shiftCount([], 1)).toBeNull();
    expect(shiftCount([leg(12)], 2)).toBeNull();
    expect(shiftCount([leg(12), {}], 2)).toBeNull();
  });
});

describe('the setting, per browser', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('starts Off for both screens without storage, and survives a blocked one', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(readPreferFewer()).toEqual({ fastest: PREFER_OFF, date: PREFER_OFF });
    expect(() => writePreferFewer({ fastest: within(D), date: te(1) })).not.toThrow();
  });

  it('comes back as written under its own key, separately per screen; bad values are Off', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    expect(readPreferFewer()).toEqual({ fastest: PREFER_OFF, date: PREFER_OFF });
    writePreferFewer({ fastest: within(D), date: te(0) });
    expect(PREFER_KEY).toBe('aap-prefer-fewer');
    expect(store.has('aap-prefer-fewer')).toBe(true);
    expect(readPreferFewer()).toEqual({ fastest: within(D), date: te(0) });
    store.set(PREFER_KEY, '{"fastest":{"kind":"te","te":1},"date":{"kind":"te","te":-2}}');
    expect(readPreferFewer()).toEqual({ fastest: PREFER_OFF, date: PREFER_OFF });
    store.set(PREFER_KEY, 'not json');
    expect(readPreferFewer()).toEqual({ fastest: PREFER_OFF, date: PREFER_OFF });
  });
});
