import { describe, expect, it } from 'vitest';
import { maxedLetters, maxedWhatIfText, perfectSetGap, perfectSetWords } from './maxedWhatIf';
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
    expect(t).toBe('With maxed gear: 490 on day 88, 12.0 days sooner than with your gear.');
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
    expect(t).toBe('With maxed gear: 490 on day 88, 12.0 days sooner than with your gear (instant answer: day 100; exact on your account: day 102).');
    const same = maxedWhatIfText({ final: 490, mine: { end: 100 * 86400, te: 490 }, exact: { end: 100 * 86400 + 60, te: 490 }, maxed: { route: route(88 * 86400, 490), end: 88 * 86400, te: 490 }, show });
    expect(same).toBe('With maxed gear: 490 on day 88, 12.0 days sooner than with your gear.');
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

describe("perfectSetGap / perfectSetWords: what the imperfect gear costs, in time (My runs' gear block)", () => {
  const D = 86400;
  const w = { at: 1, end: 88 * D, te: 490, mineEnd: 100 * D, mineTE: 490 };
  it('Fastest: the finish-date gap', () => {
    const g = perfectSetGap(w, 'fastest');
    expect(g).toEqual({ te: 490, seconds: 12 * D });
    expect(perfectSetWords(g!)).toBe("With a perfect set you'd reach 490 TE about 12 days sooner (an estimate from the instant answer).");
    expect(perfectSetWords({ te: 490, seconds: 3.24 * D })).toBe("With a perfect set you'd reach 490 TE about 3.2 days sooner (an estimate from the instant answer).");
    expect(perfectSetWords({ te: 490, seconds: 5 * 3600 })).toBe("With a perfect set you'd reach 490 TE about 5 hours sooner (an estimate from the instant answer).");
    expect(perfectSetWords({ te: 490, seconds: 600 })).toBe("With a perfect set you'd reach 490 TE at about the same time (an estimate from the instant answer).");
    expect(perfectSetGap({ ...w, end: null }, 'fastest')).toBeNull();
    expect(perfectSetGap({ ...w, mineEnd: null }, 'fastest')).toBeNull();
  });
  it('By a date: the time to reach the SAME TE, never the TE gained', () => {
    const d = { at: 1, end: 299 * D, te: 252, mineEnd: 280 * D, mineTE: 248, sameEnd: 271.5 * D };
    const g = perfectSetGap(d, 'date');
    expect(g).toEqual({ te: 248, seconds: 8.5 * D });
    expect(perfectSetWords(g!)).toBe("With a perfect set you'd reach 248 TE about 8.5 days sooner (an estimate from the instant answer).");
    // A what-if kept before 25 Oct 2026 has no `sameEnd`: nothing (no placeholder); none reached: nothing.
    expect(perfectSetGap({ ...d, sameEnd: undefined }, 'date')).toBeNull();
    expect(perfectSetGap({ ...d, sameEnd: null }, 'date')).toBeNull();
    expect(perfectSetGap(null, 'date')).toBeNull();
  });
});

describe('MaxedWhatIf keeps the By a date same-TE time with its result', () => {
  it('a second pricing on the maxed table to the player own TE, no date, emitted as sameEnd', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '../components/auto/MaxedWhatIf.vue'), 'utf8');
    const second = src.slice(src.indexOf('if (props.deadline && props.mine.te > 0)'));
    expect(second).toMatch(/priceOnTable\(pool, props\.tableUrl, \{[\s\S]*final: props\.mine\.te,/);
    expect(second.slice(0, second.indexOf('sameEnd = same.end'))).not.toContain('deadline:');
    expect(src).toContain("...(sameEnd !== undefined ? { sameEnd } : {}),");
  });
});
