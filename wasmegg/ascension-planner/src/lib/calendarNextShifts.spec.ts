/**
 * The calendar for a PRODUCING player (Jordan's own test, 14 Nov 2026): nothing to buy, so the Build-up tracker is `notBuilding` and has no lines,
 * and the feed stayed empty. The Next shifts list (lib/nextAction.ts `nextShifts`) still knows the shifts and the prestige, so those go up as the
 * calendar's lines (lib/calendarNextShifts.ts), with the marker.
 */
import { describe, expect, it } from 'vitest';
import { calLinesFromNextShifts } from './calendarNextShifts';
import { buildCalendarEvents } from './calendarFeedEvents';
import type { NextShiftLine } from './nextAction';

const NOW = 1_800_000_000; // seconds
const DAY = 86_400;
const list: NextShiftLine[] = [
  { kind: 'shift', egg: 'kindness', at: NOW + 3 * DAY, exact: true },
  { kind: 'shift', egg: 'integrity', at: NOW + 5 * DAY, exact: true },
  { kind: 'prestige', at: NOW + 9 * DAY, te: 222, exact: true },
];

describe('the Next shifts become calendar lines', () => {
  it('a shift is "shift to <Egg>", a prestige is a prestige; each stands alone (checkIn -1) and can be done', () => {
    const lines = calLinesFromNextShifts(list);
    expect(lines.map(l => l.kind)).toEqual(['shift', 'shift', 'prestige']);
    expect(lines[0]!.text).toMatch(/^shift to /i);
    expect(lines.every(l => l.checkIn === -1 && l.tickable)).toBe(true);
    expect(lines.map(l => l.at)).toEqual(list.map(l => l.at));
  });
  it('lines that are not a shift or a prestige (building up, goal, time off, back) are left out', () => {
    const lines = calLinesFromNextShifts([
      { kind: 'build', at: NOW + 100, exact: true },
      { kind: 'timeoff', at: NOW + 200, te: 5, exact: true },
      { kind: 'goal', at: NOW + 300, te: 490, exact: true },
      ...list,
    ]);
    expect(lines).toHaveLength(3);
  });
  it('keys are stable when a time moves (the calendar updates the same entry), and different for two shifts to one egg', () => {
    const a = calLinesFromNextShifts(list).map(l => l.key);
    const moved = calLinesFromNextShifts(list.map(l => ({ ...l, at: l.at + 3600 }))).map(l => l.key);
    expect(moved).toEqual(a);
    const twice = calLinesFromNextShifts([
      { kind: 'shift', egg: 'humility', at: NOW + DAY, exact: true },
      { kind: 'shift', egg: 'humility', at: NOW + 2 * DAY, exact: true },
    ]).map(l => l.key);
    expect(new Set(twice).size).toBe(2);
  });
  it('none: no lines', () => {
    expect(calLinesFromNextShifts([])).toEqual([]);
    expect(calLinesFromNextShifts(null)).toEqual([]);
  });
});

describe('Producing, nothing to buy: the feed has the marker, the next shifts in the window and the prestige', () => {
  const out = buildCalendarEvents({ now: NOW * 1000, ascensionStart: 0, lines: calLinesFromNextShifts(list), ticks: new Set(), zone: 'America/Denver' });
  it('the marker comes first', () => {
    expect(out.events.some(e => e.uid === 'asof' && /^Plan last updated/.test(e.title))).toBe(true);
  });
  it('the two shifts and the prestige are events at their times', () => {
    const shifts = out.events.filter(e => e.kind === 'shift');
    expect(shifts.map(e => e.title)).toEqual([expect.stringMatching(/^Shift to /), expect.stringMatching(/^Shift to /)]);
    expect(shifts.map(e => e.start)).toEqual([(NOW + 3 * DAY) * 1000, (NOW + 5 * DAY) * 1000]);
    const p = out.events.filter(e => e.kind === 'prestige');
    expect(p).toHaveLength(1);
    expect(p[0]!.start).toBe((NOW + 9 * DAY) * 1000);
    expect(p[0]!.title).toBe('Ascend');
  });
  it('no buys', () => {
    expect(out.events.some(e => e.kind === 'buy')).toBe(false);
  });
});

describe('My runs hands the stand-ins over only when the tracker is notBuilding', () => {
  it('MyRunsView passes the Next shifts as fallbackLines, gated on notBuilding (never while the tracker is just working)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../components/MyRunsView.vue', import.meta.url), 'utf8');
    expect(src).toMatch(/fallbackLines:\s*computed\(\(\) => \(tracker\.state\.value === 'notBuilding' \? calLinesFromNextShifts\(page\.nextShiftLines\.value\) : null\)\)/);
  });
});
