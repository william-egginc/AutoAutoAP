/** What By a date's Simulate this plan hands Single run (search/byDateSimulate.ts). */
import { describe, expect, it } from 'vitest';
import { BUILDUP_NOTE, byDateSimulate } from './byDateSimulate';
import type { DeadlineRoute } from './deadline';

const START = 1_790_000_000;
const route = (keys: string[] = ['2-sale-tier13', '1-sale', '1-sale']): DeadlineRoute => ({
  chain: [166, 197, 247],
  reachAt: START + 200 * 86400,
  ascendAt: START + 200 * 86400,
  spare: 3600,
  legs: keys.map((key, i) => ({ key, endTE: [166, 197, 247][i] })) as never,
});

describe('byDateSimulate', () => {
  it("the route, the run's plan start, its legs and its own first-ascension setting", () => {
    const s = byDateSimulate(route(), { planStart: START, firstAscension: 'fresh' });
    expect(s.chain).toEqual([166, 197, 247]);
    expect(s.opts).toMatchObject({ start: START, firstAscension: 'fresh', from: 'your Highest TE by a date search' });
    expect(s.opts.legs?.[0].key).toBe('2-sale-tier13');
    expect(s.note).toBe('');
  });

  it('a build-up first ascension is passed as it is, with the note under the button', () => {
    const s = byDateSimulate(route(['buildup', '1-sale', '1-sale']), { planStart: START, firstAscension: 'auto' });
    expect(s.opts.legs?.[0].key).toBe('buildup');
    expect(s.note).toBe(BUILDUP_NOTE);
    expect(BUILDUP_NOTE).toBe('Single run prices the first ascension as a fresh build/continue.');
  });

  it('no legs yet (a best so far replayed): the setting decides the note; nothing recorded, nothing passed', () => {
    const bare = { ...route(), legs: [] };
    expect(byDateSimulate(bare, { planStart: START, firstAscension: 'buildup' }).note).toBe(BUILDUP_NOTE);
    const s = byDateSimulate(bare, { planStart: 0, firstAscension: null });
    expect(s.opts).toEqual({ from: 'your Highest TE by a date search' });
    expect(s.note).toBe('');
  });
});
