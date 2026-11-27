/**
 * ONE HOURS FORMAT (Jordan, 23 Nov 2026: "standardize that, and add it to the cloud sync"). The week as lib/weekWindow.ts's
 * 28-character code (+ the zone) is what Setup, follow rows and run records all carry; `blocked` (the 168-hour list) stays
 * beside it for clients already out. Reads week first, then blocked; equality is by the week itself, never by the words.
 */
import { describe, expect, it } from 'vitest';
import { awakeFromBlocked, encodeWeekMask } from './weekWindow';
import { blockedOfWeekCode, sameWeek, weekCodeOfBlocked } from './hoursCodec';
import { maskOfWindow } from '@/search/availabilitySchedule';

// Awake 7 AM to 1 AM every day, as Jordan's Setup holds it, but with his Saturday morning free until 9.
const daily = maskOfWindow([], 7, 1);
const odd = [...new Set([...daily, 5 * 24 + 7, 5 * 24 + 8])].sort((a, b) => a - b); // Saturday 7 and 8 AM also blocked

describe('week code and blocked list are the same week', () => {
  it('round trips both ways', () => {
    const code = weekCodeOfBlocked(odd)!;
    expect(code).toMatch(/^[A-Za-z0-9_-]{28}$/);
    expect(blockedOfWeekCode(code)).toEqual(odd);
    expect(code).toBe(encodeWeekMask(awakeFromBlocked(odd)));
  });
  it('no schedule (nothing blocked, or every hour blocked) has no code', () => {
    expect(weekCodeOfBlocked([])).toBeNull();
    expect(weekCodeOfBlocked(Array.from({ length: 168 }, (_, i) => i))).toBeNull();
    expect(blockedOfWeekCode(encodeWeekMask(Array(168).fill(true)))).toBeNull();
  });
  it('a bad code reads as nothing, never as a week', () => {
    for (const bad of ['', 'short', 'x'.repeat(29), null, undefined, 7, '!'.repeat(28)]) expect(blockedOfWeekCode(bad)).toBeNull();
  });
  it('repeats and out-of-range entries in a blocked list do not change the week', () => {
    expect(weekCodeOfBlocked([...odd, odd[0], 200, -1, 3.5])).toBe(weekCodeOfBlocked(odd));
  });
});

describe('sameWeek: equal when the hours are, whatever carries them', () => {
  const code = weekCodeOfBlocked(odd)!;
  it('a code and its blocked list, with the zone', () => {
    expect(sameWeek({ week: code, timezone: 'America/Denver' }, { blocked: odd, timezone: 'America/Denver' })).toBe(true);
  });
  it('another week or another zone is not the same', () => {
    expect(sameWeek({ week: code, timezone: 'America/Denver' }, { blocked: daily, timezone: 'America/Denver' })).toBe(false);
    expect(sameWeek({ week: code, timezone: 'America/Denver' }, { week: code, timezone: 'America/New_York' })).toBe(false);
  });
  it('week wins over blocked when both are there', () => {
    expect(sameWeek({ week: code, blocked: daily, timezone: 'UTC' }, { blocked: odd, timezone: 'UTC' })).toBe(true);
  });
  it('no schedule on both sides is the same; one with and one without is not', () => {
    expect(sameWeek({}, { blocked: [] })).toBe(true);
    expect(sameWeek({ week: code, timezone: 'UTC' }, {})).toBe(false);
  });
});
