import { describe, expect, it } from 'vitest';
import { dayClockWords, dayWords, eventWhen, eventWhenText, relativeWords } from './eventWhen';

const ZONE = 'America/Denver';
/** 2026-10-15 14:00 in Denver (MDT, UTC-6) = 20:00 UTC. */
const NOW = Date.UTC(2026, 9, 15, 20, 0, 0) / 1000;
const at = (h: number, m = 0, dayOffset = 0) => NOW + dayOffset * 86400 + (h - 14) * 3600 + m * 60;

describe('eventWhen', () => {
  it('today, with the clock and the distance', () => {
    expect(eventWhenText(at(15, 20), NOW, ZONE)).toBe('today at 3:20 pm, in 1 h 20 m');
    expect(eventWhenText(at(14, 40), NOW, ZONE)).toBe('today at 2:40 pm, in 40 min');
    expect(eventWhenText(at(11, 5), NOW, ZONE)).toBe('today at 11:05 am, 2 h 55 m ago');
  });

  it('tomorrow and yesterday are calendar days in the zone, not 24-hour windows', () => {
    expect(eventWhenText(at(9, 0, 1), NOW, ZONE)).toBe('tomorrow at 9:00 am, in 19 h');
    expect(eventWhenText(at(1, 0, 1), NOW, ZONE)).toBe('tomorrow at 1:00 am, in 11 h');
    expect(eventWhenText(at(23, 0), NOW, ZONE)).toBe('today at 11:00 pm, in 9 h');
    expect(eventWhen(at(22, 0, -1), NOW, ZONE)?.day).toBe('yesterday');
  });

  it('later days say the date and the days away; the year only when it differs', () => {
    expect(eventWhenText(at(16, 0, 2), NOW, ZONE)).toBe('Oct 17 at 4:00 pm, in 2 days');
    const eggDay = Date.UTC(2027, 6, 14, 17, 25, 0) / 1000; // 11:25 am Denver
    expect(eventWhenText(eggDay, NOW, ZONE)).toBe('Jul 14, 2027 at 11:25 am, in 271 days');
    const sameYear = Date.UTC(2026, 11, 20, 6, 25, 0) / 1000; // Dec 19, 11:25 pm Denver
    expect(eventWhen(sameYear, NOW, ZONE)?.day).toBe('Dec 19');
  });

  it('a different zone moves the day', () => {
    // 14:00 UTC on the 15th is 8 am today in Denver, but 11 pm the day before "now" in Tokyo (where it is already the 16th).
    const t = Date.UTC(2026, 9, 15, 14, 0, 0) / 1000;
    expect(eventWhen(t, NOW, 'America/Denver')?.day).toBe('today');
    expect(eventWhen(t, NOW, 'Asia/Tokyo')?.day).toBe('yesterday');
  });

  it('unknown or broken input gives nothing, never a crash', () => {
    expect(eventWhenText(null, NOW, ZONE)).toBe('');
    expect(eventWhenText(undefined, NOW, ZONE)).toBe('');
    expect(eventWhenText(NaN, NOW, ZONE)).toBe('');
    expect(eventWhenText(NOW + 60, NOW, 'Not/AZone')).toBe('');
  });
});

describe('relativeWords', () => {
  it('rounds the way a person says it', () => {
    expect(relativeWords(20)).toBe('now');
    expect(relativeWords(-30)).toBe('now');
    expect(relativeWords(90 * 60)).toBe('in 1 h 30 m');
    expect(relativeWords(3600)).toBe('in 1 h');
    expect(relativeWords(3600 * 18)).toBe('in 18 h');
    expect(relativeWords(3599)).toBe('in 60 min');
    // Under two days: hours, not "1 day" (16 Oct).
    expect(relativeWords(86400)).toBe('in 24 h');
    expect(relativeWords(33 * 3600)).toBe('in 33 h');
    expect(relativeWords(-30 * 3600)).toBe('30 h ago');
    expect(relativeWords(2 * 86400 - 1)).toBe('in 48 h');
    expect(relativeWords(2 * 86400)).toBe('in 2 days');
    expect(relativeWords(86400 * 2 + 5000)).toBe('in 2 days');
    expect(relativeWords(-3 * 3600)).toBe('3 h ago');
    expect(relativeWords(-86400 * 3)).toBe('3 days ago');
  });
});

describe('dateAt and agoLong', () => {
  it('always the date, the weekday when asked, the year only when it differs', async () => {
    const { dateAt } = await import('./eventWhen');
    expect(dateAt(at(14, 36), NOW, ZONE)).toBe('Oct 15 at 2:36 pm');
    expect(dateAt(at(16, 0), NOW, ZONE, true)).toBe('Thu, Oct 15 at 4:00 pm');
    expect(dateAt(Date.UTC(2027, 6, 13, 23, 14) / 1000, NOW, ZONE, true)).toBe('Tue, Jul 13, 2027 at 5:14 pm');
    expect(dateAt(null, NOW, ZONE)).toBe('');
  });

  it('says how long ago in words', async () => {
    const { agoLong } = await import('./eventWhen');
    expect(agoLong(30)).toBe('just now');
    expect(agoLong(60)).toBe('1 minute ago');
    expect(agoLong(45 * 60)).toBe('45 minutes ago');
    expect(agoLong(3 * 3600 + 100)).toBe('3 hours ago');
    expect(agoLong(3 * 86400)).toBe('3 days ago');
  });
});

describe('dayWords (Jordan, 24 Oct 2026: "Feb 10, 2027", never "10 Feb 2027")', () => {
  it('month first, the day, then the year, always with the year, in the zone', () => {
    // Feb 10, 2027, 9:00 am in Denver (MST, UTC-7).
    const feb10 = Date.UTC(2027, 1, 10, 16, 0) / 1000;
    expect(dayWords(feb10, ZONE)).toBe('Feb 10, 2027');
    expect(dayWords(NOW, ZONE)).toBe('Oct 15, 2026');
    // 11 pm in Denver is the next day in UTC: the zone's day.
    expect(dayWords(Date.UTC(2027, 1, 11, 6, 0) / 1000, ZONE)).toBe('Feb 10, 2027');
  });

  it("'' when unknown", () => {
    expect(dayWords(null, ZONE)).toBe('');
    expect(dayWords(Number.NaN, ZONE)).toBe('');
  });
});

describe('dayClockWords: the day with its year, then the 12-hour clock', () => {
  it('"Feb 10, 2027 at 9:00 am", in the zone', () => {
    expect(dayClockWords(Date.UTC(2027, 1, 10, 16, 0) / 1000, ZONE)).toBe('Feb 10, 2027 at 9:00 am');
    expect(dayClockWords(Date.UTC(2027, 1, 11, 6, 5) / 1000, ZONE)).toBe('Feb 10, 2027 at 11:05 pm');
    expect(dayClockWords(Date.UTC(2026, 9, 10, 0, 0) / 1000, 'UTC')).toBe('Oct 10, 2026 at 12:00 am');
  });
  it("'' when unknown", () => {
    expect(dayClockWords(null, ZONE)).toBe('');
    expect(dayClockWords(Number.NaN, ZONE)).toBe('');
  });
});
