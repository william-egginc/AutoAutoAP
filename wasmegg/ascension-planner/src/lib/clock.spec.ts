/**
 * The one clock (lib/clock.ts, UX review 25 Oct 2026): the browser's own format, the same shape in every panel.
 * Pinned by passing the language, so the result doesn't depend on the machine the specs run on: en-US gives
 * "9:00 AM", de-DE gives "9:00".
 */
import { describe, expect, it } from 'vitest';
import { calendarOf, formatClock, formatHourOfDay, formatMoment, formatWeekday } from './clock';
import { eggDayWords } from './eggDay';
import { boxStartWords } from './boxStartWords';

const EGG_DAY_2027 = Date.UTC(2027, 6, 14, 16, 0); // 9:00 am Pacific (PDT)
const EVENING = Date.UTC(2026, 9, 24, 21, 47); // Sat Oct 24 2026, 9:47 pm UTC
const NOW = Date.UTC(2026, 9, 24, 12, 0);
const LA = 'America/Los_Angeles';
/** ICU puts a narrow no-break space before AM/PM in some versions: read it as a space. */
const sp = (s: string) => s.replace(/[  ]/g, ' ');

describe('formatMoment: the browser’s own format, from the language it is given', () => {
  it('en-US: month first, 12-hour with AM/PM', () => {
    expect(sp(formatMoment(EGG_DAY_2027, { zone: LA, locale: 'en-US' }))).toBe('Jul 14, 2027, 9:00 AM');
    expect(sp(formatMoment(EVENING, { zone: 'UTC', weekday: true, year: 'never', locale: 'en-US' }))).toBe(
      'Sat, Oct 24, 9:47 PM'
    );
    expect(sp(formatMoment(EVENING, { zone: 'UTC', at: true, year: 'auto', now: NOW, locale: 'en-US' }))).toBe(
      'Oct 24 at 9:47 PM'
    );
    expect(sp(formatMoment(EGG_DAY_2027, { zone: 'UTC', year: 'auto', now: NOW, locale: 'en-US' }))).toBe(
      'Jul 14, 2027, 4:00 PM'
    );
    expect(sp(formatMoment(EGG_DAY_2027, { zone: LA, zoneName: true, locale: 'en-US' }))).toBe(
      'Jul 14, 2027, 9:00 AM PDT'
    );
    expect(sp(formatMoment(EGG_DAY_2027, { zone: LA, shortTime: true, year: 'never', locale: 'en-US' }))).toBe(
      'Jul 14, 9 AM'
    );
  });

  it('de-DE: day first, 24-hour', () => {
    expect(formatMoment(EGG_DAY_2027, { zone: LA, locale: 'de-DE' })).toBe('14. Juli 2027, 9:00');
    expect(formatClock(EVENING, 'UTC', 'de-DE')).toBe('21:47');
    expect(formatHourOfDay(9, 'de-DE')).toBe('9:00');
  });

  it('the clock and the hour of the day', () => {
    expect(sp(formatClock(EVENING, 'UTC', 'en-US'))).toBe('9:47 PM');
    expect(sp(formatHourOfDay(0, 'en-US'))).toBe('12:00 AM');
    expect(sp(formatHourOfDay(13, 'en-US'))).toBe('1:00 PM');
    expect(formatWeekday(EVENING, 'UTC', 'en-US')).toBe('Sat');
    expect(calendarOf(EVENING, 'Asia/Tokyo')).toEqual({ year: 2026, ymd: '2026-10-25', hour: 6 });
  });

  it('drops the time of day only when asked and over a year away', () => {
    const far = Date.UTC(2032, 5, 7, 10, 0);
    expect(formatMoment(far, { zone: 'UTC', dateOnlyWhenFar: true, now: NOW, locale: 'en-US' })).toBe('Jun 7, 2032');
    expect(formatMoment(far, { zone: 'UTC', dateOnlyWhenFar: true, now: NOW, locale: 'de-DE' })).toBe('7. Juni 2032');
    expect(sp(formatMoment(far, { zone: 'UTC', now: NOW, locale: 'en-US' }))).toBe('Jun 7, 2032, 10:00 AM');
    // Under a year: the time stays.
    expect(sp(formatMoment(EGG_DAY_2027, { zone: 'UTC', dateOnlyWhenFar: true, now: NOW, locale: 'en-US' }))).toBe(
      'Jul 14, 2027, 4:00 PM'
    );
  });

  it("unreadable: '' (an unknown zone, a moment past what a Date holds)", () => {
    expect(formatMoment(EVENING, { zone: 'Not/AZone' })).toBe('');
    expect(formatMoment(8.64e15 + 1)).toBe('');
    expect(formatClock(NaN)).toBe('');
  });

  it('with no language given, the browser’s (here, this machine’s) own', () => {
    const own = new Intl.DateTimeFormat(undefined, {
      timeZone: LA,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(EGG_DAY_2027);
    expect(formatMoment(EGG_DAY_2027, { zone: LA })).toBe(own);
  });
});

describe('the Egg Day card: one format for Pacific and your time', () => {
  it('Pacific alone when your clock reads the same; your time beside it otherwise', () => {
    expect(sp(eggDayWords(2027, LA, 'en-US'))).toBe('Jul 14, 2027, 9:00 AM Pacific');
    expect(sp(eggDayWords(2027, 'America/Denver', 'en-US'))).toBe('Jul 14, 2027, 9:00 AM Pacific (10:00 AM your time)');
    expect(sp(eggDayWords(2027, 'Asia/Tokyo', 'en-US'))).toBe(
      'Jul 14, 2027, 9:00 AM Pacific (Jul 15, 1:00 AM your time)'
    );
    expect(eggDayWords(2027, 'Europe/Berlin', 'de-DE')).toBe('14. Juli 2027, 9:00 Pacific (18:00 your time)');
  });
  it('the Deadline panel uses it, not a hand-written "14 July … 9:00 AM"', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../components/auto/DeadlinePanel.vue', import.meta.url), 'utf8');
    expect(src).toContain('{{ eggDayWords(eggDayYear, plannerZone) }}');
    expect(src).not.toContain('9:00 AM Pacific. Answers');
  });
});

describe('a start as the boxes hold it (Single run, W3-27)', () => {
  it('reads as every other moment, never the raw box text', () => {
    const local = boxStartWords('2026-10-24 14:30', 'America/Denver', 'local');
    expect(local).toBe(formatMoment(Date.UTC(2026, 9, 24, 20, 30), { zone: 'America/Denver' }));
    expect(local).not.toContain('2026-10-24');
    expect(boxStartWords('2026-10-24 14:30', 'America/Denver', 'iso')).toBe('2026-10-24 14:30');
    expect(boxStartWords('not a start', 'UTC', 'local')).toBe('not a start');
  });
  it('the Single run note uses it for both starts', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../components/auto/AutomaticPlanner.vue', import.meta.url), 'utf8');
    expect(src).toContain('plan starting {{ boxStart(timeOffDroppedFor) }}');
    expect(src).not.toContain('{{ autoPlannerStore.startDate }} {{ autoPlannerStore.startTime }}');
  });
});
