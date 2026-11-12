import { describe, expect, it } from 'vitest';
import { clockTimeOf, formatClockRange, formatClockTime, inTimeStyle } from './timeStyleWords';

describe('the one time style (Jordan, 12 Nov 2026): "8:00 AM", minutes and capitals always', () => {
  it('every hour of the day, whole hours with ":00"', () => {
    const all = Array.from({ length: 24 }, (_, h) => formatClockTime(h));
    expect(all).toEqual([
      '12:00 AM',
      '1:00 AM',
      '2:00 AM',
      '3:00 AM',
      '4:00 AM',
      '5:00 AM',
      '6:00 AM',
      '7:00 AM',
      '8:00 AM',
      '9:00 AM',
      '10:00 AM',
      '11:00 AM',
      '12:00 PM',
      '1:00 PM',
      '2:00 PM',
      '3:00 PM',
      '4:00 PM',
      '5:00 PM',
      '6:00 PM',
      '7:00 PM',
      '8:00 PM',
      '9:00 PM',
      '10:00 PM',
      '11:00 PM',
    ]);
  });
  it('minutes, wrapped hours, a zone label', () => {
    expect(formatClockTime(9, 5)).toBe('9:05 AM');
    expect(formatClockTime(15, 7)).toBe('3:07 PM');
    expect(formatClockTime(24)).toBe('12:00 AM');
    expect(formatClockTime(-1)).toBe('11:00 PM');
    expect(formatClockTime(9.9)).toBe('9:00 AM');
    expect(formatClockTime(9, 0, { zone: 'PT' })).toBe('9:00 AM PT');
  });
  it('a range: "7:00 AM–1:00 AM", or with " to " for a sentence', () => {
    expect(formatClockRange(7, 1)).toBe('7:00 AM–1:00 AM');
    expect(formatClockRange(9, 23, { sep: ' to ' })).toBe('9:00 AM to 11:00 PM');
    expect(formatClockRange(0, 12, { zone: 'PT' })).toBe('12:00 AM–12:00 PM PT');
  });
  it('an instant in a zone, rounded down to its minute', () => {
    const at = Date.UTC(2026, 10, 12, 22, 0, 59); // 2:00:59 PM PST
    expect(clockTimeOf(at, 'America/Los_Angeles')).toBe('2:00 PM');
    expect(clockTimeOf(Date.UTC(2026, 10, 12, 3, 7), 'UTC')).toBe('3:07 AM');
    expect(clockTimeOf(Date.UTC(2026, 10, 12, 0, 0), 'UTC')).toBe('12:00 AM');
    expect(clockTimeOf(Date.UTC(2026, 10, 12, 12, 30), 'Not/AZone')).toBe('12:30 PM');
    expect(clockTimeOf(NaN, 'UTC')).toBe('');
  });
  it("an Intl formatter's text put into the style", () => {
    expect(inTimeStyle('14 Jul 2026, 09:00 am')).toBe('14 Jul 2026, 9:00 AM');
    expect(inTimeStyle('14 Jul, 9:47\u202fpm')).toBe('14 Jul, 9:47 PM');
    expect(inTimeStyle('Feb 23, 2027, 7 PM')).toBe('Feb 23, 2027, 7:00 PM');
    expect(inTimeStyle('9 p.m. and 12:15 a.m.')).toBe('9:00 PM and 12:15 AM');
    expect(inTimeStyle('Oct 24 at 9:47 PM')).toBe('Oct 24 at 9:47 PM');
    expect(inTimeStyle('14 Jul 2026')).toBe('14 Jul 2026');
    expect(inTimeStyle('2 amber eggs')).toBe('2 amber eggs');
  });
});
