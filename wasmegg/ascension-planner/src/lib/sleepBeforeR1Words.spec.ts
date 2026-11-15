/** "You won't reach R1 before you sleep" (Jordan's option a, 15 Nov 2026; Words). The data is Reliability's `{ r1At, sleepAt, exact }`. */
import { describe, expect, it } from 'vitest';
import { sleepBeforeR1Card, sleepBeforeR1NextStep, sleepBeforeR1Tracker } from './sleepBeforeR1Words';

const at = (n: number) => (n === 1000 ? '1:10 AM' : n === 2000 ? '11:00 PM' : '?');
const exact = { r1At: 1000, sleepAt: 2000, exact: true };
const bound = { r1At: 1000, sleepAt: 2000, exact: false };

describe('sleepBeforeR1Words', () => {
  it('card (a route card or a timeline ascension)', () => {
    expect(sleepBeforeR1Card(exact, at)).toBe('Your silo buys (R1) come at 1:10 AM, after your hours end at 11:00 PM. Prestige in the morning, or re-plan.');
    expect(sleepBeforeR1Card(bound, at)).toBe('Your silo buys (R1) may come as late as 1:10 AM, after your hours end at 11:00 PM. Prestige in the morning, or re-plan.');
  });
  it('Next step ("if you prestige now")', () => {
    expect(sleepBeforeR1NextStep(exact, at)).toBe('If you prestige now, your silo buys (R1) come at 1:10 AM, after your hours end at 11:00 PM.');
    expect(sleepBeforeR1NextStep(bound, at)).toBe('If you prestige now, your silo buys (R1) may come as late as 1:10 AM, after your hours end at 11:00 PM.');
  });
  it('Build-up tracker (the ascension you are in)', () => {
    expect(sleepBeforeR1Tracker(exact, at)).toBe('Your silo buys (R1) come at 1:10 AM, after your hours end at 11:00 PM.');
    expect(sleepBeforeR1Tracker(bound, at)).toBe('Your silo buys (R1) may come as late as 1:10 AM, after your hours end at 11:00 PM.');
  });
  it('plain words: Press not Click, no "recalculate", no Your plan at the start, no player ID', () => {
    const all = [sleepBeforeR1Card(exact, at), sleepBeforeR1NextStep(bound, at), sleepBeforeR1Tracker(exact, at)].join(' ');
    expect(all).not.toMatch(/\b(click|tap)\b|recalculate|EI\d{16}/i);
    expect(all).not.toMatch(/^Your plan/m);
  });
});
