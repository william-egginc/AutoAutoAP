import { describe, expect, it } from 'vitest';
import { parseBands } from './exhaustive';
import { goFurtherBands } from './goFurther';

describe('goFurtherBands: Custom boxes from a finished run (25 Oct 2026)', () => {
  const durations: [string, number][] = [
    ['200,300,490', 100],
    ['202,298,490', 110],
    ['199,301,490', 120],
    ['250,490', 50], // another ascension count: not used
    ['200,300,450', 10], // another target: not used
    ['230,330,490', 999],
  ];

  it('spans each stop from the lowest to the highest value of the fastest routes', () => {
    const r = goFurtherBands(durations, [200, 300, 490], 3)!;
    expect(r.routes).toBe(3);
    expect(r.bands).toBe('199-202:1; 298-301:1');
    expect(parseBands(r.bands)).toEqual([
      [199, 200, 201, 202],
      [298, 299, 300, 301],
    ]);
  });

  it('a single route gives one-value boxes', () => {
    expect(goFurtherBands([], [200, 300, 490])).toEqual({ bands: '200; 300', routes: 1 });
  });

  it('nothing to build from a route with no stops', () => {
    expect(goFurtherBands(durations, [490])).toBeNull();
  });
});
