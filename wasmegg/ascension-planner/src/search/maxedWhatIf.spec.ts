import { describe, expect, it } from 'vitest';
import { maxedLetters, maxedWhatIfText } from './maxedWhatIf';
import type { Route } from './routeFinder';

const show = (t: number) => `day ${Math.round(t / 86400)}`;
const route = (end: number, te: number): Route => ({
  chain: [te],
  legs: [{ from: 200, to: te, endTE: te, start: 0, end, sales: 1, tier13: false, label: '1-sale' }],
  end,
  seconds: end,
});

describe('maxedWhatIfText', () => {
  it('Fastest: how many days sooner', () => {
    const t = maxedWhatIfText({ final: 490, mine: { end: 100 * 86400, te: 490 }, maxed: { route: route(88 * 86400, 490), end: 88 * 86400, te: 490 }, show });
    expect(t).toBe('With maxed gear: 490 on day 88, 12.0 d sooner than your gear.');
  });

  it('Fastest: about the same when within an hour or so', () => {
    const t = maxedWhatIfText({ final: 490, mine: { end: 100 * 86400, te: 490 }, maxed: { route: route(100 * 86400 - 600, 490), end: 100 * 86400 - 600, te: 490 }, show });
    expect(t).toContain('about the same as your gear');
  });

  it('By a date: the TE instead of the player’s', () => {
    const t = maxedWhatIfText({ deadline: 300 * 86400, final: 490, mine: { end: 1, te: 248 }, maxed: { route: route(299 * 86400, 252), end: 299 * 86400, te: 252 }, show });
    expect(t).toBe('With maxed gear: TE 252 by day 300 instead of 248.');
  });

  it('By a date: the same TE says so', () => {
    const t = maxedWhatIfText({ deadline: 300 * 86400, final: 490, mine: { end: 1, te: 248 }, maxed: { route: route(299 * 86400, 248), end: 299 * 86400, te: 248 }, show });
    expect(t).toContain('the same as your gear');
  });

  it('no route on the maxed table either', () => {
    expect(maxedWhatIfText({ final: 490, mine: { end: null, te: 0 }, maxed: { route: null, end: null, te: 0 }, show })).toContain('no route');
  });
});

describe('maxedWhatIfText beside Check exactly (18 Oct 2026: "instead of 248" under an exact 247)', () => {
  const maxed252 = { route: route(299 * 86400, 252), end: 299 * 86400, te: 252 };

  it('By a date: names both when the exact TE differs', () => {
    const t = maxedWhatIfText({ deadline: 300 * 86400, final: 490, mine: { end: 1, te: 248 }, exact: { end: 1, te: 247 }, maxed: maxed252, show });
    expect(t).toBe('With maxed gear: TE 252 by day 300 instead of 248 (instant answer; exact on your account: 247).');
  });

  it('By a date: as before when the exact TE is the same or not known yet', () => {
    const same = maxedWhatIfText({ deadline: 300 * 86400, final: 490, mine: { end: 1, te: 248 }, exact: { end: 1, te: 248 }, maxed: maxed252, show });
    const none = maxedWhatIfText({ deadline: 300 * 86400, final: 490, mine: { end: 1, te: 248 }, exact: null, maxed: maxed252, show });
    expect(same).toBe('With maxed gear: TE 252 by day 300 instead of 248.');
    expect(none).toBe(same);
  });

  it('By a date: the same TE on maxed gear still says what exact found', () => {
    const t = maxedWhatIfText({ deadline: 300 * 86400, final: 490, mine: { end: 1, te: 248 }, exact: { end: 1, te: 247 }, maxed: { route: route(299 * 86400, 248), end: 299 * 86400, te: 248 }, show });
    expect(t).toBe('With maxed gear: TE 248 by day 300, the same as your gear (instant answer; exact on your account: 247).');
  });

  it('Fastest: dates, the instant answer\'s and the exact one, when they differ', () => {
    const t = maxedWhatIfText({ final: 490, mine: { end: 100 * 86400, te: 490 }, exact: { end: 102 * 86400, te: 490 }, maxed: { route: route(88 * 86400, 490), end: 88 * 86400, te: 490 }, show });
    expect(t).toBe('With maxed gear: 490 on day 88, 12.0 d sooner than your gear (instant answer: day 100; exact on your account: day 102).');
    const same = maxedWhatIfText({ final: 490, mine: { end: 100 * 86400, te: 490 }, exact: { end: 100 * 86400 + 60, te: 490 }, maxed: { route: route(88 * 86400, 490), end: 88 * 86400, te: 490 }, show });
    expect(same).toBe('With maxed gear: 490 on day 88, 12.0 d sooner than your gear.');
  });
});

describe('maxedLetters', () => {
  it('drops the "maxed reference" tail', () => {
    expect(maxedLetters('Delivery LLLL · Earnings LLLL · 1T4Q 10T4T 12T4L · bonus 128.7 · maxed reference')).toBe(
      'Delivery LLLL · Earnings LLLL · 1T4Q 10T4T 12T4L · bonus 128.7'
    );
    expect(maxedLetters(undefined)).toBe('');
  });
});
