/**
 * STARTING FRESH WOULD BE SOONER (spec-r7verify, 1 Nov 2026; lib/freshSooner.ts): the threshold, which legs and settings
 * show the line, the kept override (per account and stop, throwing storage) and the words (DRAFT). Fixed clock.
 */
import { describe, expect, it } from 'vitest';
import {
  FASTEST_PICK_PREFIX,
  FRESH_SOONER_SECONDS,
  fastestPickKey,
  freshLineFor,
  freshSooner,
  readFastestPick,
  writeFastestPick,
} from './freshSooner';
import { FASTEST_FOLLOWED_LINE, SWITCH_TO_FASTEST, freshSoonerLine } from './freshSoonerWords';
import { dateAt } from './eventWhen';

const NOW = Date.UTC(2026, 10, 1, 20, 0) / 1000;
const D = 86400;
const ZONE = 'America/Denver';
const leg = (key: string, end: number, fresh?: number) => ({ key, endTime: end, firstLegEnds: fresh === undefined ? { buildup: end } : { buildup: end, fresh } });

describe('freshSooner', () => {
  it('the threshold is one hour', () => expect(FRESH_SOONER_SECONDS).toBe(3600));
  it('a build-up ending 6.5 days after the fresh start: the line, with both ends', () => {
    expect(freshSooner(leg('buildup', NOW + 30 * D, NOW + 23.5 * D))).toEqual({ freshEnd: NOW + 23.5 * D, legEnd: NOW + 30 * D, seconds: 6.5 * D });
  });
  it('continue (the forced build-up just laying) counts too', () => {
    expect(freshSooner(leg('continue', NOW + 3 * D, NOW + D))).not.toBeNull();
  });
  it('an hour or less sooner, equal, later or not priced: no line', () => {
    expect(freshSooner(leg('buildup', NOW + D, NOW + D - 3600))).toBeNull();
    expect(freshSooner(leg('buildup', NOW + D, NOW + D))).toBeNull();
    expect(freshSooner(leg('buildup', NOW + D, NOW + 2 * D))).toBeNull();
    expect(freshSooner(leg('buildup', NOW + D))).toBeNull();
    expect(freshSooner(leg('buildup', NOW + D, Infinity))).toBeNull();
    expect(freshSooner(null)).toBeNull();
  });
  it('just over an hour sooner: the line', () => {
    expect(freshSooner(leg('buildup', NOW + D, NOW + D - 3601))?.seconds).toBe(3601);
  });
  it('a fresh leg (Fastest took the fresh start) is no forced build-up', () => {
    expect(freshSooner(leg('3-sale', NOW + D, NOW))).toBeNull();
  });
});

describe('freshLineFor (Right now)', () => {
  const sooner = leg('buildup', NOW + 10 * D, NOW + 5 * D);
  const base = { trackerOnly: false, fastest: false, building: false, side: null, setting: 'buildup', leg: sooner } as const;
  it("Your setup's Continue my build-up: the line", () => expect(freshLineFor(base)).not.toBeNull());
  it("the unfinished build's build-up side, whatever the setting: the line", () => {
    expect(freshLineFor({ ...base, building: true, side: 'buildup', setting: 'auto' })).not.toBeNull();
  });
  it("Fastest (auto) off the unfinished path, Prestige now, Finish without buying: no line", () => {
    expect(freshLineFor({ ...base, setting: 'auto' })).toBeNull();
    expect(freshLineFor({ ...base, setting: 'fresh' })).toBeNull();
    expect(freshLineFor({ ...base, setting: 'continue' })).toBeNull();
  });
  it("the A1 choice's Finish without buying side: no line", () => {
    expect(freshLineFor({ ...base, building: true, side: 'continue' })).toBeNull();
  });
  it('a route with exact legs (the plan holds A1), or Fastest followed already: no line', () => {
    expect(freshLineFor({ ...base, trackerOnly: true })).toBeNull();
    expect(freshLineFor({ ...base, fastest: true })).toBeNull();
  });
});

describe('the kept override', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { m, st: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } };
  };
  it('per account and stop; Undo removes it', () => {
    const { m, st } = mem();
    expect(readFastestPick('acct', 226, st)).toBe(false);
    expect(writeFastestPick('acct', 226, true, st)).toBe(true);
    expect(m.get(`${FASTEST_PICK_PREFIX}acct.226`)).toBe('auto');
    expect(fastestPickKey('acct', 226)).toBe('aap.firstasc.acct.226');
    expect(readFastestPick('acct', 226, st)).toBe(true);
    expect(readFastestPick('acct', 277, st)).toBe(false);
    expect(readFastestPick('other', 226, st)).toBe(false);
    writeFastestPick('acct', 226, false, st);
    expect(readFastestPick('acct', 226, st)).toBe(false);
  });
  it('storage that throws or is missing: never throws, not kept', () => {
    const bad = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('x'); } };
    expect(readFastestPick('a', 1, bad)).toBe(false);
    expect(writeFastestPick('a', 1, true, bad)).toBe(false);
    expect(readFastestPick('a', 1, null)).toBe(false);
    expect(writeFastestPick('a', 1, true, null)).toBe(false);
  });
});

describe('words (DRAFT)', () => {
  const f = freshSooner(leg('buildup', NOW + 30 * D, NOW + 23.5 * D))!;
  it('N and both dates, the shared formatter in the zone given', () => {
    const t = freshSoonerLine(f, NOW, ZONE);
    expect(t).toBe(`Starting fresh would end this ascension 6d 12h sooner: ${dateAt(NOW + 23.5 * D, NOW, ZONE)} vs ${dateAt(NOW + 30 * D, NOW, ZONE)}.`);
    expect(t).toMatch(/sooner: Nov 25 at 1:00 (am|AM) vs Dec 1 at 1:00 (pm|PM)\.$/);
  });
  it('hours under two days', () => {
    expect(freshSoonerLine(freshSooner(leg('buildup', NOW + D, NOW + D - 5 * 3600))!, NOW, ZONE)).toContain('5h sooner');
  });
  it('the button and the followed line', () => {
    expect(SWITCH_TO_FASTEST).toBe('Switch to Soonest');
    expect(FASTEST_FOLLOWED_LINE).toContain('Soonest for this ascension');
  });
});
