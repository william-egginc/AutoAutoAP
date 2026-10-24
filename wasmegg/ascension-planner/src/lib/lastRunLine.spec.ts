import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { lastRunLine } from './lastRunLine';

const Z = 'America/Denver';
// Oct 23, 2026 6:43 pm MDT = 00:43 UTC Oct 24; the save, Oct 23 1:03 am MDT = 07:03 UTC Oct 23.
const RAN = Date.UTC(2026, 9, 24, 0, 43) ;
const SAVE = Date.UTC(2026, 9, 23, 7, 3) / 1000;
const NOW = Date.UTC(2026, 9, 24, 18, 0) / 1000;
const base = { at: RAN, saveAt: SAVE, te: 307, zone: Z, now: NOW };

describe('the line at the top of a kept result', () => {
  it('names the level, when it ran, the save and what it found', () => {
    expect(lastRunLine({ ...base, level: 'quick' })).toBe(
      'This Fast search ran on Oct 23 at 6:43 pm, on your save of Oct 23 at 1:03 am, and found 307 TE.'
    );
  });
  it('Exact for normal and Very high, Custom for exhaustive', () => {
    expect(lastRunLine({ ...base, level: 'normal' })).toContain('This Exact search');
    expect(lastRunLine({ ...base, level: 'thorough' })).toContain('This Exact search');
    expect(lastRunLine({ ...base, level: 'exhaustive' })).toContain('This Custom search');
  });
  it('says older save only when the loaded save is newer', () => {
    expect(lastRunLine({ ...base, level: 'quick', loadedSaveAt: SAVE + 3600 })).toContain(
      'on your save of Oct 23 at 1:03 am (older save than the one loaded now), and found'
    );
    expect(lastRunLine({ ...base, level: 'quick', loadedSaveAt: SAVE })).not.toContain('older');
    expect(lastRunLine({ ...base, level: 'quick', loadedSaveAt: SAVE - 1 })).not.toContain('older');
  });
  it('leaves out what is not known, and names the year only when it is not this one', () => {
    expect(lastRunLine({ at: RAN, te: 307, zone: Z, now: NOW })).toBe('This search ran on Oct 23 at 6:43 pm, and found 307 TE.');
    expect(lastRunLine({ ...base, level: 'quick', te: 0, saveAt: 0 })).toBe('This Fast search ran on Oct 23 at 6:43 pm.');
    expect(lastRunLine({ ...base, level: 'quick', now: NOW + 365 * 86400 })).toContain('on Oct 23, 2026 at 6:43 pm');
    expect(lastRunLine({ ...base, at: 0 })).toBe('');
  });
});

describe('where the line shows', () => {
  it('on the By a date card and both Fastest cards, from the kept result', () => {
    const src = (f: string) => readFileSync(`src/components/auto/${f}`, 'utf8');
    expect(src('DeadlinePanel.vue')).toContain(':ran-line="ranLine"');
    expect(src('ChainSearchPanel.vue')).toContain(':ran-line="ranLine"');
    expect(src('InsanePanel.vue')).toContain(':ran-line="ranLine"');
    expect(src('ByDateRouteCard.vue')).toContain('data-testid="ran-line"');
    expect(src('RouteResultCard.vue')).toContain('data-testid="ran-line"');
  });
});
