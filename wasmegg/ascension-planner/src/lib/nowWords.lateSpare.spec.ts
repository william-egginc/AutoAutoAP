/**
 * M13 item 3 follow-up (12 Nov 2026, QA: Egg Day followed with a typed route, the pill "lands about Sep 20, 2028, after Egg
 * Day starts"): the goal row of a route that lands AFTER the date read "5d 20h spare before this date" (a negative spare
 * said as its size). Said as lateness now: "lands 5d 20h after this date".
 */
import { describe, expect, it } from 'vitest';
import { howFar } from './nowWords';

const NOW = Date.UTC(2026, 10, 12, 20) / 1000;
const goal = (spareHours: number) => ({ at: Date.UTC(2027, 6, 14, 16) / 1000, past: false, kind: 'goal' as const, spareHours, notDone: false });

describe('howFar: a goal row whose route lands after the date', () => {
  it('a negative spare reads as lateness, never as "spare before this date"', () => {
    const t = howFar(goal(-140), NOW, 'America/Denver', true, 'date');
    expect(t).toContain('lands 5d 20h after this date');
    expect(t).not.toMatch(/spare/);
  });
  it('exact times too', () => {
    const t = howFar(goal(-2), NOW, 'America/Denver', false, 'date');
    expect(t).toContain('lands 2h after this date');
    expect(t).not.toMatch(/spare/);
  });
  it('a positive spare is as before', () => {
    expect(howFar(goal(65), NOW, 'America/Denver', true, 'date')).toContain('2d 17h spare before this date, on the instant answer\'s plan');
  });
});
