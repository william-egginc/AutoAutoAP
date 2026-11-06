/**
 * Red team 6 Nov 2026, R2: `getLocalTimestampInTimezone` read the zone's offset at its naive guess (the wall
 * time taken as UTC), which on a daylight-saving change day can be on the other side of the change from the
 * real instant. In the US zones that put a start typed from about 2-3 am to 8-10 am an hour off, both on the
 * spring-forward day and the fall-back day. Now the offset is checked at the instant it gives.
 *
 * Expected instants are written out in UTC by hand. Conventions: a time in the spring-forward gap (02:30,
 * which never happens) moves forward to the same minutes after the change (03:30), as JavaScript's own Date
 * and Temporal's 'compatible' do; a time in the fall-back hour that happens twice (01:30) is the first one.
 */
import { describe, expect, it } from 'vitest';
import {
  getLocalTimestampInTimezone,
  getNextPacificTime,
  getNextSaleStart,
  getNextTimeInTimezone,
  PACIFIC_TIMEZONE,
} from './events';
import { REFERENCE_WEEK } from '@/search/tableBuild';
import { eggDaySeconds } from './eggDay';

const utc = (y: number, mo: number, d: number, h: number, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) / 1000;
const at = (date: string, time: string, tz: string) => getLocalTimestampInTimezone(date, time, tz);

