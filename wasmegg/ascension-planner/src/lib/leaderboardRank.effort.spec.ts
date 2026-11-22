/** Code review round 2, C6.7: a free-text effort that names an Object.prototype member shows as itself, not as native code. */
import { describe, expect, it } from 'vitest';
import { effortText } from './leaderboardRank';

describe('effortText', () => {
  it('names the known tiers and shows anything else as typed, even constructor and toString', () => {
    expect(effortText('quick')).toBe('Fast');
    expect(effortText('constructor')).toBe('constructor');
    expect(effortText('toString')).toBe('toString');
    expect(effortText('__proto__')).toBe('__proto__');
    expect(effortText(undefined)).toBe('unknown');
  });
});
