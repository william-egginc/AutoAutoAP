/** The run bar's Details (lib/runDetails.ts): what the in-page progress said beyond the bar's own line. */
import { describe, expect, it } from 'vitest';
import { runDetailLine } from './runDetails';

describe('runDetailLine', () => {
  it("Nearby routes: the run's detail, routes from the earlier run, the measured speed, the upper bound", () => {
    expect(runDetailLine({ kind: 'smart', detail: '1,204 / 2,200', replayed: 296, secondsPerRoute: 1.234 })).toBe(
      '1,204 / 2,200 · 296 routes from the earlier run · 1.2 s/route measured here · the estimate is an upper bound: it stops when nothing moves'
    );
    // Before the first batch: no speed yet.
    expect(runDetailLine({ kind: 'smart', secondsPerRoute: 0 })).toBe(
      'the estimate is an upper bound: it stops when nothing moves'
    );
  });

  it('Exhaustive: the seconds a route, measured here', () => {
    expect(runDetailLine({ kind: 'full', secondsPerRoute: 0.456 })).toBe('0.46 s/route measured here');
    expect(runDetailLine({ kind: 'full' })).toBe('');
  });

  it('By a date: time so far, first guess, over the estimate, its basis, legs simulated', () => {
    expect(
      runDetailLine({
        kind: 'by-date',
        elapsed: '9 min',
        firstGuess: '11 min for 7 workers, 4 now',
        done: 1300,
        estimated: 1200,
        estimateNote: 'estimated from the first 40 sets',
        legs: 5210,
      })
    ).toBe(
      '9 min so far · first guess 11 min for 7 workers, 4 now · more than the ~1,200 routes estimated · estimated from the first 40 sets · 5,210 legs simulated'
    );
    expect(runDetailLine({ kind: 'by-date', elapsed: '1 min', done: 10, estimated: 1200, legs: 1 })).toBe(
      '1 min so far · 1 leg simulated'
    );
  });

  it('a start-time sweep has nothing more to say', () => {
    expect(runDetailLine({ kind: 'start-times' })).toBe('');
  });
});