/** The wall time an instant shows in `tz`, as the start boxes write it. */
function wall(t: number, tz: string): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(t * 1000));
  const g = (k: string) => p.find(x => x.type === k)!.value;
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}`;
}

describe('plan start on a US daylight-saving change day (R2)', () => {
  // [date, wall time, the right instant]
  const cases: Record<string, [string, string, number][]> = {
    // Fall back, Sun 1 Nov 2026: MDT (-6) to MST (-7) at 02:00 MDT = 08:00 UTC.
    'America/Denver, 1 Nov 2026': [
      ['2026-10-31', '23:30', utc(2026, 11, 1, 5, 30)],
      ['2026-11-01', '00:59', utc(2026, 11, 1, 6, 59)],
      ['2026-11-01', '01:00', utc(2026, 11, 1, 7, 0)], // the first 1 am (MDT)
      ['2026-11-01', '01:30', utc(2026, 11, 1, 7, 30)], // the first 1:30 (MDT), not the second (08:30 UTC)
      ['2026-11-01', '01:59', utc(2026, 11, 1, 7, 59)],
      ['2026-11-01', '02:00', utc(2026, 11, 1, 9, 0)], // MST from here
      ['2026-11-01', '02:30', utc(2026, 11, 1, 9, 30)],
      ['2026-11-01', '03:00', utc(2026, 11, 1, 10, 0)],
      ['2026-11-01', '07:00', utc(2026, 11, 1, 14, 0)],
      ['2026-11-01', '09:00', utc(2026, 11, 1, 16, 0)],
    ],
    // Fall back, Sun 1 Nov 2026: PDT (-7) to PST (-8) at 02:00 PDT = 09:00 UTC.
    'America/Los_Angeles, 1 Nov 2026': [
      ['2026-11-01', '00:59', utc(2026, 11, 1, 7, 59)],
      ['2026-11-01', '01:00', utc(2026, 11, 1, 8, 0)],
      ['2026-11-01', '01:30', utc(2026, 11, 1, 8, 30)], // the first 1:30 (PDT)
      ['2026-11-01', '01:59', utc(2026, 11, 1, 8, 59)],
      ['2026-11-01', '02:00', utc(2026, 11, 1, 10, 0)], // PST from here
      ['2026-11-01', '03:00', utc(2026, 11, 1, 11, 0)],
      ['2026-11-01', '08:30', utc(2026, 11, 1, 16, 30)],
      ['2026-11-01', '09:00', utc(2026, 11, 1, 17, 0)],
    ],
    // Spring forward, Sun 14 Mar 2027: MST (-7) to MDT (-6) at 02:00 MST = 09:00 UTC.
    'America/Denver, 14 Mar 2027': [
      ['2027-03-13', '23:30', utc(2027, 3, 14, 6, 30)],
      ['2027-03-14', '01:30', utc(2027, 3, 14, 8, 30)],
      ['2027-03-14', '01:59', utc(2027, 3, 14, 8, 59)],
      ['2027-03-14', '02:30', utc(2027, 3, 14, 9, 30)], // never happens: 03:30 MDT
      ['2027-03-14', '03:00', utc(2027, 3, 14, 9, 0)],
      ['2027-03-14', '03:01', utc(2027, 3, 14, 9, 1)],
      ['2027-03-14', '07:00', utc(2027, 3, 14, 13, 0)],
      ['2027-03-14', '09:00', utc(2027, 3, 14, 15, 0)],
    ],
    // Spring forward, Sun 14 Mar 2027: PST (-8) to PDT (-7) at 02:00 PST = 10:00 UTC.
    'America/Los_Angeles, 14 Mar 2027': [
      ['2027-03-14', '01:30', utc(2027, 3, 14, 9, 30)],
      ['2027-03-14', '01:59', utc(2027, 3, 14, 9, 59)],
      ['2027-03-14', '02:30', utc(2027, 3, 14, 10, 30)], // never happens: 03:30 PDT
      ['2027-03-14', '03:00', utc(2027, 3, 14, 10, 0)],
      ['2027-03-14', '03:01', utc(2027, 3, 14, 10, 1)],
      ['2027-03-14', '09:00', utc(2027, 3, 14, 16, 0)],
      ['2027-03-14', '09:59', utc(2027, 3, 14, 16, 59)],
      ['2027-03-14', '10:00', utc(2027, 3, 14, 17, 0)],
    ],
  };
  for (const [name, rows] of Object.entries(cases)) {
    const tz = name.split(',')[0];
    it(name, () => {
      for (const [date, time, want] of rows) expect(at(date, time, tz), `${date} ${time} ${tz}`).toBe(want);
    });
  }

  it('every quarter hour of those days (and the same in New York and Berlin) shows back the time typed', () => {
    const days: [string, string][] = [
      ['America/Denver', '2026-11-01'],
      ['America/Denver', '2027-03-14'],
      ['America/Los_Angeles', '2026-11-01'],
      ['America/Los_Angeles', '2027-03-14'],
      ['America/New_York', '2026-11-01'],
      ['America/New_York', '2027-03-14'],
      ['Europe/Berlin', '2026-10-25'],
      ['Europe/Berlin', '2027-03-28'],
    ];
    for (const [tz, date] of days) {
      const gap = new Set<string>();
      for (let m = 0; m < 24 * 60; m += 15) {
        const time = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        const t = at(date, time, tz);
        const shown = wall(t, tz);
        if (shown === `${date} ${time}`) continue;
        // Only a time in the spring-forward gap may show otherwise: an hour later, the same minutes.
        const later = `${String(Math.floor(m / 60) + 1).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        expect(shown, `${tz} ${date} ${time}`).toBe(`${date} ${later}`);
        gap.add(time);
      }
      expect(gap.size, `${tz} ${date}`).toBeLessThanOrEqual(4);
    }
  });

  it('the repeated hour is the first one in a zone east of UTC too (Berlin, 25 Oct 2026)', () => {
    // CEST (+2) to CET (+1) at 03:00 CEST = 01:00 UTC; 02:30 happens at 00:30 and again at 01:30 UTC.
    expect(at('2026-10-25', '02:30', 'Europe/Berlin')).toBe(utc(2026, 10, 25, 0, 30));
    expect(at('2026-10-25', '03:00', 'Europe/Berlin')).toBe(utc(2026, 10, 25, 2, 0));
    expect(at('2027-03-28', '01:30', 'Europe/Berlin')).toBe(utc(2027, 3, 28, 0, 30));
    expect(at('2027-03-28', '03:30', 'Europe/Berlin')).toBe(utc(2027, 3, 28, 1, 30));
  });

  it('the Manual Planner’s "wait until" hour on those days', () => {
    // From midnight Pacific on the fall-back day, the next 9 am Pacific is 17:00 UTC.
    expect(getNextTimeInTimezone(9, 0, utc(2026, 11, 1, 7), PACIFIC_TIMEZONE)).toBe(utc(2026, 11, 1, 17));
    expect(getNextTimeInTimezone(7, 0, utc(2027, 3, 14, 8), 'America/Denver')).toBe(utc(2027, 3, 14, 13));
  });
});

describe('what R2 does not move', () => {
  it('days without a change, and the fixed Pacific instants the tables and sale calendar use', () => {
    expect(at('2026-11-06', '09:00', 'America/Denver')).toBe(utc(2026, 11, 6, 16));
    expect(at('2026-07-04', '09:00', 'America/Los_Angeles')).toBe(utc(2026, 7, 4, 16));
    expect(at('2026-11-06', '09:00', 'Asia/Tokyo')).toBe(utc(2026, 11, 6, 0));
    expect(at('2026-11-06', '09:00', 'UTC')).toBe(utc(2026, 11, 6, 9));
    // The instant answers' reference week (search/tableBuild.ts, buildTable/cell.ts): 11 Jan 2027, 00:00 PST.
    expect(REFERENCE_WEEK).toBe(utc(2027, 1, 11, 8));
    expect(eggDaySeconds(2027)).toBe(utc(2027, 7, 14, 16));
    // The sale calendar has its own two-pass Pacific table (buildPacificTimeTable), untouched: Friday 9 am Pacific.
    expect(getNextPacificTime(5, 9, utc(2026, 11, 1, 0))).toBe(utc(2026, 11, 6, 17));
    expect(getNextSaleStart(utc(2027, 3, 14, 0))).toBeGreaterThan(0);
  });
});
