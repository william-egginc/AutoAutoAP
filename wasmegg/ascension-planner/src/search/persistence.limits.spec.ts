import { describe, expect, it } from 'vitest';
import { buildCheckpoint, checkpointLimits } from './persistence';

// A staged run's limits ride in its checkpoint, so a carry-on searches under them even though the
// Limits box follows the instant answer (lib/limitsFollow.ts).
const base = {
  fingerprint: 'fp',
  effort: 'quick' as const,
  seedChain: [200, 490],
  bestChain: [200, 490],
  bestSeconds: 86400,
  entries: [{ key: '200,490', seconds: 86400, legs: [] }],
  stage: 'running',
  detail: '',
  chainsDone: 1,
};

describe('checkpoint limits', () => {
  it('kept when given, absent otherwise (old records stay valid)', () => {
    expect(buildCheckpoint({ ...base, limits: { min: 2, max: 6 } }).limits).toEqual({ min: 2, max: 6 });
    expect('limits' in buildCheckpoint(base)).toBe(false);
    expect('limits' in buildCheckpoint({ ...base, limits: null })).toBe(false);
  });
  it('read back only when usable', () => {
    expect(checkpointLimits({ limits: { min: 5, max: 8 } })).toEqual({ min: 5, max: 8 });
    expect(checkpointLimits({})).toBeNull();
    expect(checkpointLimits(null)).toBeNull();
    expect(checkpointLimits({ limits: { min: 6, max: 5 } })).toBeNull();
    expect(checkpointLimits({ limits: { min: 2, max: 13 } })).toBeNull();
    expect(checkpointLimits({ limits: { min: '2', max: 'x' } })).toBeNull();
  });
});
