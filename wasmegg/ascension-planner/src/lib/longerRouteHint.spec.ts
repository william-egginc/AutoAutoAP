import { describe, expect, it } from 'vitest';
import { longerRouteHints, MARGIN_SECONDS, soonerWords, type LongerRouteInput } from './longerRouteHint';

const DAY = 86400;
const FIVE_STOPS = [163, 197, 232, 262, 295, 490];
const SEVEN_STOPS = [163, 195, 216, 248, 280, 318, 490];

/** A search that tried 5 to 7 ascensions; its best has 6, so it is not at the edge. */
const base = (over: Partial<LongerRouteInput> = {}): LongerRouteInput => ({
  bestChain: FIVE_STOPS,
  bestSeconds: 30 * DAY,
  searchedCounts: [5, 6, 7],
  instant: null,
  ...over,
});

describe('longerRouteHints', () => {
  it('says nothing when nothing qualifies', () => {
    expect(longerRouteHints(base())).toEqual([]);
    // An instant answer that is slower, or only a little faster, does not count.
    const slower = { chain: SEVEN_STOPS, seconds: 31 * DAY, exact: false };
    expect(longerRouteHints(base({ instant: slower }))).toEqual([]);
    const littleFaster = { chain: SEVEN_STOPS, seconds: 30 * DAY - 2 * 3600, exact: false };
    expect(longerRouteHints(base({ instant: littleFaster }))).toEqual([]);
  });

  it('says nothing without a result to compare', () => {
    expect(longerRouteHints(base({ bestChain: [] }))).toEqual([]);
    expect(longerRouteHints(base({ bestSeconds: 0, searchedCounts: [6] }))).toEqual([]);
  });

  it('(a) flags an instant route that is clearly faster', () => {
    const instant = { chain: SEVEN_STOPS, seconds: 28.5 * DAY, exact: false };
    const hints = longerRouteHints(base({ instant }));
    expect(hints).toHaveLength(1);
    expect(hints[0]).toMatchObject({ kind: 'instant', count: 7, chain: SEVEN_STOPS });
    expect(hints[0].text).toBe(
      'The instant answer has a route with 7 ascensions that may finish about 1.5 days sooner (163 195 216 248 280 318 490).'
    );
  });

  it('(a) respects the margin: exactly 12 hours is not enough, a little more is', () => {
    const at = (gain: number) =>
      longerRouteHints(base({ instant: { chain: SEVEN_STOPS, seconds: 30 * DAY - gain, exact: true } }));
    expect(at(MARGIN_SECONDS - 60)).toEqual([]);
    expect(at(MARGIN_SECONDS)).toEqual([]);
    expect(at(MARGIN_SECONDS + 60)).toHaveLength(1);
  });

  it('(a) flags a faster instant route with more ascensions than any chain searched, inside the margin', () => {
    const instant = { chain: SEVEN_STOPS, seconds: 30 * DAY - 3 * 3600, exact: false };
    // The search stopped at 6: seven could not have been found.
    const hints = longerRouteHints(base({ searchedCounts: [4, 5, 6], instant }));
    expect(hints[0]).toMatchObject({ kind: 'instant', count: 7 });
    expect(hints[0].text).toContain('about 3 hours sooner');
    expect(hints).toHaveLength(1); // the edge note points at the same count
    // The same small gain at a count that was searched is the table's rounding, not news.
    expect(longerRouteHints(base({ instant }))).toEqual([]);
    // And a slower route with more ascensions is never flagged.
    expect(longerRouteHints(base({ instant: { ...instant, seconds: 31 * DAY } }))).toEqual([]);
  });

  it('(a) ignores an instant answer for a different target', () => {
    const other = { chain: [163, 195, 216, 248, 280, 318, 500], seconds: 20 * DAY, exact: false };
    expect(longerRouteHints(base({ instant: other }))).toEqual([]);
  });

  it('(b) flags a best route that uses the most ascensions searched', () => {
    const hints = longerRouteHints(base({ searchedCounts: [4, 5, 6] }));
    expect(hints).toHaveLength(1);
    expect(hints[0]).toMatchObject({ kind: 'edge', count: 7 });
    expect(hints[0].text).toBe(
      'Your best route uses the most ascensions you searched (6). A route with 7 might be faster.'
    );
  });

  it('(b) flags a search that tried only one count', () => {
    expect(longerRouteHints(base({ searchedCounts: [6] }))[0]).toMatchObject({ kind: 'edge', count: 7 });
  });

  it('(b) has nothing to say without counts, or when no chain can be longer', () => {
    expect(longerRouteHints(base({ searchedCounts: [] }))).toEqual([]);
    const twelve = Array.from({ length: 12 }, (_, i) => 200 + i * 20).concat(490);
    expect(longerRouteHints(base({ bestChain: twelve.slice(-12), searchedCounts: [10, 11, 12] }))).toEqual([]);
  });

  it('gives both notes when both are true and they point at different counts', () => {
    const instant = { chain: [163, 195, 216, 248, 280, 318, 345, 490], seconds: 25 * DAY, exact: false };
    const hints = longerRouteHints(base({ searchedCounts: [4, 5, 6], instant }));
    expect(hints.map(h => [h.kind, h.count])).toEqual([
      ['instant', 8],
      ['edge', 7],
    ]);
  });

  it('gives one note when both point at the same count', () => {
    const instant = { chain: SEVEN_STOPS, seconds: 25 * DAY, exact: false };
    const hints = longerRouteHints(
      base({ bestChain: [163, 195, 216, 248, 280, 490], searchedCounts: [5, 6], instant })
    );
    expect(hints.map(h => [h.kind, h.count])).toEqual([['instant', 7]]);
  });
});

describe('soonerWords', () => {
  it('speaks in days, hours or neither', () => {
    expect(soonerWords(1.5 * DAY)).toBe('about 1.5 days sooner');
    expect(soonerWords(DAY)).toBe('about 1 day sooner');
    expect(soonerWords(14 * 3600)).toBe('about 14 hours sooner');
    expect(soonerWords(600)).toBe('sooner');
  });
});
