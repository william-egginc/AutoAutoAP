import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { eggDaySeconds, nextEggDayYear, sameClock } from './eggDay';

describe('Egg Day', () => {
  it('is 14 July at 9:00 AM Pacific (16:00 UTC in summer time)', () => {
    expect(new Date(eggDaySeconds(2027) * 1000).toISOString()).toBe('2027-07-14T16:00:00.000Z');
  });
  it('is next year once this year has started', () => {
    expect(nextEggDayYear(Date.parse('2026-09-29T12:00:00Z'))).toBe(2027);
    expect(nextEggDayYear(Date.parse('2027-07-14T15:59:00Z'))).toBe(2027);
    expect(nextEggDayYear(Date.parse('2027-07-14T16:00:00Z'))).toBe(2028);
  });
});

describe('telling an Egg Day deadline from any other', () => {
  it('knows the exact moment, and nothing else', async () => {
    const { eggDayYearOf } = await import('./eggDay');
    expect(eggDayYearOf(eggDaySeconds(2027))).toBe(2027);
    expect(eggDayYearOf(eggDaySeconds(2027) + 60)).toBeNull();
  });
});

describe('sameClock: the planner\'s time line only when it says something new (UX review 26 Oct 2026, item 14)', () => {
  const at = eggDaySeconds(2027);
  it('Pacific and its twins read the same; other zones do not', () => {
    expect(sameClock(at, 'America/Los_Angeles')).toBe(true);
    expect(sameClock(at, 'America/Vancouver')).toBe(true);
    expect(sameClock(at, 'America/Denver')).toBe(false);
    expect(sameClock(at, 'Asia/Tokyo')).toBe(false);
    expect(sameClock(at, 'Europe/London', 'Europe/London')).toBe(true);
  });
  it('an unknown zone reads as different (the line stays)', () => {
    expect(sameClock(at, 'Not/AZone')).toBe(false);
  });
  it("DeadlinePanel: the planner's time line goes through it, against the zone the date was given in", () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../components/auto/DeadlinePanel.vue'), 'utf8');
    expect(src).toContain(`<template v-if="deadline && !sameClock(deadline, plannerZone, zone)"`);
    expect(src).toContain("That is {{ plural(Math.round(daysAway), 'day') }} after the plan starts.");
  });
});
