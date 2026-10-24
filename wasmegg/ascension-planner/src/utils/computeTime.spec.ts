import { describe, expect, it } from 'vitest';
import { describeCompute, formatMinutes } from './computeTime';

describe('compute time in words', () => {
  it('picks a readable unit', () => {
    expect(formatMinutes(0.5)).toBe('30 s');
    expect(formatMinutes(12.4)).toBe('12 min');
    expect(formatMinutes(185)).toBe('3 h 5 min');
    expect(formatMinutes(60 * 52)).toBe('2 d 4 h');
  });

  it('adds worker time when more than one worker ran', () => {
    expect(describeCompute(3, 7)).toBe('3 min on 7 workers (21 min of worker time)');
    expect(describeCompute(40, 1)).toBe('40 min on 1 worker');
  });
});
