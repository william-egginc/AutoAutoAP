import { describe, expect, it } from 'vitest';
import { firstTime } from './linkOnce';

describe('firstTime', () => {
  it('is true once per key', () => {
    expect(firstTime('a')).toBe(true);
    expect(firstTime('a')).toBe(false);
    expect(firstTime('b')).toBe(true);
  });
});
