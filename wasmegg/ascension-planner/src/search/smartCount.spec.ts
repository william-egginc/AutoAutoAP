import { describe, expect, it } from 'vitest';
import { smartCountText } from './smartCount';

describe('smartCountText', () => {
  it('a finished run carried on with nothing new: 296 priced, the estimate an upper bound', () => {
    expect(smartCountText({ done: 0, replayed: 296, estimate: 1265, running: false, level: 'Fast' })).toBe(
      '296 routes priced, 296 of them from the earlier run (the estimate was up to ~1,265; Fast stops when nothing moves)'
    );
  });
  it('while running', () => {
    expect(smartCountText({ done: 42, replayed: 0, estimate: 1265, running: true, level: 'Fast' })).toBe(
      '42 routes priced of up to ~1,265'
    );
  });
});
