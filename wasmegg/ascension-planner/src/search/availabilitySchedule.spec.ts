/**
 * availabilitySchedule.ts exists so the Chain Explorer can ask "does this run have a schedule?"
 * without bundling lib/events' Pacific-time table. These pin the two things that make that work.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as schedule from './availabilitySchedule';
import * as availability from './availability';

describe('availabilitySchedule', () => {
  it('imports nothing but lib/weekWindow, which imports nothing, so it can never drag lib/events (or its table) into a page', () => {
    // R10 (21 Nov 2026): the collector's `window` text for weekly hours is lib/weekWindow.ts's, a pure module.
    const source = readFileSync(new URL('./availabilitySchedule.ts', import.meta.url), 'utf8');
    const imports = (source.match(/^\s*import\s.*$/gm) ?? []).map(l => l.trim());
    expect(imports).toEqual(["import { awakeFromBlocked, weekWindowText } from '@/lib/weekWindow';"]);
    const week = readFileSync(new URL('../lib/weekWindow.ts', import.meta.url), 'utf8');
    expect(week).not.toMatch(/^\s*import\s/m);
  });

  it('is what availability.ts re-exports, so the planner and the Explorer share one definition', () => {
    expect(availability.isConstrained).toBe(schedule.isConstrained);
    expect(availability.describeAvailability).toBe(schedule.describeAvailability);
    expect(availability.availabilityKey).toBe(schedule.availabilityKey);
    expect(availability.fromSleepHours).toBe(schedule.fromSleepHours);
  });

  it('drops day numbers that are not weekdays', () => {
    expect(schedule.validDays({ days: [0, 6, 7, -1, 2.5, 3], fromHour: 7, toHour: 23, timezone: 'UTC' })).toEqual([
      0, 6, 3,
    ]);
  });
});
