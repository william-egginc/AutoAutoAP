/**
 * THE TIME STYLE (lib/timeStyleWords.ts). Jordan, 12 Nov 2026: "9:00 AM", minutes always; 13 Nov 2026: each person's own
 * device settings / Setup options, not a forced "9:00 AM". So: the locale's own short time (en-US "9:00 AM", en-GB
 * "09:00", de-DE "09:00", ja-JP "9:00", en-AU "9:00 am"), and Setup's ISO choice "09:00". The en-US cases force en-US.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { clockTimeOf, formatClockRange, formatClockTime, inTimeStyle } from './timeStyleWords';
import { dateStyle } from './displayTime';
import { hoursShort, hoursWords } from './pricedWith';
import { setupSummary } from './nowWords';

const US = { locale: 'en-US', iso: false } as const;

describe('en-US (forced): "8:00 AM", minutes and capitals always (Jordan, 12 Nov 2026)', () => {
  it('every hour of the day, whole hours with ":00"', () => {
    const all = Array.from({ length: 24 }, (_, h) => formatClockTime(h, 0, US));
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
    expect(formatClockTime(9, 5, US)).toBe('9:05 AM');
    expect(formatClockTime(15, 7, US)).toBe('3:07 PM');
    expect(formatClockTime(24, 0, US)).toBe('12:00 AM');
    expect(formatClockTime(-1, 0, US)).toBe('11:00 PM');
    expect(formatClockTime(9.9, 0, US)).toBe('9:00 AM');
    expect(formatClockTime(9, 0, { ...US, zone: 'PT' })).toBe('9:00 AM PT');
  });
  it('a range: "7:00 AM–1:00 AM", or with " to " for a sentence', () => {
    expect(formatClockRange(7, 1, US)).toBe('7:00 AM–1:00 AM');
    expect(formatClockRange(9, 23, { ...US, sep: ' to ' })).toBe('9:00 AM to 11:00 PM');
    expect(formatClockRange(0, 12, { ...US, zone: 'PT' })).toBe('12:00 AM–12:00 PM PT');
  });
  it('an instant in a zone, rounded down to its minute', () => {
    const at = Date.UTC(2026, 10, 12, 22, 0, 59); // 2:00:59 PM PST
    expect(clockTimeOf(at, 'America/Los_Angeles', US)).toBe('2:00 PM');
    expect(clockTimeOf(Date.UTC(2026, 10, 12, 3, 7), 'UTC', US)).toBe('3:07 AM');
    expect(clockTimeOf(Date.UTC(2026, 10, 12, 0, 0), 'UTC', US)).toBe('12:00 AM');
    expect(clockTimeOf(Date.UTC(2026, 10, 12, 12, 30), 'Not/AZone', US)).toBe('');
    expect(clockTimeOf(NaN, 'UTC', US)).toBe('');
  });
  it("an Intl formatter's text put into the style", () => {
    expect(inTimeStyle('14 Jul 2026, 09:00 am', US)).toBe('14 Jul 2026, 9:00 AM');
    expect(inTimeStyle('14 Jul, 9:47\u202fpm', US)).toBe('14 Jul, 9:47 PM');
    expect(inTimeStyle('Feb 23, 2027, 7 PM', US)).toBe('Feb 23, 2027, 7:00 PM');
    expect(inTimeStyle('9 p.m. and 12:15 a.m.', US)).toBe('9:00 PM and 12:15 AM');
    expect(inTimeStyle('Oct 24 at 9:47 PM', US)).toBe('Oct 24 at 9:47 PM');
    expect(inTimeStyle('14 Jul 2026', US)).toBe('14 Jul 2026');
    expect(inTimeStyle('2 amber eggs', US)).toBe('2 amber eggs');
  });
});

describe("each person's own style (Jordan, 13 Nov 2026): the locale's short time, 24-hour where the locale is", () => {
  const cases: [string, string, string, string][] = [
    // locale, 9:00, 21:05, midnight
    ['en-US', '9:00 AM', '9:05 PM', '12:00 AM'],
    ['en-GB', '09:00', '21:05', '00:00'],
    ['de-DE', '09:00', '21:05', '00:00'],
    ['ja-JP', '9:00', '21:05', '0:00'],
    ['en-AU', '9:00 am', '9:05 pm', '12:00 am'],
  ];
  it.each(cases)('%s: whole hours keep their minutes', (locale, nine, late, midnight) => {
    const o = { locale, iso: false };
    expect(formatClockTime(9, 0, o)).toBe(nine);
    expect(formatClockTime(21, 5, o)).toBe(late);
    expect(formatClockTime(0, 0, o)).toBe(midnight);
    expect(formatClockRange(9, 21, o)).toBe(`${nine}–${formatClockTime(21, 0, o)}`);
    expect(clockTimeOf(Date.UTC(2026, 10, 12, 21, 5, 59), 'UTC', o)).toBe(late);
    // PT labels: the zone's own wall clock, the label after.
    expect(formatClockTime(9, 0, { ...o, zone: 'PT' })).toBe(`${nine} PT`);
    expect(clockTimeOf(Date.UTC(2026, 10, 12, 17, 0), 'America/Los_Angeles', o)).toBe(nine);
    // An en-GB 12-hour Intl text (the Leaderboard's dates) in this locale's style.
    expect(inTimeStyle('14 Jul 2026, 9:00 am', o)).toBe(`14 Jul 2026, ${nine}`);
  });
  it("Setup's \"Show dates as\" ISO choice: the fixed 24-hour time for everyone who picked it", () => {
    expect(formatClockTime(9, 0, { locale: 'en-US', iso: true })).toBe('09:00');
    expect(formatClockRange(21, 1, { locale: 'en-US', iso: true })).toBe('21:00–01:00');
    expect(clockTimeOf(Date.UTC(2026, 10, 12, 22, 7), 'America/Los_Angeles', { locale: 'en-US', iso: true })).toBe('14:07');
  });
});

describe('the ISO choice read from Setup (lib/displayTime.ts dateStyle)', () => {
  afterEach(() => {
    dateStyle.value = 'local';
  });
  it('unset `iso` follows it', () => {
    dateStyle.value = 'iso';
    expect(formatClockTime(21, 0, { locale: 'en-US' })).toBe('21:00');
    dateStyle.value = 'local';
    expect(formatClockTime(21, 0, { locale: 'en-US' })).toBe('9:00 PM');
  });
});

describe('readbacks: built from the numbers, so a 24-hour locale works', () => {
  const a = { fromHour: 7, toHour: 23, days: [0, 1, 2, 3, 4, 5, 6], timezone: 'UTC' } as never;
  it('hoursShort and hoursWords in each locale', () => {
    expect(hoursShort(a, 'en-US')).toBe('7:00 AM–11:00 PM');
    expect(hoursShort(a, 'en-GB')).toBe('07:00–23:00');
    expect(hoursShort(a, 'de-DE')).toBe('07:00–23:00');
    expect(hoursWords(a, 'en-GB')).toBe('awake hours 07:00 to 23:00');
  });
  it("Setup's summary line: \"7:00 AM–11:00 PM\" in en-US, \"07:00–23:00\" in en-GB and de-DE", () => {
    expect(setupSummary(a, [], null, 'en-US').split(' · ')[0]).toBe('7:00 AM–11:00 PM');
    expect(setupSummary(a, [], null, 'en-GB').split(' · ')[0]).toBe('07:00–23:00');
    expect(setupSummary(a, [], null, 'de-DE').split(' · ')[0]).toBe('07:00–23:00');
    expect(setupSummary(a, [], null, 'ja-JP').split(' · ')[0]).toBe('7:00–23:00');
  });
});
