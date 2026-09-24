import { describe, expect, it } from 'vitest';
import { describeTimeOff, nextDate, timeOffWindows, usableTimeOff } from './timeOff';
import { getLocalTimestampInTimezone } from '@/lib/events';

const TZ = 'America/Denver';

describe('time off dates', () => {
  it('rolls over months and years without a timezone in sight', () => {
    expect(nextDate('2027-07-14')).toBe('2027-07-15');
    expect(nextDate('2027-07-31')).toBe('2027-08-01');
    expect(nextDate('2027-12-31')).toBe('2028-01-01');
  });

  it('makes Egg Day the whole local day', () => {
    const [w] = timeOffWindows([{ from: '2027-07-14', to: '2027-07-14' }], TZ);
    expect(w.from).toBe(getLocalTimestampInTimezone('2027-07-14', '00:00', TZ));
    expect(w.to).toBe(getLocalTimestampInTimezone('2027-07-15', '00:00', TZ));
  });

  it('ignores half-typed or backwards rows, and merges overlaps', () => {
    expect(usableTimeOff([{ from: '2027-07-14', to: '' }, { from: '2027-07-20', to: '2027-07-18' }])).toEqual([]);
    const ws = timeOffWindows(
      [
        { from: '2027-07-16', to: '2027-07-20' },
        { from: '2027-07-14', to: '2027-07-16' },
      ],
      TZ
    );
    expect(ws).toHaveLength(1);
    expect(ws[0].to).toBe(getLocalTimestampInTimezone('2027-07-21', '00:00', TZ));
  });

  it('reads back plainly', () => {
    expect(describeTimeOff([])).toBe('none');
    expect(describeTimeOff([{ from: '2027-07-14', to: '2027-07-14' }, { from: '2027-08-01', to: '2027-08-07' }])).toBe(
      '2027-07-14; 2027-08-01 to 2027-08-07'
    );
  });
});
