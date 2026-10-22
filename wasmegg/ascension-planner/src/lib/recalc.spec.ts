import { describe, expect, it } from 'vitest';
import { askGoal, exactAskStep, needsFreshSave, recalcWords } from './recalc';
import { instantGoal } from '@/search/instantSnapshot';

const NOW = Date.UTC(2026, 9, 15, 20, 40) / 1000;
const H = 3600;
const base = {
  ask: { goal: 'target 490', n: 1 },
  goal: 'target 490',
  searchRunning: false,
  status: 'done' as const,
  backgroundStatus: 'done' as const,
  exactStatus: 'done' as const,
  hasResult: true,
};

describe('Recalculate', () => {
  it("the goal's words are the instant answer's own", () => {
    expect(askGoal({ goal: 'fastest', target: 490, deadline: null })).toBe(instantGoal(null, 490));
    expect(askGoal({ goal: 'date', target: 313, deadline: 1815753600 })).toBe(instantGoal(1815753600, 313));
  });

  it('the line under the button says what it does', () => {
    expect(recalcWords({ auto: 'fastest', depth: 'smart', target: 490 })).toBe(
      'Opens Fastest to 490 TE with your save and runs Check exactly'
    );
    expect(recalcWords({ auto: 'by-date', byDate: { eggDay: true } })).toBe(
      'Opens Highest TE by a date with your save and runs Check exactly'
    );
  });

  it('a save 6 hours old or more is loaded fresh first', () => {
    expect(needsFreshSave(NOW - 5.9 * H, NOW)).toBe(false);
    expect(needsFreshSave(NOW - 6 * H, NOW)).toBe(true);
    expect(needsFreshSave(null, NOW)).toBe(true);
  });
});

describe('exactAskStep: InstantRoute answers the ask', () => {
  it('runs Check exactly once the answer is in, for its own goal only', () => {
    expect(exactAskStep(base)).toBe('run');
    expect(exactAskStep({ ...base, exactStatus: 'idle' })).toBe('run');
    expect(exactAskStep({ ...base, goal: 'date 1815753600' })).toBe('none');
    expect(exactAskStep({ ...base, ask: null })).toBe('none');
  });

  it('never under a running search: the ask is dropped', () => {
    expect(exactAskStep({ ...base, searchRunning: true })).toBe('drop');
    expect(exactAskStep({ ...base, searchRunning: true, status: 'loading' })).toBe('drop');
    expect(exactAskStep({ ...base, status: 'error' })).toBe('drop');
  });

  it('waits for the answer and its background polish; Check exactly already running counts as done', () => {
    expect(exactAskStep({ ...base, status: 'loading' })).toBe('wait');
    expect(exactAskStep({ ...base, status: 'idle' })).toBe('wait');
    expect(exactAskStep({ ...base, hasResult: false })).toBe('wait');
    expect(exactAskStep({ ...base, backgroundStatus: 'running' })).toBe('wait');
    expect(exactAskStep({ ...base, exactStatus: 'running' })).toBe('taken');
  });
});
