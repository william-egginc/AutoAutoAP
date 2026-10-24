import { describe, expect, it } from 'vitest';
import { NO_PRESTIGE_SEND_NOTE, sendBlockedByNoPrestige } from './npGuard';

describe('sendBlockedByNoPrestige', () => {
  it('blocks while any usable no-prestige day is set', () => {
    expect(sendBlockedByNoPrestige([{ from: '2027-02-10', to: '2027-02-10' }])).toBe(true);
    expect(
      sendBlockedByNoPrestige([
        { from: '2027-02-10', to: '' },
        { from: '2027-03-01', to: '2027-03-04' },
      ])
    ).toBe(true);
  });

  it('never without days, or with only half-typed or backwards rows (they price nothing)', () => {
    expect(sendBlockedByNoPrestige([])).toBe(false);
    expect(sendBlockedByNoPrestige(null)).toBe(false);
    expect(sendBlockedByNoPrestige(undefined)).toBe(false);
    expect(sendBlockedByNoPrestige([{ from: '2027-02-10', to: '' }])).toBe(false);
    expect(sendBlockedByNoPrestige([{ from: '2027-02-12', to: '2027-02-10' }])).toBe(false);
  });

  it('says it plainly', () => {
    expect(NO_PRESTIGE_SEND_NOTE).toBe(
      "Runs priced with no-prestige days aren't sent to the leaderboard yet, so they don't rank against runs without them."
    );
  });
});
