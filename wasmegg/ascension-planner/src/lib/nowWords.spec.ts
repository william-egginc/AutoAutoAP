import { describe, expect, it } from 'vitest';
import type { PlanEvent } from './nowPlan';
import { eventTitle, howFar, nextStepText, whenAgo } from './nowWords';

const ZONE = 'America/Denver';
const NOW = Date.UTC(2026, 9, 15, 20, 40) / 1000; // Thu Oct 15, 2:40 pm Denver
const ev = (o: Partial<PlanEvent>): PlanEvent => ({ kind: 'shift', at: NOW, asc: 1, past: false, next: false, ...o });

describe('the Right now card’s words', () => {
  it('titles', () => {
    expect(eventTitle({ kind: 'shift', egg: 'humility' }, 'fastest')).toBe('Shift to Humility');
    expect(eventTitle({ kind: 'prestige', te: 198 }, 'fastest')).toBe('Prestige at 198 TE');
    expect(eventTitle({ kind: 'goal', te: 248 }, 'date', 'Egg Day 2027')).toBe('Egg Day 2027 goal: 248 TE');
    expect(eventTitle({ kind: 'goal', te: 490 }, 'fastest')).toBe('490 TE reached');
  });

  it('how far, with the day word for today and tomorrow', () => {
    expect(howFar(ev({ at: NOW + 80 * 60 }), NOW, ZONE)).toBe('today, in 1 h 20 m');
    expect(howFar(ev({ at: NOW + 18 * 3600 + 35 * 60 }), NOW, ZONE)).toBe('tomorrow, in 18 h 35 m');
    expect(howFar(ev({ at: NOW + 2 * 86400 }), NOW, ZONE)).toBe('in 2 days');
    expect(howFar(ev({ at: NOW + 271 * 86400, kind: 'goal', spareHours: 16.8 }), NOW, ZONE)).toBe('in 271 days · 16.8 h spare');
    expect(howFar(ev({ past: true }), NOW, ZONE)).toBe('passed');
  });

  it('the next step, then the one after', () => {
    const t = nextStepText(
      [
        ev({ at: NOW - 3600, past: true, egg: 'integrity' }),
        ev({ at: NOW + 80 * 60, egg: 'humility' }),
        ev({ at: NOW + 18 * 3600 + 35 * 60, egg: 'kindness' }),
      ],
      'fastest',
      NOW,
      ZONE
    );
    expect(t).toBe('Shift to Humility today at 4:00 pm (in 1 h 20 m), then Kindness tomorrow at 9:15 am');
    expect(nextStepText([], 'fastest', NOW, ZONE)).toBe('');
  });

  it('calculated when, and how long ago', () => {
    expect(whenAgo(NOW - 2 * 3600, NOW, ZONE)).toBe('Oct 15 at 12:40 pm (2 h ago)');
  });
});

describe('the Setup button’s line', () => {
  it('hours and time off, short', async () => {
    const { setupSummary } = await import('./nowWords');
    expect(setupSummary({ fromHour: 7, toHour: 23, days: [0, 1, 2, 3, 4, 5, 6], timezone: 'UTC' } as never, [])).toBe(
      '7 am–11 pm · no time off'
    );
    expect(setupSummary(null, [{ from: '2026-10-20', to: '2026-10-22' }])).toBe('any hour · time off Oct 20–22');
  });
});

describe('roundToHourIn: the instant answer times to the hour on the player clock (not UTC)', () => {
  const minutesIn = (at: number, zone: string) =>
    new Intl.DateTimeFormat('en-US', { timeZone: zone, minute: 'numeric', second: 'numeric' }).format(new Date(at * 1000));
  it('a +5:30 zone (India): 2:47 pm local rounds to 3:00 pm local, not to UTC hour (which is :30 there)', async () => {
    const { roundToHourIn } = await import('./nowWords');
    const at = Date.UTC(2026, 9, 23, 9, 17) / 1000; // 2:47 pm in Asia/Kolkata
    const r = roundToHourIn(at, 'Asia/Kolkata');
    expect(r).toBe(Date.UTC(2026, 9, 23, 9, 30) / 1000); // 3:00 pm local
    expect(minutesIn(r, 'Asia/Kolkata')).toMatch(/^0?0:00$/);
    // 2:12 pm local rounds down to 2:00 pm.
    expect(roundToHourIn(Date.UTC(2026, 9, 23, 8, 42) / 1000, 'Asia/Kolkata')).toBe(Date.UTC(2026, 9, 23, 8, 30) / 1000);
  });
  it('a -3:30 zone (Newfoundland in January)', async () => {
    const { roundToHourIn } = await import('./nowWords');
    const at = Date.UTC(2027, 0, 12, 13, 5) / 1000; // 9:35 am NST
    const r = roundToHourIn(at, 'America/St_Johns');
    expect(r).toBe(Date.UTC(2027, 0, 12, 13, 30) / 1000); // 10:00 am NST
  });
  it('across the autumn DST change: 1:40 am PDT rounds to the next hour on the clock', async () => {
    const { roundToHourIn } = await import('./nowWords');
    const at = Date.UTC(2026, 10, 1, 8, 40) / 1000; // Nov 1, 1:40 am PDT
    const r = roundToHourIn(at, 'America/Los_Angeles');
    expect(r).toBe(Date.UTC(2026, 10, 1, 9, 0) / 1000);
    expect(minutesIn(r, 'America/Los_Angeles')).toMatch(/^0?0:00$/);
  });
  it('whole-hour zones and UTC as before', async () => {
    const { roundToHourIn } = await import('./nowWords');
    expect(roundToHourIn(Date.UTC(2026, 9, 23, 21, 31) / 1000, 'America/Denver')).toBe(Date.UTC(2026, 9, 23, 22) / 1000);
    expect(roundToHourIn(Date.UTC(2026, 9, 23, 21, 29) / 1000, 'UTC')).toBe(Date.UTC(2026, 9, 23, 21) / 1000);
  });
});
