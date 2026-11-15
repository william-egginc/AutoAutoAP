import { describe, expect, it } from 'vitest';
import { deadlineRunCost } from './deadlineRunCost';

const base = { sessionSeconds: 600, suspendedSeconds: 0, priced: 300, replayed: 0, workers: 7, cores: 8 };

describe('deadlineRunCost', () => {
  it('the Fastest run shape: workers, cores, minutes, suspended minutes, seconds per chain', () => {
    expect(deadlineRunCost(base)).toEqual({ workers: 7, cores: 8, minutes: 10, suspendedMinutes: 0, secondsPerChain: 2 });
  });
  it('takes the suspended time off the minutes and the rate', () => {
    expect(deadlineRunCost({ ...base, suspendedSeconds: 300 })).toMatchObject({ minutes: 5, suspendedMinutes: 5, secondsPerChain: 1 });
  });
  it('a carry-on counts only the routes it priced here', () => {
    expect(deadlineRunCost({ ...base, priced: 400, replayed: 100 })).toMatchObject({ secondsPerChain: 2 });
  });
  it('none when nothing was priced here, or no time passed', () => {
    expect(deadlineRunCost({ ...base, priced: 100, replayed: 100 })).toBeNull();
    expect(deadlineRunCost({ ...base, sessionSeconds: 0 })).toBeNull();
    expect(deadlineRunCost({ ...base, workers: 0 })).toBeNull();
  });
  it('cores unknown stays null', () => {
    expect(deadlineRunCost({ ...base, cores: null })!.cores).toBeNull();
  });
});
