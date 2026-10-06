import { describe, expect, it } from 'vitest';
import type { BoardRow } from './leaderboardRank';
import {
  NO_FILTERS,
  bestPerGroup,
  effectiveFilters,
  facetsOf,
  filterOptions,
  groupLabel,
  hour12,
  hoursLabel,
  inFilters,
  isFiltered,
  parseSavedFilters,
  parseWindow,
  planFilterBar,
  type PlanFilters,
} from './planFilters';

const CHICAGO = 'America/Chicago';
const DAY = `every day 07:00-23:00 ${CHICAGO}`;
const LATE = `every day 09:00-01:00 ${CHICAGO}`;

/** A run to 490. `start` is Chicago wall-clock time. */
function row(over: Partial<BoardRow> & { start?: string } = {}): BoardRow {
  const { start = '2026-10-03 08:00', ...rest } = over;
  return {
    chain: [223, 282, 316, 490],
    durationDays: 10,
    finalTE: 490,
    timezone: CHICAGO,
    startLocal: start,
    window: DAY,
    ...rest,
  };
}

const ZONE = 'UTC';
const f = (over: Partial<PlanFilters>): PlanFilters => ({ ...NO_FILTERS, ...over });

describe('labels', () => {
  it('reads hours on a 12-hour clock', () => {
    expect(hour12(0)).toBe('12 am');
    expect(hour12(7)).toBe('7 am');
    expect(hour12(12)).toBe('noon');
    expect(hour12(23)).toBe('11 pm');
  });
  it('reads a window back into hours and days', () => {
    expect(parseWindow(DAY)).toEqual({ days: [], fromHour: 7, toHour: 23, timezone: CHICAGO });
    expect(parseWindow('Sat,Sun 09:00-01:00 UTC')).toEqual({ days: [6, 0], fromHour: 9, toHour: 1, timezone: 'UTC' });
    expect(parseWindow('every day all day UTC')).toEqual({ days: [], fromHour: 0, toHour: 0, timezone: 'UTC' });
    expect(parseWindow('whenever')).toBeNull();
  });
  it('names a schedule briefly, days only when restricted', () => {
    expect(hoursLabel(DAY)).toBe('7 am–11 pm');
    expect(hoursLabel('Sat,Sun 09:00-01:00 UTC')).toBe('Sun, Sat 9 am–1 am');
    expect(hoursLabel(null)).toBe('Any hour');
    expect(hoursLabel('every day all day UTC')).toBe('all day');
  });
});

describe('facets', () => {
  it('reads the start on the row’s own clock, not the viewer’s', () => {
    // Saturday 23:00 in Chicago is already Sunday in UTC.
    const x = facetsOf(row({ start: '2026-10-03 23:00' }), ZONE);
    expect(x.day).toBe(6);
    expect(x.part).toBe('evening');
  });
  it('falls back to the viewer zone when the row has none', () => {
    const x = facetsOf(row({ timezone: undefined, startUtc: '2026-10-04T02:00:00Z' }), 'UTC');
    expect(x.day).toBe(0);
    expect(x.part).toBe('night');
  });
  it('reads ascensions, goal and time off', () => {
    const x = facetsOf(row({ deadline: 1_800_000_000, timeOff: [{ from: 'a', to: 'b' }] }), ZONE);
    expect(x).toMatchObject({ ascensions: 4, goal: 'deadline', timeOff: true, hours: 'every day 07:00-23:00' });
    expect(facetsOf(row({ window: null }), ZONE).hours).toBe('');
  });
});

describe('filtering', () => {
  const day = row();
  const late = row({ window: LATE, start: '2026-10-05 14:00' });
  const anyHour = row({ window: null, chain: [253, 316, 490] });

  it('All lets everything through', () => {
    expect([day, late, anyHour].filter(r => inFilters(r, NO_FILTERS, ZONE))).toHaveLength(3);
    expect(isFiltered(NO_FILTERS)).toBe(false);
  });
  it('narrows on each dimension', () => {
    expect(inFilters(late, f({ hours: 'every day 09:00-01:00' }), ZONE)).toBe(true);
    expect(inFilters(day, f({ hours: 'every day 09:00-01:00' }), ZONE)).toBe(false);
    expect(inFilters(anyHour, f({ hours: '' }), ZONE)).toBe(true);
    expect(inFilters(late, f({ day: 1 }), ZONE)).toBe(true);
    expect(inFilters(late, f({ part: 'afternoon' }), ZONE)).toBe(true);
    expect(inFilters(day, f({ part: 'afternoon' }), ZONE)).toBe(false);
    expect(inFilters(anyHour, f({ ascensions: 3 }), ZONE)).toBe(true);
    expect(inFilters(day, f({ goal: 'deadline' }), ZONE)).toBe(false);
    expect(inFilters(day, f({ timeOff: 'without' }), ZONE)).toBe(true);
  });
  it('offers only the values the rows have, Any hour first and Monday first', () => {
    const o = filterOptions([late, day, anyHour], ZONE, 490);
    expect(o.hours.map(h => h.label)).toEqual(['Any hour', '7 am–11 pm', '9 am–1 am']);
    expect(o.day.map(d => d.label)).toEqual(['Mon', 'Sat']);
    expect(o.ascensions.map(a => a.value)).toEqual([3, 4]);
    expect(o.goal.map(g => g.label)).toEqual(['Fastest to 490']);
    expect(o.timeOff.map(t => t.value)).toEqual(['without']);
  });
  it('treats a hidden dimension or a vanished value as All', () => {
    const o = filterOptions([day, late], ZONE, 490);
    const e = effectiveFilters(f({ goal: 'target', ascensions: 4, hours: 'gone', day: 6, groupBy: 'ascensions' }), o);
    // One goal and one route length on these rows: neither is a choice, so neither filters.
    expect(e).toEqual({ ...NO_FILTERS, day: 6 });
  });
});

