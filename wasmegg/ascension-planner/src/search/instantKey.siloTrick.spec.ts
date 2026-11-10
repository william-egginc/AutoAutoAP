/** The instant answer's key and the silo trick (spec-silotrick, 10 Nov 2026): keyed only when on. */
import { describe, expect, it } from 'vitest';
import { instantKey, type InstantKeyInput } from './instantSnapshot';

const base: InstantKeyInput = {
  playerId: 'p',
  deadline: null,
  finalTE: 313,
  currentTE: 197,
  eggsDelivered: {},
  artifacts: [],
  stones: [],
  epic: {},
  availability: null,
  timeOff: [],
  milestones: [],
  firstAscension: 'auto',
  useHours: false,
  maxAscensions: null,
};

describe('instantKey and the silo trick', () => {
  it('off (or absent) leaves every key as it was', () => {
    expect(instantKey({ ...base, siloTrick: false })).toBe(instantKey(base));
  });
  it('on is a different key', () => {
    expect(instantKey({ ...base, siloTrick: true })).not.toBe(instantKey(base));
  });
});
