import { describe, expect, it } from 'vitest';
import { showDateTime, showHour, showSchedule } from './displayTime';
import { formatHourOfDay, formatMoment } from './clock';

describe('dates and hours as the player reads them', () => {
  const t = Date.UTC(2027, 2, 18, 17, 15) / 1000; // 11:15 in Denver
  it('ISO when asked, to the minute, in the plan zone', () => {
    expect(showDateTime(t, 'America/Denver', 'iso')).toBe('2027-03-18 11:15');
    expect(showHour(9, 'iso')).toBe('09:00');
  });
  it("otherwise the browser's format through the one clock, with the month spelled out (lib/clock.ts)", () => {
    expect(showDateTime(t, 'America/Denver', 'local')).toBe(formatMoment(t * 1000, { zone: 'America/Denver' }));
    expect(showDateTime(t, 'America/Denver', 'local')).toMatch(/Mar/);
    expect(showHour(9, 'local')).toBe(formatHourOfDay(9));
    expect(showDateTime(Date.UTC(2040, 0, 1) / 1000, 'UTC', 'local', { dateOnlyWhenFar: true })).toBe(
      formatMoment(Date.UTC(2040, 0, 1), { zone: 'UTC', dateOnly: true })
    );
  });
  it('says when the hours run past midnight', () => {
    expect(showSchedule({ days: [], fromHour: 9, toHour: 1, timezone: 'America/Denver' }, 'iso')).toBe(
      'every day, 09:00 to 01:00 (next day) (America/Denver)'
    );
    expect(showSchedule({ days: [1, 3], fromHour: 8, toHour: 22, timezone: 'UTC' }, 'iso')).toBe(
      'Mon, Wed, 08:00 to 22:00 (UTC)'
    );
  });
});

describe('a calendar day', () => {
  it('spells the month out, or stays ISO', async () => {
    const { showDay } = await import('./displayTime');
    expect(showDay('2026-09-29', 'iso')).toBe('2026-09-29');
    expect(showDay('2026-09-29', 'local')).toBe(formatMoment(Date.UTC(2026, 8, 29), { zone: 'UTC', dateOnly: true }));
  });
});
