/**
 * Review W2 (15 Nov 2026): the run bar showed the driver's own stage names ("stage 4: coordinate descent") and the
 * stopped-early text said "(none)". The driver's strings are hashed code and stay as they are (the black box and
 * the run log keep them); the page says them in plain words from here.
 */
import { describe, expect, it } from 'vitest';
import { completedStageWords, smartRunName, stageWords } from './stageWords';

describe('stageWords: what the run bar says', () => {
  it.each([
    ['stage 4a: solving the last stop', 'solving the last stop'],
    ['stage 4a: solving the last checkpoint', 'solving the last stop'],
    ['stage 4: coordinate descent', 'fine-tuning each stop'],
    ['stage 4c: other ascension counts', 'checking other numbers of ascensions'],
    ['stage 4c: one pass at 5 ascensions', 'checking 5 ascensions'],
    ['stage 4d: fine-tuning 6 ascensions', 'fine-tuning 6 ascensions'],
    ['stage 5: exhaustive 2-D slices', 'trying every route in two-stop slices'],
    ['stage 6: exhaustive 3-D slices', 'trying every route in three-stop slices'],
    ['stage 7: prestige-count probe', 'checking how many ascensions are best'],
    ['stage 7: prestige-count probe (round 2)', 'checking how many ascensions are best (round 2)'],
    ['stage 7b: re-polishing the new count', 'fine-tuning the new count'],
  ])('%s', (raw, plain) => {
    expect(stageWords(raw)).toBe(plain);
  });

  it('leaves plain stages alone and drops "stage N:" from one it does not know', () => {
    expect(stageWords('starting workers')).toBe('starting workers');
    expect(stageWords('done')).toBe('done');
    expect(stageWords('stage 9z: some new step')).toBe('some new step');
  });

  it('no mapped line has a "stage N" number, "coordinate descent", "checkpoint" or "2-D"', () => {
    for (const raw of ['stage 4a: solving the last stop', 'stage 4: coordinate descent', 'stage 5: exhaustive 2-D slices', 'stage 7: prestige-count probe']) {
      expect(stageWords(raw)).not.toMatch(/stage \d|coordinate descent|checkpoint|\dD|\d-D|prestige-count/i);
    }
  });
});

describe('completedStageWords: the stopped-early and finished lines', () => {
  it.each([
    ['last-checkpoint sweep', 'solving the last stop'],
    ['coordinate descent', 'fine-tuning each stop'],
    ['other ascension counts', 'checking other numbers of ascensions'],
    ['2-D slices', 'two-stop slices'],
    ['3-D slices', 'three-stop slices'],
    ['prestige-count probe', 'checking how many ascensions are best'],
    ['none', 'none yet'],
  ])('%s', (raw, plain) => {
    expect(completedStageWords(raw)).toBe(plain);
  });
  it('passes an unknown one through', () => {
    expect(completedStageWords('something else')).toBe('something else');
  });
});

describe('smartRunName: Fast, or Exact, never "Fast and Exact" for one run', () => {
  it('quick is Fast; normal and thorough are Exact; unknown is Fast', () => {
    expect(smartRunName('quick')).toBe('Fast');
    expect(smartRunName('normal')).toBe('Exact');
    expect(smartRunName('thorough')).toBe('Exact');
    expect(smartRunName(undefined)).toBe('Fast');
  });
});
