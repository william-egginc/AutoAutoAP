/** "You won't reach R1 before you sleep" (Jordan's option a, 15 Nov 2026; Words). The data is Reliability's `{ r1At, doneBy, sleepAt, exact }`. */
import { describe, expect, it } from 'vitest';
import { boost2xLine, sleepBeforeR1Card, sleepBeforeR1NextStep, sleepBeforeR1Tracker } from './sleepBeforeR1Words';

const T: Record<number, string> = { 1: '10:40 PM', 2: '11:20 PM', 3: '11:00 PM', 4: '1:10 AM' };
const fmt = (n: number) => T[n] ?? '?';
// R1 starts before bedtime but its buys finish after it.
const spans = { r1At: 1, doneBy: 2, sleepAt: 3, exact: true };
// R1 itself is after bedtime.
const late = { r1At: 4, doneBy: 4, sleepAt: 3, exact: true };
// An upper bound only.
const bound = { r1At: 4, doneBy: 4, sleepAt: 3, exact: false };

const held = { r1At: 4, doneBy: 4, sleepAt: 3, exact: false, held: true as const, waitsUntil: 2 };

describe('sleepBeforeR1Words', () => {
  it('held shifts: R1 waits for the hours to start, no hedge, no "prestige in the morning"', () => {
    expect(sleepBeforeR1Card(held, fmt)).toBe('Your silo buys (R1) wait until 11:20 PM, so your farm has 1 silo overnight.');
    expect(sleepBeforeR1NextStep(held, fmt)).toBe('If you prestige now, your silo buys (R1) wait until 11:20 PM, so your farm has 1 silo overnight.');
    expect(sleepBeforeR1Tracker(held, fmt)).toBe('Your silo buys (R1) wait until 11:20 PM, so your farm has 1 silo overnight.');
  });
  it('2x line: ahead, and on now', () => {
    expect(boost2xLine({ start: 1, end: 4, active: false }, fmt)).toBe(
      '2x earnings run from 10:40 PM to 1:10 AM. Time away is paid at the rate when you check in, so check in between those times.'
    );
    expect(boost2xLine({ start: 1, end: 4, active: true }, fmt)).toBe(
      '2x earnings are on until 1:10 AM. Time away is paid at the rate when you check in, so collect before then.'
    );
  });
  it('card: R1 starts before bedtime but is not done by it', () => {
    expect(sleepBeforeR1Card(spans, fmt)).toBe(
      'Your silo buys (R1) start at 10:40 PM and run until about 11:20 PM, after your hours end at 11:00 PM. Prestige in the morning, or re-plan.'
    );
  });
  it('card: R1 starts after bedtime; an upper bound says "may come as late as"', () => {
    expect(sleepBeforeR1Card(late, fmt)).toBe('Your silo buys (R1) start at 1:10 AM, after your hours end at 11:00 PM. Prestige in the morning, or re-plan.');
    expect(sleepBeforeR1Card(bound, fmt)).toBe(
      'Your silo buys (R1) may come as late as 1:10 AM, after your hours end at 11:00 PM. Prestige in the morning, or re-plan.'
    );
  });
  it('Next step ("if you prestige now") and the tracker use the same clause', () => {
    expect(sleepBeforeR1NextStep(spans, fmt)).toBe('If you prestige now, your silo buys (R1) start at 10:40 PM and run until about 11:20 PM, after your hours end at 11:00 PM.');
    expect(sleepBeforeR1Tracker(spans, fmt)).toBe('Your silo buys (R1) start at 10:40 PM and run until about 11:20 PM, after your hours end at 11:00 PM.');
    expect(sleepBeforeR1Tracker(bound, fmt)).toBe('Your silo buys (R1) may come as late as 1:10 AM, after your hours end at 11:00 PM.');
  });
  it('plain words: no Click or Tap, no "recalculate", no Your plan at the start, no player ID', () => {
    const all = [sleepBeforeR1Card(spans, fmt), sleepBeforeR1NextStep(bound, fmt), sleepBeforeR1Tracker(late, fmt)].join(' ');
    expect(all).not.toMatch(/\b(click|tap)\b|recalculate|EI\d{16}/i);
    expect(all).not.toMatch(/^Your plan/m);
  });
});
