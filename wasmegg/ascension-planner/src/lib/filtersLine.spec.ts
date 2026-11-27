/**
 * The Filters fold's one-line summary (R11, Jordan 21 Nov 2026: Filters fold closed, "easy to flip back"): what is set inside it,
 * said in a line, so a closed fold hides nothing. Parts joined with " · "; PLACEHOLDER words for Words (lib/filtersLine.ts).
 */
import { describe, expect, it } from 'vitest';
import { filtersLine, NO_FILTERS } from './filtersLine';
import { PREFER_OFF } from '@/search/preferFewer';

const base = { inHours: null, bounds: { min: null, max: null }, prefer: PREFER_OFF } as const;

describe('filtersLine', () => {
  it('nothing set says so', () => {
    expect(filtersLine({ ...base })).toBe(NO_FILTERS);
  });
  it('inside awake hours', () => {
    expect(filtersLine({ ...base, inHours: true })).toBe('Inside awake hours');
  });
  it('hours known but the tick off says nothing about hours', () => {
    expect(filtersLine({ ...base, inHours: false })).toBe(NO_FILTERS);
  });
  it('the ascensions range, each way it can be set', () => {
    expect(filtersLine({ ...base, bounds: { min: 3, max: 5 } })).toBe('3 to 5 ascensions');
    expect(filtersLine({ ...base, bounds: { min: 4, max: 4 } })).toBe('exactly 4 ascensions');
    expect(filtersLine({ ...base, bounds: { min: 3, max: null } })).toBe('at least 3 ascensions');
    expect(filtersLine({ ...base, bounds: { min: null, max: 5 } })).toBe('at most 5 ascensions');
    expect(filtersLine({ ...base, bounds: { min: 1, max: 1 } })).toBe('exactly 1 ascension');
  });
  it('Prefer fewer, in TE on a date and in time on Fastest', () => {
    expect(filtersLine({ ...base, prefer: { kind: 'te', te: 0 } })).toBe('Prefer fewer: same TE');
    expect(filtersLine({ ...base, prefer: { kind: 'te', te: 2 } })).toBe('Prefer fewer: within 2 TE');
    expect(filtersLine({ ...base, prefer: { kind: 'time', seconds: 12 * 3600 } })).toBe('Prefer fewer: within 12 h');
    expect(filtersLine({ ...base, prefer: { kind: 'time', seconds: 86400 } })).toBe('Prefer fewer: within 1 day');
    expect(filtersLine({ ...base, prefer: { kind: 'time', seconds: 2 * 86400 } })).toBe('Prefer fewer: within 2 days');
    expect(filtersLine({ ...base, prefer: { kind: 'time', seconds: 5400 } })).toBe('Prefer fewer: within 1.5 h');
  });
  it('all three together, in a fixed order', () => {
    expect(filtersLine({ inHours: true, bounds: { min: 3, max: 5 }, prefer: { kind: 'te', te: 0 } })).toBe(
      'Inside awake hours · 3 to 5 ascensions · Prefer fewer: same TE'
    );
  });
  it('never says "this device" and has no typed ellipsis', () => {
    const all = filtersLine({ inHours: true, bounds: { min: 3, max: 5 }, prefer: { kind: 'te', te: 1 } }) + NO_FILTERS;
    expect(all).not.toMatch(/this device|this computer|…|\.\.\./i);
  });
});
