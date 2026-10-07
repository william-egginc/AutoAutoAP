import { describe, expect, it } from 'vitest';
import { checkBandText, widenBandText, type BandCheckContext } from './bandCheck';
import { formatBand, formatBands, parseBand, parseBands } from './exhaustive';

const ctx: BandCheckContext = { currentTE: 181, finalTE: 490 };
const codes = (text: string, c = ctx) => checkBandText(text, c).map(i => i.code);

describe('parsing what the formatter writes', () => {
  it('reads comma lists as one band', () => {
    expect(parseBand('185-200:5, 210')).toEqual([185, 190, 195, 200, 210]);
    expect(parseBand('210,220')).toEqual([210, 220]);
  });
  it('round-trips formatBand, even for uneven values', () => {
    for (const values of [[210, 220], [185, 190, 195, 200, 210], [190], [200, 210, 211, 212, 230]]) {
      expect(parseBand(formatBand(values))).toEqual(values);
    }
    const bands = [[185, 190], [210, 220], [250]];
    expect(parseBands(formatBands(bands))).toEqual(bands);
  });
});

describe('checkBandText', () => {
  it('has nothing to say about a clean box', () => {
    expect(codes('185-200:5; 215-245:10; 260-300:10')).toEqual([]);
    expect(codes('')).toEqual([]);
    expect(codes('185-200:5; ')).toEqual([]);
  });

  it('suggests the right way round for a reversed range', () => {
    const [issue] = checkBandText('250-240', ctx);
    expect(issue.code).toBe('reversed');
    expect(issue.message).toContain('Did you mean 240-250?');
    expect(issue.fix).toBe('240-250');
    expect(checkBandText('200-210:5; 250-240:5', ctx)[0].fix).toBe('200-210:5; 240-250:5');
  });

  it('catches a step of 0 or a negative one', () => {
    expect(checkBandText('200-240:0', ctx)[0]).toMatchObject({ code: 'badStep', fix: '200-240:5' });
    expect(checkBandText('200-240:-5', ctx)[0]).toMatchObject({ code: 'badStep', fix: '200-240:5' });
  });

  it('catches a step wider than the band', () => {
    const [issue] = checkBandText('200-205:10', ctx);
    expect(issue.code).toBe('stepTooWide');
    expect(issue.fix).toBe('200-205:5');
    expect(codes('200-210:10')).toEqual([]);
  });

  it('names the unreadable part and offers to drop it', () => {
    const [issue] = checkBandText('185-200:5; abc; 215-245:10', ctx);
    expect(issue.code).toBe('unreadable');
    expect(issue.message).toContain('"abc"');
    expect(issue.message).toContain('one ascension fewer');
    expect(issue.fix).toBe('185-200:5; 215-245:10');
    const inList = checkBandText('185-200:5, x', ctx)[0];
    expect(inList.fix).toBe('185-200:5');
  });

  it('flags an empty band in the middle but not a trailing semicolon', () => {
    expect(checkBandText('185-200:5; ; 215-245:10', ctx)[0]).toMatchObject({
      code: 'empty',
      band: 2,
      fix: '185-200:5; 215-245:10',
    });
  });

  it('flags a later band entirely below an earlier one and offers the order that works', () => {
    const issues = checkBandText('260-300:10; 200-240:10', ctx);
    expect(issues.map(i => i.code)).toEqual(['outOfOrder']);
    expect(issues[0].fix).toBe('200-240:10; 260-300:10');
  });

  it('lets overlapping bands be', () => {
    expect(codes('200-240:10; 230-260:10')).toEqual([]);
  });

  it('flags a first band starting at or below the current TE', () => {
    const [issue] = checkBandText('170-200:10; 215-245:10', ctx);
    expect(issue.code).toBe('belowCurrent');
    expect(issue.fix).toBe('190-200:10; 215-245:10');
    expect(codes('150-170:5')).toEqual(['outsideRange']);
  });

  it('flags a band above the target', () => {
    const [issue] = checkBandText('200-240:10; 480-500:10', ctx);
    expect(issue.code).toBe('aboveTarget');
    expect(issue.fix).toBe('200-240:10; 480');
  });

  it('compares the band count to the chain count when told it', () => {
    expect(codes('200-240:10; 260-300:10', { ...ctx, ascensions: 5 })).toEqual(['countMismatch']);
    expect(codes('200-240:10; 260-300:10', { ...ctx, ascensions: 3 })).toEqual([]);
  });
});

describe('widenBandText', () => {
  it('widens the low side on the band step, not past the player or the neighbour', () => {
    expect(widenBandText('195-205:5; 230-250:10', 1, 'low', 10, ctx)).toBe('185-205:5; 230-250:10');
    expect(widenBandText('185-205:5', 1, 'low', 10, ctx)).toBeNull();
    expect(widenBandText('182-205:1', 1, 'low', 10, ctx)).toBeNull();
  });
  it('widens the high side up to the next band', () => {
    expect(widenBandText('195-205:5; 210-250:10', 1, 'high', 10, ctx)).toBe('195-215:5; 210-250:10');
  });
});
