import { describe, expect, it } from 'vitest';
import type { PlanEvent } from './nowPlan';
import { eventTitle, howFar, nextStepText, whenAgo } from './nowWords';

const ZONE = 'America/Denver';
const NOW = Date.UTC(2026, 9, 15, 20, 40) / 1000; // Thu Oct 15, 2:40 PM Denver
const ev = (o: Partial<PlanEvent>): PlanEvent => ({ kind: 'shift', at: NOW, asc: 1, past: false, next: false, ...o });

describe('the Right now card’s words', () => {
  it('titles', () => {
    expect(eventTitle({ kind: 'shift', egg: 'humility' }, 'fastest')).toBe('Shift to Humility');
    expect(eventTitle({ kind: 'prestige', te: 198 }, 'fastest')).toBe('Prestige at 198 TE');
    expect(eventTitle({ kind: 'goal', te: 248 }, 'date', 'Egg Day 2027')).toBe('Egg Day 2027 goal: 248 TE');
    expect(eventTitle({ kind: 'goal', te: 490 }, 'fastest')).toBe('490 TE reached');
  });

  it('how far, with the day word for today and tomorrow', () => {
    expect(howFar(ev({ at: NOW + 80 * 60 }), NOW, ZONE)).toBe('today, in 1h 20m');
    expect(howFar(ev({ at: NOW + 18 * 3600 + 35 * 60 }), NOW, ZONE)).toBe('tomorrow, in 18h 35m');
    expect(howFar(ev({ at: NOW + 2 * 86400 }), NOW, ZONE)).toBe('in 2d');
    expect(howFar(ev({ at: NOW + 271 * 86400, kind: 'goal', spareHours: 16.8 }), NOW, ZONE)).toBe('in 271d · 16h 48m spare');
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
    expect(t).toBe('Shift to Humility today at 4:00 PM (in 1h 20m), then Kindness tomorrow at 9:15 AM');
    expect(nextStepText([], 'fastest', NOW, ZONE)).toBe('');
  });

  it('calculated when, and how long ago', () => {
    expect(whenAgo(NOW - 2 * 3600, NOW, ZONE)).toBe('Oct 15 at 12:40 PM (2h ago)');
  });
});

describe('the Setup button’s line', () => {
  const HOURS = { fromHour: 7, toHour: 23, days: [0, 1, 2, 3, 4, 5, 6], timezone: 'UTC' } as never;
  const L = 'en-US';
  it('hours and none: today’s wording, no "no prestige" part', async () => {
    const { setupSummary } = await import('./nowWords');
    expect(setupSummary(HOURS, [], [], L)).toBe('7 AM–11 PM · no time off');
    expect(setupSummary(null, null, null, L)).toBe('any hour · no time off');
    expect(setupSummary(HOURS, [], undefined, L)).toBe('7 AM–11 PM · no time off');
  });
  it('one stretch of time off and one no prestige day', async () => {
    const { setupSummary } = await import('./nowWords');
    expect(setupSummary(HOURS, [{ from: '2026-10-29', to: '2026-10-30' }], [{ from: '2026-10-27', to: '2026-10-27' }], L)).toBe(
      '7 AM–11 PM · time off Oct 29–30 · no prestige Oct 27'
    );
    expect(setupSummary(null, [{ from: '2026-10-20', to: '2026-10-22' }], [], L)).toBe('any hour · time off Oct 20–22');
    expect(setupSummary(null, [], [{ from: '2026-11-03', to: '2026-11-04' }], L)).toBe('any hour · no time off · no prestige Nov 3–4');
  });
  it('two stretches, then three as "+1 more"', async () => {
    const { setupSummary } = await import('./nowWords');
    const two = [
      { from: '2026-11-03', to: '2026-11-03' },
      { from: '2026-10-29', to: '2026-10-30' },
    ];
    expect(setupSummary(HOURS, two, two, L)).toBe('7 AM–11 PM · time off Oct 29–30, Nov 3 · no prestige Oct 29–30, Nov 3');
    const three = [...two, { from: '2026-12-01', to: '2026-12-02' }];
    expect(setupSummary(HOURS, three, three, L)).toBe(
      '7 AM–11 PM · time off Oct 29–30, Nov 3 +1 more · no prestige Oct 29–30, Nov 3 +1 more'
    );
  });
  it('across months and years; half-typed rows left out', async () => {
    const { setupSummary, stretchWords } = await import('./nowWords');
    expect(stretchWords({ from: '2026-10-29', to: '2026-11-02' }, L)).toBe('Oct 29 – Nov 2');
    expect(stretchWords({ from: '2026-12-30', to: '2027-01-02' }, L)).toBe('Dec 30, 2026 – Jan 2, 2027');
    expect(stretchWords({ from: '2026-10-27', to: '2026-10-27' }, L)).toBe('Oct 27');
    expect(setupSummary(null, [{ from: '2026-10-29', to: '' }], [{ from: '2026-11-05', to: '2026-11-01' }], L)).toBe('any hour · no time off');
  });
  it('in the browser’s format: a 24-hour clock and day-first dates', async () => {
    const { setupSummary } = await import('./nowWords');
    const days = { fromHour: 7, toHour: 23, days: [1, 2, 3, 4, 5], timezone: 'UTC' } as never;
    expect(setupSummary(days, [{ from: '2026-10-29', to: '2026-10-30' }], [{ from: '2026-10-27', to: '2026-10-27' }], 'en-GB')).toBe(
      '7:00–23:00 on Mon–Fri · time off 29–30 Oct · no prestige 27 Oct'
    );
    expect(setupSummary(days, [], [], 'en-US')).toBe('7 AM–11 PM on Mon–Fri · no time off');
  });
});

describe('roundToHourIn: the instant answer times to the hour on the player clock (not UTC)', () => {
  const minutesIn = (at: number, zone: string) =>
    new Intl.DateTimeFormat('en-US', { timeZone: zone, minute: 'numeric', second: 'numeric' }).format(new Date(at * 1000));
  it('a +5:30 zone (India): 2:47 PM local rounds to 3:00 PM local, not to UTC hour (which is :30 there)', async () => {
    const { roundToHourIn } = await import('./nowWords');
    const at = Date.UTC(2026, 9, 23, 9, 17) / 1000; // 2:47 PM in Asia/Kolkata
    const r = roundToHourIn(at, 'Asia/Kolkata');
    expect(r).toBe(Date.UTC(2026, 9, 23, 9, 30) / 1000); // 3:00 PM local
    expect(minutesIn(r, 'Asia/Kolkata')).toMatch(/^0?0:00$/);
    // 2:12 PM local rounds down to 2:00 PM.
    expect(roundToHourIn(Date.UTC(2026, 9, 23, 8, 42) / 1000, 'Asia/Kolkata')).toBe(Date.UTC(2026, 9, 23, 8, 30) / 1000);
  });
  it('a -3:30 zone (Newfoundland in January)', async () => {
    const { roundToHourIn } = await import('./nowWords');
    const at = Date.UTC(2027, 0, 12, 13, 5) / 1000; // 9:35 AM NST
    const r = roundToHourIn(at, 'America/St_Johns');
    expect(r).toBe(Date.UTC(2027, 0, 12, 13, 30) / 1000); // 10:00 AM NST
  });
  it('across the autumn DST change: 1:40 AM PDT rounds to the next hour on the clock', async () => {
    const { roundToHourIn } = await import('./nowWords');
    const at = Date.UTC(2026, 10, 1, 8, 40) / 1000; // Nov 1, 1:40 AM PDT
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
