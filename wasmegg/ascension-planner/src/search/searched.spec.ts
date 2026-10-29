/**
 * What a search looked at, as one line (search/searched.ts): the text each kind of run writes, the CSV
 * header lines made from it, the cap it is sent under, and the words My runs shows.
 */
import { describe, expect, it } from 'vitest';
import {
  cleanSearched,
  deadlineSearched,
  lightSearched,
  MAX_SEARCHED,
  nearbySearched,
  SEARCHED_NOT_RECORDED,
  searchedCsvLines,
  searchedText,
  searchedWords,
  sweepSearched,
} from './searched';

const span = (lo: number, hi: number, step = 1) => {
  const out: number[] = [];
  for (let v = lo; v <= hi; v += step) out.push(v);
  return out;
};

describe('searchedText', () => {
  it("By a date's boxes with steps, in the command line's own notation", () => {
    const text = searchedText(
      deadlineSearched({
        bandSets: [[span(195, 197, 2), span(209, 240), span(230, 260), span(255, 300)]],
        lastLo: 300,
        lastHi: 320,
      })
    );
    expect(text).toBe('195-197:2; 209-240:1; 230-260:1; 255-300:1; last 300-320; ascensions: 5');
  });

  it('By a date with several sets: ` | ` between them, `none` for one ascension, the count range over all', () => {
    const text = searchedText(
      deadlineSearched({
        bandSets: [[span(138, 176)], [span(167, 185, 3), span(200, 210)], []],
        instantSets: [[150, 220]],
        lastLo: 200,
        lastHi: 240,
        ceiling: 490,
      })
    );
    expect(text).toBe(
      '138-176:1 | 167-185:3; 200-210:1 | none; plus 1 instant answer set; last 200-240 (could go to 490); ascensions: 1-3'
    );
  });

  it("Nearby routes' generated boxes come out the same way (uneven values joined by commas)", () => {
    const text = searchedText(
      deadlineSearched({ bandSets: [[[140, 141, 142, 150], [210, 215, 220]]], lastLo: 260, lastHi: 270 })
    );
    expect(text).toBe('140-142:1, 150; 210-220:5; last 260-270; ascensions: 3');
  });

  it('By a date without boxes (the quick scan): its grid step and stop counts', () => {
    expect(searchedText(deadlineSearched({ lastHi: 490, lastLo: 141, step: 20, minStops: 1, maxStops: 5 }))).toBe(
      'grid step 20; last 141-490; ascensions: 1-5'
    );
  });

  it('Fastest Exhaustive: its bands, count range and min gap; range mode as one pool', () => {
    expect(
      searchedText(
        sweepSearched({
          mode: 'bands',
          bands: [span(190, 280, 2), span(270, 372, 2)],
          minGap: 10,
          minAscensions: 3,
          maxAscensions: 3,
        })
      )
    ).toBe('190-280:2; 270-372:2; ascensions: 3; min gap: 10');
    expect(
      searchedText(
        sweepSearched({ mode: 'range', range: { lo: 185, hi: 390, step: 5 }, minGap: 0, minAscensions: 5, maxAscensions: 8 })
      )
    ).toBe('range 185-390:5; ascensions: 5-8; min gap: 0');
  });

  it('Nearby routes on Fastest: the route it started from, the counts it searched from, its limits', () => {
    expect(
      searchedText(nearbySearched({ seed: [195, 226, 277, 317, 490], counts: [5, 4, 6], limits: { min: 3, max: 8 } }))
    ).toBe('around 195 226 277 317 490; counts 4 5 6; ascensions: 3-8');
  });

  it('Light: the routes it priced by where from, and the counts they span', () => {
    const routes = [
      { chain: [200, 300, 490], from: 'instant' },
      { chain: [200, 490], from: 'instant' },
      { chain: [210, 260, 330, 490], from: 'earlier' },
      { chain: [205, 300, 489], from: 'lower-te' },
    ];
    expect(searchedText(lightSearched(routes))).toBe(
      'routes: 2 instant answer, 1 earlier, 1 one TE lower; ascensions: 2-4'
    );
  });

  it('nothing known: undefined, never a guess', () => {
    expect(searchedText(nearbySearched({ seed: [] }))).toBeUndefined();
    expect(searchedText(lightSearched([]))).toBeUndefined();
    expect(searchedText(null)).toBeUndefined();
  });
});

