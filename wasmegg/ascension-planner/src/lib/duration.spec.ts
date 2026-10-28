/**
 * TIME WORDS (ux29-d item 8, 27 Oct 2026): one compact duration for every player-facing span (next TE, to goal, save
 * age, spare/behind, Right now countdowns, the instant answer headline). The table below is the rule; the notes
 * (aaap-tools/notes/ux29-d.md) say why days start at 48 h.
 */
import { describe, expect, it } from 'vitest';
import { compactDuration } from './duration';
import { relativeWords, agoLong } from './eventWhen';
import { aboutWords, afterShiftLine } from './nextTeEgg';
import { ageAgo, ageWords } from './saveAge';
import { headlineGap, roundedGap } from './format';
import { spareLabel } from '@/search/deadlineSummary';
import { spareWords } from './nowWords';

const M = 60;
const H = 3600;
const D = 86400;

describe('compactDuration: the one table', () => {
  it.each([
    [0, '<1m'],
    [59, '<1m'],
    [60, '1m'],
    [25 * M, '25m'],
    [59 * M + 40, '1h'], // rounds to 60 min, carried into hours
    [H, '1h'],
    [3 * H + 20 * M, '3h 20m'],
    [18 * H + 30 * M, '18h 30m'],
    [33 * H, '33h'], // under 48 h stays in hours: "1d 9h" would hide most of a day behind "1d"
    [47 * H + 59 * M, '47h 59m'],
    [48 * H, '2d'],
    [52 * H + 10 * M, '2d 4h'], // from 48 h, minutes are dropped (rounded to the hour)
    [9 * D + 23 * H, '9d 23h'],
    [10 * D, '10d'],
    [10 * D + 13 * H, '11d'], // from 10 days, whole days
    [364 * D, '364d'],
    [1858 * D, '5.1 years'],
    [365.25 * D, '1 year'],
  ])('%d s → %s', (s, want) => {
    expect(compactDuration(s)).toBe(want);
  });

  it('reads the size of a negative span (callers say "ago", "short", "behind")', () => {
    expect(compactDuration(-3 * H)).toBe('3h');
  });

  it('says nothing silly for a missing span', () => {
    expect(compactDuration(NaN)).toBe('');
    expect(compactDuration(Infinity)).toBe('');
  });
});

describe('every player-facing span uses it', () => {
  it('countdowns and ages (Right now, the events table, save strips)', () => {
    expect(relativeWords(80 * M)).toBe('in 1h 20m');
    expect(relativeWords(33 * H)).toBe('in 33h');
    expect(relativeWords(52 * H)).toBe('in 2d 4h');
    expect(relativeWords(-45 * M)).toBe('45m ago');
    expect(relativeWords(30)).toBe('now');
    expect(agoLong(3 * H)).toBe('3h ago');
    expect(agoLong(10)).toBe('just now');
    expect(ageWords(14 * M)).toBe('14m');
    expect(ageWords(25 * D)).toBe('25d');
    expect(ageAgo(5 * H)).toBe('5h ago');
    expect(ageAgo(5)).toBe('just now');
  });

  it('next TE after a shift', () => {
    expect(aboutWords(52 * H)).toBe('~2d 4h');
    expect(afterShiftLine(3 * H + 20 * M)).toBe('next TE in ~3h 20m after you shift here');
  });

  it('spare and behind times, and the instant answer headline', () => {
    expect(headlineGap(5.5 * D)).toBe('5d 12h');
    expect(headlineGap(-3 * H)).toBe('−3h');
    expect(headlineGap(1858 * D)).toBe('5.1 years');
    expect(roundedGap(6 * H)).toBe('6h');
    expect(spareLabel(27.3 * H)).toBe('27h 18m');
    expect(spareWords(16.8)).toBe('16h 48m');
    expect(spareWords(50)).toBe('2d 2h');
  });
});
