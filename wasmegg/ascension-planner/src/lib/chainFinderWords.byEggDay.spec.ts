/**
 * "By Egg Day" (Jordan, 20 Nov 2026): the goal switch's second side and its chips are named for Egg Day, where By a date was.
 * The Leaderboard's tabs ("Egg Day 2027" / "Other dates") keep their names.
 */
import { describe, expect, it } from 'vitest';
import { CHAIN_FINDER_WORDS } from './chainFinderWords';

describe('the by-date goal is named By Egg Day', () => {
  it('the goal switch side', () => {
    expect(CHAIN_FINDER_WORDS.goals['by-date']).toBe('By Egg Day');
  });
  it('the Target TE side keeps its name', () => {
    expect(CHAIN_FINDER_WORDS.goals.fastest).toBe('Target TE');
  });
});
