/** The hours and time off a result was priced with, in words (lib/pricedWith.ts). */
import { describe, expect, it } from 'vitest';
import { hour12, hoursWords, pricedWithLine, timeOffWords } from './pricedWith';

const tz = 'America/Denver';
const every = [0, 1, 2, 3, 4, 5, 6];

describe('pricedWithLine', () => {
  it('your hours, 12-hour with am/pm, and no time off', () => {
    expect(pricedWithLine({ availability: { days: every, fromHour: 9, toHour: 1, timezone: tz }, timeOff: [] })).toBe(
      'Priced with awake hours 9 am to 1 am, no time off'
    );
  });

  it('weekdays only, and time off', () => {
    expect(
      pricedWithLine({
        availability: { days: [1, 2, 3, 4, 5], fromHour: 9, toHour: 23, timezone: tz },
        timeOff: [{ from: '2026-10-20', to: '2026-10-22' }],
      })
    ).toBe('Priced with awake hours 9 am to 11 pm on Mon–Fri, time off Oct 20–22');
  });

  it('nothing set: any hour, no time off', () => {
    expect(pricedWithLine({ availability: null, timeOff: undefined })).toBe('Priced with any hour, no time off');
    // Every day and every hour rules nothing out: the search reads it as no schedule.
    expect(hoursWords({ days: every, fromHour: 7, toHour: 7, timezone: tz })).toBe('any hour');
  });

  it('hours: noon and midnight, and days as runs', () => {
    expect([0, 11, 12, 13, 23].map(hour12)).toEqual(['12 am', '11 am', '12 pm', '1 pm', '11 pm']);
    expect(hoursWords({ days: [0, 6], fromHour: 10, toHour: 22, timezone: tz })).toBe(
      'awake hours 10 am to 10 pm on Sun, Sat'
    );
    expect(hoursWords({ days: [1, 3, 4, 5], fromHour: 8, toHour: 20, timezone: tz })).toBe(
      'awake hours 8 am to 8 pm on Mon, Wed–Fri'
    );
    expect(hoursWords({ days: [6], fromHour: 5, toHour: 5, timezone: tz })).toBe('awake hours all day on Sat');
  });

  it('time off: one day, across months and years, several, and half-typed rows left out', () => {
    expect(
      timeOffWords([
        { from: '2026-11-03', to: '2026-11-03' },
        { from: '2026-10-30', to: '2026-11-02' },
        { from: '2026-12-30', to: '2027-01-02' },
        { from: '2026-12-01', to: '' },
      ])
    ).toBe('time off Oct 30–Nov 2, Nov 3, Dec 30, 2026–Jan 2, 2027');
  });
});
