import { describe, expect, it } from 'vitest';
import {
  FOLLOW_THIS_ROUTE_INSTEAD, fasterAboveLine, QUICK_ESTIMATE_MARKER, WORK_IT_OUT_AGAIN, betterAboveLine, gearEffectLine, reachedLine,
  routeReachedLine, savedAnswerLabel, savedFromSentence,
} from './instantCardWords';

describe('the instant card words', () => {
  it('today\'s words, unchanged', () => {
    expect(savedFromSentence({ when: 'Nov 3 at 11:19 AM' })).toBe('Saved from Nov 3 at 11:19 AM: same save, setup and filters, so nothing was worked out again.');
    expect(savedFromSentence({ when: 'Nov 3 at 11:19 AM', planStart: 'Nov 3 at 12:19 PM' })).toBe(
      'Saved from Nov 3 at 11:19 AM: same save, setup and filters, so nothing was worked out again (its dates are for a plan start of Nov 3 at 12:19 PM).'
    );
    expect(WORK_IT_OUT_AGAIN).toBe('Work it out again');
    expect(reachedLine({ time: 'Nov 20 at 9:00 AM', count: 1 })).toBe('Reached Nov 20 at 9:00 AM · 1 ascension');
    expect(reachedLine({ time: 'Nov 20 at 9:00 AM', count: 3 })).toBe('Reached Nov 20 at 9:00 AM · 3 ascensions');
  });
  it('the clean-up words', () => {
    expect(savedAnswerLabel('Nov 3, 12:19 PM')).toBe('Saved answer, Nov 3, 12:19 PM');
    expect(QUICK_ESTIMATE_MARKER).toBe('quick estimate');
    expect(routeReachedLine({ chain: [198, 200, 202], time: 'Nov 20 at 9:00 AM' })).toBe('Route 198 → 200 → 202 · reached Nov 20 at 9:00 AM · 3 ascensions');
    expect(routeReachedLine({ chain: [203], time: 'Nov 20 at 9:00 AM' })).toBe('Reached Nov 20 at 9:00 AM');
    expect(gearEffectLine(5)).toBe('Up to about 5 days later than shown.');
    expect(FOLLOW_THIS_ROUTE_INSTEAD).toBe('Follow this route instead');
    expect(betterAboveLine({ better: { te: '203 TE', size: '46h 14m' }, yours: { te: '202 TE', size: '10h 46m' } })).toBe(
      'The answer above is better: 203 TE, 46h 14m to spare (yours: 202 TE, 10h 46m).'
    );
    expect(betterAboveLine({ better: { te: '203 TE', size: '1h' }, yours: { te: '202 TE', size: '3h', late: true } })).toBe(
      'The answer above is better: 203 TE, 1h to spare (yours: 202 TE, lands 3h after the date).'
    );
  });
  it('Fastest: a faster route, as times', () => {
    expect(fasterAboveLine({ better: 'Sep 16, 2028 at 9:00 AM', yours: 'Sep 24, 2028 at 9:00 AM' })).toBe(
      'The answer above is faster: Sep 16, 2028 at 9:00 AM (yours: Sep 24, 2028 at 9:00 AM).'
    );
  });
  it('no player-facing "collector", "table" or "Click"', () => {
    expect(JSON.stringify([savedFromSentence({ when: 'x' }), gearEffectLine(5)])).not.toMatch(/collector|table|click/i);
  });
});
