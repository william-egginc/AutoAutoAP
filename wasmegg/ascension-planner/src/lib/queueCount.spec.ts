import { describe, expect, it } from 'vitest';
import { queueCountLine } from './queueCount';

describe('queueCountLine', () => {
  it('names the running chain and the whole queue, one way for the bar and the panel', () => {
    expect(queueCountLine({ chain: { at: 1, of: 3 }, done: 32, total: 567, queueTotal: 2223 })).toBe(
      'box 1 of 3: 32 of ~567 routes · all boxes ~2,223 routes'
    );
    expect(queueCountLine({ chain: { at: 2, of: 2 }, done: 5, total: null, queueTotal: null })).toBe('box 2 of 2: 5 routes');
  });
});
