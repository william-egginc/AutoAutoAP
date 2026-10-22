/** Which pick the green box shows while Check exactly runs (lib/boxPick.ts; Jordan, 22 Oct 2026). */
import { describe, expect, it } from 'vitest';
import { boxPick, checkingWhy, countsDone } from './boxPick';

describe('boxPick', () => {
  it('running with some counts finished keeps the instant pick, saying how far the check is', () => {
    expect(boxPick({ status: 'running', begun: true, counts: 5, finished: 2 })).toEqual({
      shows: 'instant',
      marker: 'instant answer, checking on your account… (2 of 5 counts done)',
    });
  });

  it('running with every count finished still keeps it (the nearby routes and runner-ups may still be going)', () => {
    expect(boxPick({ status: 'running', begun: true, counts: 5, finished: 5 }).shows).toBe('instant');
    expect(boxPick({ status: 'running', begun: true, counts: 0, finished: 0 }).marker).toContain(
      '(0 of 0 counts done)'
    );
  });

  it('all finished switches to the exact pick, in the box’s own wording', () => {
    expect(boxPick({ status: 'done', begun: true, counts: 5, finished: 5 })).toEqual({ shows: 'exact', marker: '' });
    expect(boxPick({ status: 'done', begun: false, counts: 5, finished: 5 })).toEqual({ shows: 'exact', marker: '' });
  });

  it('stopped or failed: the exact picks so far, or the instant pick marked when no count finished', () => {
    for (const status of ['idle', 'error'] as const) {
      expect(boxPick({ status, begun: true, counts: 5, finished: 3 })).toEqual({ shows: 'exact', marker: '' });
      expect(boxPick({ status, begun: true, counts: 5, finished: 0 })).toEqual({
        shows: 'instant',
        marker: 'instant answer',
      });
    }
  });

  it('paused for a search: keeps the instant pick (the check starts again when the search ends)', () => {
    expect(boxPick({ status: 'waiting', begun: true, counts: 5, finished: 2 })).toEqual({
      shows: 'instant',
      marker: 'instant answer, checked on your account when your search ends',
    });
  });

  it('none started: unchanged (the box shows whatever is there, no marker)', () => {
    for (const status of ['idle', 'waiting', 'error', 'done'] as const)
      expect(boxPick({ status, begun: false, counts: 5, finished: 0 })).toEqual({ shows: 'exact', marker: '' });
  });

  it('counts its counts in player words', () => {
    expect(countsDone(0, 1)).toBe('(0 of 1 count done)');
    expect(countsDone(3, 4)).toBe('(3 of 4 counts done)');
    expect(countsDone(6, 5)).toBe('(6 of 6 counts done)');
  });
});

describe('checkingWhy', () => {
  it('with hours set: why each route is priced on them; By a date also says how a miss is handled', () => {
    expect(checkingWhy('date', true)).toBe(
      'Your playing hours move egg shifts and prestiges, so each route is being priced on your hours. Routes that miss the date are lowered or swapped for a nearby one. The answer above updates once, when every count is done.'
    );
    expect(checkingWhy('fastest', true)).toBe(
      'Your playing hours move egg shifts and prestiges, so each route is being priced on your hours. The answer above updates once, when every count is done.'
    );
  });
  it('without hours: the plain line', () => {
    expect(checkingWhy('date', false)).toBe('Pricing each route with the full simulator on your save…');
    expect(checkingWhy('fastest', false)).toBe('Pricing each route with the full simulator on your save…');
  });
});
