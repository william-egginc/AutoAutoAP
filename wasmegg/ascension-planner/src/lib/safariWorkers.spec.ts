/**
 * Safari's starting worker count for Chain Finder and By a date (proposal, 15 Nov 2026, Reliability). Two Safari
 * By a date runs on an 8-core Mac died about 90 s into visible running, both at 7 workers (13 Nov; 15 Nov 11:54 AM,
 * done=210, reloaded as back_forward). The 15 Nov carry-on at 5 workers ran 5 minutes, hidden twice, finished and
 * sent, and priced about 3.2 routes/s against 2.6 at 7 (rough: different rounds). Safari reports no heap, so memory
 * is a guess; the pattern is the worker count. Safari starts at most `threads - 3` (5 on 8 cores); other browsers
 * and the player's stored count are untouched. After a Safari crash the carry-on's lower count is the next start.
 */
import { describe, expect, it } from 'vitest';
import { safariStartWorkers } from './safariWorkers';

describe('Safari starting workers', () => {
  it('Safari on 8 cores starts at 5, however many the player chose', () => {
    expect(safariStartWorkers({ chosen: 7, threads: 8, safari: true })).toBe(5);
    expect(safariStartWorkers({ chosen: 8, threads: 8, safari: true })).toBe(5);
  });
  it('a lower choice is kept', () => {
    expect(safariStartWorkers({ chosen: 4, threads: 8, safari: true })).toBe(4);
  });
  it('other browsers are untouched', () => {
    expect(safariStartWorkers({ chosen: 7, threads: 8, safari: false })).toBe(7);
  });
  it('small machines keep at least one worker', () => {
    expect(safariStartWorkers({ chosen: 2, threads: 2, safari: true })).toBe(1);
    expect(safariStartWorkers({ chosen: 4, threads: 4, safari: true })).toBe(1);
  });
  it('after a Safari crash the carry-on count is the next start', () => {
    expect(safariStartWorkers({ chosen: 7, threads: 8, safari: true, lastCrashCarryOn: 4 })).toBe(4);
    // A carry-on count above the ceiling doesn't raise it.
    expect(safariStartWorkers({ chosen: 7, threads: 8, safari: true, lastCrashCarryOn: 6 })).toBe(5);
  });
});
