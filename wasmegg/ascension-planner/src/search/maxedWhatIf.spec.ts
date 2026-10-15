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

describe('maxedLetters', () => {
  it('drops the "maxed reference" tail', () => {
    expect(maxedLetters('Delivery LLLL · Earnings LLLL · 1T4Q 10T4T 12T4L · bonus 128.7 · maxed reference')).toBe(
      'Delivery LLLL · Earnings LLLL · 1T4Q 10T4T 12T4L · bonus 128.7'
    );
    expect(maxedLetters(undefined)).toBe('');
  });
});