describe('the best for each', () => {
  it('keeps the first of each group in the order given', () => {
    const a = row({ window: DAY, durationDays: 9 });
    const b = row({ window: LATE, durationDays: 9.5 });
    const c = row({ window: DAY, durationDays: 10 });
    const d = row({ window: null, durationDays: 11 });
    expect(bestPerGroup([a, b, c, d], r => r, 'hours', ZONE)).toEqual([a, b, d]);
    expect(bestPerGroup([a, b, c, d], r => r, 'ascensions', ZONE)).toEqual([a]);
    expect(groupLabel(b, 'hours', ZONE)).toBe('9 am–1 am');
    expect(groupLabel(a, 'day', ZONE)).toBe('Sat');
    expect(groupLabel(a, 'ascensions', ZONE)).toBe('4 ascensions');
  });
});

describe('the My plans bar', () => {
  // Fastest-route plans start Saturday; the answers by a date start Tuesday with 5 ascensions.
  const sat = row({ start: '2026-10-03 08:00' });
  const satLate = row({ start: '2026-10-03 09:00', window: LATE });
  const tue = row({ start: '2026-10-06 08:00', deadline: 1_800_000_000, chain: [223, 282, 316, 400, 490] });
  const wed = row({ start: '2026-10-07 08:00', deadline: 1_800_000_000 });
  const bar = (filters: Partial<PlanFilters>, fastest = [sat, satLate], dated = [tue, wed]) =>
    planFilterBar({ fastest, dated, filters: f(filters), zone: ZONE, target: 490 });

  it("builds the fastest list's chips from the fastest rows only", () => {
    const b = bar({});
    expect(b.list).toBe('target');
    expect(b.options.goal.map(g => g.value)).toEqual(['target', 'deadline']);
    // Tue and Wed are only on the dated answers: not offered for the fastest list.
    expect(b.options.day).toEqual([]);
    expect(b.options.ascensions).toEqual([]);
    expect(b.options.hours.map(h => h.label)).toEqual(['7 am–11 pm', '9 am–1 am']);
    // A remembered Tue is a filter nobody can see there: it hides nothing.
    expect(bar({ day: 2 }).applied.day).toBeNull();
  });
  it("switches to the dated answers' own chips with the Goal chip", () => {
    const b = bar({ goal: 'deadline', day: 2 });
    expect(b.list).toBe('deadline');
    expect(b.options.day.map(d => d.label)).toEqual(['Tue', 'Wed']);
    // Tue chosen: only its 5-ascension answer is left, so ascensions is no choice now.
    expect(b.options.ascensions).toEqual([]);
    expect(bar({ goal: 'deadline' }).options.ascensions.map(a => a.value)).toEqual([4, 5]);
    expect(b.options.hours).toEqual([]);
    expect(b.applied).toMatchObject({ goal: 'deadline', day: 2 });
  });
  it('offers only chips that leave a row, with the other choices kept', () => {
    const sun = row({ start: '2026-10-04 08:00', window: LATE });
    const b = bar({ hours: 'every day 07:00-23:00' }, [sat, satLate, sun]);
    // Only Saturday has the 7 am plan: Sun would leave nothing, so the day is no choice.
    expect(b.options.day).toEqual([]);
    const c = bar({ hours: 'every day 09:00-01:00' }, [sat, satLate, sun]);
    expect(c.options.day.map(d => d.label)).toEqual(['Sat', 'Sun']);
    // A chosen value stays on show, so it can be undone.
    const d = bar({ hours: 'every day 07:00-23:00', day: 6 }, [sat, satLate, sun]);
    expect(d.options.day.map(x => x.label)).toEqual(['Sat']);
    for (const b2 of [b, c, d]) {
      for (const key of ['hours', 'day', 'part', 'ascensions', 'timeOff'] as const) {
        for (const o of b2.options[key]) {
          const rows = [sat, satLate, sun].filter(r => inFilters(r, { ...b2.applied, [key]: o.value }, ZONE));
          expect(rows.length).toBeGreaterThan(0);
        }
      }
    }
  });
  it('hides a "best for each" that would make one group', () => {
    expect(bar({}).groupChoices).toEqual(['hours']);
    // Hours chosen: one hours group left, so grouping by hours is off.
    const b = bar({ hours: 'every day 07:00-23:00', groupBy: 'hours' });
    expect(b.groupChoices).toEqual([]);
    expect(b.applied.groupBy).toBeNull();
    expect(bar({ groupBy: 'day' }).applied.groupBy).toBeNull();
  });
  it('uses the dated answers when there are no plans to the target', () => {
    const b = bar({}, [], [tue, wed]);
    expect(b.list).toBe('deadline');
    expect(b.options.goal).toEqual([]);
    expect(b.options.day.map(d => d.label)).toEqual(['Tue', 'Wed']);
  });
});

describe('remembered filters', () => {
  it('keeps only values of the right kind', () => {
    expect(parseSavedFilters(null)).toEqual(NO_FILTERS);
    expect(parseSavedFilters('not json')).toEqual(NO_FILTERS);
    expect(
      parseSavedFilters(JSON.stringify({ hours: '', day: 9, part: 'dawn', ascensions: 5, groupBy: 'day', goal: 'x' }))
    ).toEqual({ ...NO_FILTERS, hours: '', ascensions: 5, groupBy: 'day' });
  });
});