describe('searchedCsvLines', () => {
  it('the boxes on one line, the count range and min gap on the next', () => {
    expect(searchedCsvLines('190-280:2; 270-372:2; ascensions: 3; min gap: 10')).toEqual([
      'searched: 190-280:2; 270-372:2',
      'ascensions: 3; min gap: 10',
    ]);
  });
  it('no counts: one line; nothing: none', () => {
    expect(searchedCsvLines('around 195 490')).toEqual(['searched: around 195 490']);
    expect(searchedCsvLines(undefined)).toEqual([]);
    expect(searchedCsvLines('  ')).toEqual([]);
  });
  it('a line break can never end the comment', () => {
    expect(searchedCsvLines('195-197:2\n209-240:1')).toEqual(['searched: 195-197:2 209-240:1']);
  });
});

describe('cleanSearched', () => {
  it('kept as it is when it fits', () => {
    expect(cleanSearched('195-197:2; last 300-320; ascensions: 5')).toBe('195-197:2; last 300-320; ascensions: 5');
    expect(cleanSearched('')).toBeUndefined();
    expect(cleanSearched(undefined)).toBeUndefined();
  });
  it('too long: boxes cut from the end at a token, the counts kept, `…` where it was cut', () => {
    const boxes = Array.from({ length: 200 }, (_, k) => `${100 + k}-${110 + k}:1`).join('; ');
    const out = cleanSearched(`${boxes}; last 300-320; ascensions: 3-6; min gap: 0`)!;
    expect(out.length).toBeLessThanOrEqual(MAX_SEARCHED);
    expect(out.startsWith('100-110:1; 101-111:1')).toBe(true);
    expect(out.endsWith('; …; ascensions: 3-6; min gap: 0')).toBe(true);
    expect(searchedWords(out)).toContain('and more; 3 to 6 ascensions; no minimum gap');
  });
  it('no player id gets through', () => {
    expect(cleanSearched('around 195 EI1234567890123456')).toBe('around 195 EI[redacted]');
  });
});

describe('searchedWords (My runs: What was searched)', () => {
  it("By a date's boxes as the player reads them", () => {
    expect(searchedWords('195-197:2; 209-240:1; 230-260:1; 255-300:1; last 300-320; ascensions: 5')).toBe(
      'Stops: 195-197 (every 2), 209-240, 230-260, 255-300; last stop 300-320; 5 ascensions'
    );
  });
  it('several sets, an extended last box and the instant answer sets', () => {
    expect(
      searchedWords(
        '138-176:1 | 167-185:3; 200-210:1 | none; plus 1 instant answer set; last 200-240 (could go to 490); ascensions: 1-3'
      )
    ).toBe(
      "Stops: 138-176; or 167-185 (every 3), 200-210; or none (one ascension); plus the instant answer's 1 set of early stops; last stop 200-240 (could go to 490); 1 to 3 ascensions"
    );
  });
  it('Fastest: Exhaustive, range mode, Nearby routes and Light', () => {
    expect(searchedWords('190-280:2; 270-372:2; ascensions: 3; min gap: 10')).toBe(
      'Stops: 190-280 (every 2), 270-372 (every 2); 3 ascensions; at least 10 TE between stops'
    );
    expect(searchedWords('range 185-390:5; ascensions: 5-8; min gap: 0')).toBe(
      'every stop from 185-390 (every 5); 5 to 8 ascensions; no minimum gap'
    );
    expect(searchedWords('around 195 226 277 317 490; counts 4 5 6; ascensions: 3-8')).toBe(
      'Fast or Exact around 195 226 277 317 490; ascension counts tried 4, 5, 6; 3 to 8 ascensions'
    );
    expect(searchedWords('routes: 2 instant answer, 1 earlier; ascensions: 2-4')).toBe(
      'routes priced: 2 instant answer, 1 earlier; 2 to 4 ascensions'
    );
    expect(searchedWords('grid step 20; last 141-490; ascensions: 1-5')).toBe(
      'early stops on a 20-TE grid; last stop 141-490; 1 to 5 ascensions'
    );
  });
  it('a format it does not know comes back as it is', () => {
    expect(searchedWords('something new: 195 to 200')).toBe('something new: 195 to 200');
    expect(searchedWords('195-197:2; who knows')).toBe('195-197:2; who knows');
  });
  it('none: not recorded (older run)', () => {
    expect(searchedWords(undefined)).toBe(SEARCHED_NOT_RECORDED);
    expect(searchedWords('')).toBe('not recorded (older run)');
  });
});
