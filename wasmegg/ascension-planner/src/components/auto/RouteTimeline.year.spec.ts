/**
 * A timeline that runs into the next calendar year gives every date its year (18 Oct 2026: "reached Dec 8
 * at 7:43 PM" sat beside "Jan 3, 2027 at …"). One decision per route; otherwise this year's dates stay bare.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import RouteTimeline from './RouteTimeline.vue';
import { showWhen, spansYears } from '@/lib/displayTime';
import { routeTimeline, timelineMoments } from '@/search/routeTimeline';
import type { LegSummary } from '@/search/types';

const H = 3600;
const ZONE = 'America/Chicago';
const NOW = Date.parse('2026-10-15T17:00:00Z');
// Dec 8 2026, 7:43 PM Chicago.
const DEC8 = Date.parse('2026-12-09T01:43:00Z') / 1000;
const JAN3 = Date.parse('2027-01-03T21:00:00Z') / 1000;

const leg = (start: number, end: number, endTE: number): LegSummary => ({
  key: '1-sale',
  endTE,
  durationSeconds: end - start,
  maxELR: 1,
  startTime: start,
  endTime: end,
  tier13Unlocked: false,
  shifts: [{ at: start + 2 * H, egg: 'integrity', fromEgg: 'curiosity', te: 41 }],
  endEgg: { egg: 'integrity', te: 45 },
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('the year on a timeline', () => {
  it('showWhen: the year only off this year, or always when asked', () => {
    expect(showWhen(DEC8, ZONE, 'local', NOW / 1000)).toBe('Dec 8, 7:43 PM');
    expect(showWhen(DEC8, ZONE, 'local', NOW / 1000, true)).toBe('Dec 8, 2026, 7:43 PM');
    expect(showWhen(JAN3, ZONE, 'local', NOW / 1000)).toBe('Jan 3, 2027, 3:00 PM');
    expect(showWhen(JAN3, ZONE, 'local', NOW / 1000, true)).toBe('Jan 3, 2027, 3:00 PM');
  });

  it('spansYears reads the planner zone (Dec 31 evening in Chicago is Jan 1 in UTC)', () => {
    const nye = Date.parse('2027-01-01T03:00:00Z') / 1000; // Dec 31, 9:00 PM Chicago
    expect(spansYears([DEC8, nye], ZONE)).toBe(false);
    expect(spansYears([DEC8, nye], 'UTC')).toBe(true);
    expect(spansYears([DEC8, JAN3, null], ZONE)).toBe(true);
    expect(spansYears([], ZONE)).toBe(false);
  });

  it('a route from December into January: every date has its year, also in a one-ascension view', async () => {
    const legs = [leg(DEC8 - 40 * H, DEC8, 230), leg(DEC8, JAN3, 248)];
    expect(spansYears(timelineMoments(routeTimeline([230, 248], legs)), ZONE)).toBe(true);
    const t = textOf(await renderHtml(RouteTimeline, { chain: [230, 248], legs, zone: ZONE, open: true }));
    expect(t).toContain('A1 → 230 TE · reached Dec 8, 2026, 7:43 PM');
    expect(t).toContain('A2 → 248 TE · reached Jan 3, 2027, 3:00 PM');
    expect(t).not.toMatch(/Dec \d+ at/);
    const one = textOf(await renderHtml(RouteTimeline, { chain: [230, 248], legs, zone: ZONE, only: 0, open: true }));
    expect(one).toContain('reached Dec 8, 2026, 7:43 PM');
  });

  it('a route inside this year keeps the bare dates', async () => {
    const legs = [leg(DEC8 - 80 * H, DEC8 - 40 * H, 230), leg(DEC8 - 40 * H, DEC8, 248)];
    const t = textOf(await renderHtml(RouteTimeline, { chain: [230, 248], legs, zone: ZONE, open: true }));
    expect(t).toContain('A2 → 248 TE · reached Dec 8, 7:43 PM');
    expect(t).not.toContain('2026');
  });
});
