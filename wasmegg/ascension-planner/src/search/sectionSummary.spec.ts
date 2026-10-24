import { describe, expect, it } from 'vitest';
import { routeLine } from './sectionSummary';

const show = (u: number) => `T${u}`;
describe('routeLine', () => {
  it('Fastest: when it reaches the target, and how many ascensions', () => {
    expect(routeLine('fastest', { chain: [200, 300, 490], end: 5, endTE: 490 }, show)).toBe('Reaches 490 on T5 · 3 ascensions');
  });
  it('By a date: the TE and the spare; a run going says so; nothing yet says so', () => {
    expect(routeLine('date', { chain: [161, 248], end: 0, endTE: 248, spare: 30 * 3600, running: true }, show)).toBe(
      '248 TE · 30.0 h spare · 2 ascensions (so far, still running)'
    );
    expect(routeLine('date', null, show)).toBe('not run yet');
  });
});
