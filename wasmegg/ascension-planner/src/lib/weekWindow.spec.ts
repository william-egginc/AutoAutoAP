/**
 * R10 weekly hours: how a 168-hour awake mask is RECORDED on a run (notes/r10-mask-record-2026-11-21.md).
 *
 * The run record keeps one text, `window` (collector: at most 64 characters, part of the row fingerprint). Old rows hold
 * the single-window text of describeAvailability ("every day 07:00-23:00 America/Denver"); those must read exactly as
 * before. A mask that one daily window cannot say is written as "wk:" + 28 characters + " " + the zone, no new field and
 * no collector change. FAILING FIRST: lib/weekWindow.ts does not exist yet. Placeholders only, no player IDs.
 *
 * The mask here is `boolean[168]` AWAKE, MONDAY first (Joo's order): index = day * 24 + hour, day 0 = Monday .. 6 = Sunday,
 * true = awake. Reliability's Availability.blocked (r10-core e5591fd34) is the inverse with the same indexing; the ONE
 * inversion is `awakeFromBlocked` below. A week with nothing blocked or everything blocked is no schedule (null).
 */
import { describe, expect, it } from 'vitest';
import {
  awakeFromBlocked,
  decodeWeekMask,
  encodeWeekMask,
  parseWeekWindow,
  weekWindowText,
  windowHours,
} from './weekWindow';
import { contentFingerprint, type BoardRow } from './leaderboardRank';
import { NO_FILTERS, facetsOf, filterOptions, hoursLabel, hoursTitle, inFilters, parseWindow } from './planFilters';
import { availabilityKey, describeAvailability, maskOfWindow } from '../search/availabilitySchedule';
import { rowSetup } from './currentAnswer';
import { hoursShort, hoursWords, pricedWithLine } from './pricedWith';
import { rowHoursWords } from './myRunsDashboard';
import { inDeadlineFilter } from './leaderboardRank';
import { inMyRunsFilters, DEFAULT_MY_RUNS_FILTERS } from './myRuns';

const DENVER = 'America/Denver';
const NONE = Array<boolean>(168).fill(false);
const ALL = Array<boolean>(168).fill(true);

/** Mask from "day (0 = Mon) -> awake hours" rules. */
function mask(rule: (day: number, hour: number) => boolean): boolean[] {
  return Array.from({ length: 168 }, (_, i) => rule(Math.floor(i / 24), i % 24));
}
const splitDay = mask((_d, h) => (h >= 7 && h < 9) || (h >= 18 && h < 22)); // morning and evening, every day
const work = mask((d, h) => d < 5 && h >= 9 && h < 17); // 9-5 weekdays
const workish = mask((d, h) => d < 5 && h >= 9 && h < 18); // not the same as `work`

describe('the code: 21 bytes, 168 bits, 28 base64url characters', () => {
  it('is 28 characters of the URL-safe alphabet, no padding', () => {
    expect(encodeWeekMask(splitDay)).toMatch(/^[A-Za-z0-9_-]{28}$/);
    expect(encodeWeekMask(ALL)).toMatch(/^[A-Za-z0-9_-]{28}$/);
    expect(encodeWeekMask(NONE)).toBe('A'.repeat(28));
  });
  it('pins the bit order: index 0 (Monday 00:00) is the low bit of byte 0, index 167 (Sunday 23:00) the high bit of byte 20', () => {
    expect(encodeWeekMask(mask((d, h) => d === 0 && h === 0)).slice(0, 4)).toBe('AQAA');
    expect(encodeWeekMask(mask((d, h) => d === 6 && h === 23)).slice(-4)).toBe('AACA');
  });
  it('round-trips every kind of mask', () => {
    for (const m of [NONE, ALL, splitDay, work, workish]) expect(decodeWeekMask(encodeWeekMask(m))).toEqual(m);
  });
  it('reads anything else as null: wrong length, padding, other characters, not text', () => {
    const good = encodeWeekMask(work);
    for (const bad of [good.slice(1), good + 'A', good.slice(0, 27) + '=', good.slice(0, 27) + '+', '', ' ' + good.slice(1), null, 5, undefined])
      expect(decodeWeekMask(bad as never)).toBeNull();
  });
  it('refuses a mask that is not 168 booleans', () => {
    expect(() => encodeWeekMask(ALL.slice(1))).toThrow();
    expect(() => encodeWeekMask([...ALL, true])).toThrow();
  });
});

describe('weekWindowText: the one text the record keeps', () => {
  it('is null for a mask that rules nothing out (the run is recorded with no schedule, as today)', () => {
    expect(weekWindowText(ALL, DENVER)).toBeNull();
  });
  it('is null for a week with NO awake hour too: no schedule, never "never available" (Reliability, 21 Nov; the client never sends one)', () => {
    expect(weekWindowText(NONE, DENVER)).toBeNull();
  });
  it('writes a mask one daily window can say in the OLD words, so old and new clients agree and the fingerprint does not move', () => {
    expect(weekWindowText(mask((_d, h) => h >= 7 && h < 23), DENVER)).toBe(`every day 07:00-23:00 ${DENVER}`);
    expect(weekWindowText(mask((_d, h) => h >= 9 || h < 1), 'UTC')).toBe('every day 09:00-01:00 UTC');
    expect(weekWindowText(work, DENVER)).toBe(`Mon,Tue,Wed,Thu,Fri 09:00-17:00 ${DENVER}`);
  });
  it('reads a day list on a wrapping window as the session-start day, as isAvailable does', () => {
    // Fri and Sat 18:00-02:00: Friday night runs into Saturday 01:00, Saturday night into Sunday 01:00.
    const m = mask((d, h) => (h >= 18 && (d === 4 || d === 5)) || (h < 2 && (d === 5 || d === 6)));
    expect(weekWindowText(m, 'UTC')).toBe('Sat,Fri 18:00-02:00 UTC'.replace('Sat,Fri', 'Fri,Sat'));
  });
  it('writes anything else as "wk:" + the 28-character code + " " + the zone', () => {
    const text = weekWindowText(splitDay, DENVER)!;
    expect(text).toBe(`wk:${encodeWeekMask(splitDay)} ${DENVER}`);
    expect(text.startsWith('wk:')).toBe(true);
  });
  it('is the same text for the same mask and a different text for a different one (the fingerprint reads it)', () => {
    expect(weekWindowText(splitDay, DENVER)).toBe(weekWindowText([...splitDay], DENVER));
    expect(weekWindowText(splitDay, DENVER)).not.toBe(weekWindowText(splitDay, 'America/Chicago'));
    // work and workish are both single daily windows on weekdays: legacy text, different hours.
    expect(weekWindowText(work, DENVER)).not.toBe(weekWindowText(workish, DENVER));
    const odd = mask((d, h) => (d === 2 && h === 5) || (d === 3 && h >= 10 && h < 12));
    const odd2 = mask((d, h) => (d === 2 && h === 6) || (d === 3 && h >= 10 && h < 12));
    expect(weekWindowText(odd, DENVER)).not.toBe(weekWindowText(odd2, DENVER));
  });
  it('fits the collector\'s 64 characters for every zone the browser knows, and for the longest IANA name (32 characters)', () => {
    const zones = [...Intl.supportedValuesOf('timeZone'), 'America/Argentina/ComodRivadavia'];
    for (const z of zones) expect(weekWindowText(splitDay, z)!.length).toBeLessThanOrEqual(64);
    expect(`wk:${encodeWeekMask(splitDay)} America/Argentina/ComodRivadavia`).toHaveLength(64);
  });
  it('holds nothing but the mask and the zone: no ID, no name', () => {
    expect(weekWindowText(splitDay, DENVER)).not.toMatch(/EI\d|\d{16}/);
  });
});

describe('reading a window back', () => {
  it('parseWeekWindow reads the new text to its mask and zone, and nothing else', () => {
    expect(parseWeekWindow(`wk:${encodeWeekMask(splitDay)} ${DENVER}`)).toEqual({ hours: splitDay, timezone: DENVER });
    expect(parseWeekWindow(`wk:${encodeWeekMask(splitDay)}`)).toEqual({ hours: splitDay, timezone: '' });
    for (const bad of [`every day 07:00-23:00 ${DENVER}`, 'wk:short UTC', `wk:${'!'.repeat(28)} UTC`, `wk:${encodeWeekMask(NONE)} UTC`, '', null, 'nonsense'])
      expect(parseWeekWindow(bad as never)).toBeNull();
  });
  it('windowHours reads an OLD single-window text to the same mask isAvailable would give', () => {
    expect(windowHours(`every day 07:00-23:00 ${DENVER}`)).toEqual(mask((_d, h) => h >= 7 && h < 23));
    expect(windowHours('every day all day UTC')).toEqual(ALL);
    expect(windowHours(`Mon,Tue,Wed,Thu,Fri 09:00-17:00 ${DENVER}`)).toEqual(work);
    expect(windowHours('Fri,Sat 18:00-02:00 UTC')).toEqual(
      mask((d, h) => (h >= 18 && (d === 4 || d === 5)) || (h < 2 && (d === 5 || d === 6)))
    );
  });
  it('windowHours reads the new text too, and null for no schedule or text it cannot read', () => {
    expect(windowHours(`wk:${encodeWeekMask(splitDay)} ${DENVER}`)).toEqual(splitDay);
    for (const none of [null, undefined, '', 'nonsense', 'wk:short UTC']) expect(windowHours(none)).toBeNull();
  });
  it('writing then reading is the identity for any mask that has an awake hour', () => {
    for (const m of [splitDay, work, workish, mask((d, h) => d % 2 === 0 && h % 3 === 0)]) {
      expect(windowHours(weekWindowText(m, DENVER))).toEqual(m);
    }
  });
});

describe('old readers and old rows keep working (R9 planFilters, currentAnswer, myRuns, leaderboardRank)', () => {
  const NEW = `wk:${encodeWeekMask(splitDay)} ${DENVER}`;
  const OLD = `every day 07:00-23:00 ${DENVER}`;
  const base = (window: string | null): BoardRow =>
    ({
      chain: [223, 490],
      durationDays: 10,
      finalTE: 490,
      startLocal: '2026-10-03 08:00',
      timezone: DENVER,
      window,
    }) as BoardRow;

  it('parseWindow still reads every old text exactly as before, and does NOT claim the new text (it is not one daily window)', () => {
    expect(parseWindow(OLD)).toEqual({ days: [], fromHour: 7, toHour: 23, timezone: DENVER });
    expect(parseWindow('Mon,Sat 09:00-01:00 UTC')).toEqual({ days: [1, 6], fromHour: 9, toHour: 1, timezone: 'UTC' });
    expect(parseWindow('every day all day UTC')).toEqual({ days: [], fromHour: 0, toHour: 0, timezone: 'UTC' });
    expect(parseWindow(NEW)).toBeNull();
    expect(parseWindow(null)).toBeNull();
  });
  it('the Leaderboard and My Runs hours lines say "Custom weekly hours" for the new text, and the old words are unchanged', () => {
    expect(hoursLabel(NEW)).toBe('Custom weekly hours');
    expect(hoursLabel(OLD)).toBe('7:00 AM–11:00 PM');
    expect(hoursLabel(null)).toBe('Any hour');
    // Words, 21 Nov: the hover says what it holds, in the grid's words, and never shows the wk: text.
    expect(hoursTitle(NEW)).toBe(`Awake hours that differ by day: 42 hours a week you can play, in ${DENVER}.`);
    const one = `wk:${encodeWeekMask(mask((d, h) => d === 2 && h === 5))} ${DENVER}`;
    expect(hoursTitle(one)).toBe(`Awake hours that differ by day: 1 hour a week you can play, in ${DENVER}.`);
    for (const t of [hoursLabel(NEW), hoursTitle(NEW), hoursTitle(one)]) expect(t).not.toContain('wk:');
    expect(hoursLabel(NEW)).not.toMatch(/awake|blocked/i);
  });
  it('the Leaderboard hours filter has ONE "Custom weekly hours" choice for every mask (Words, 21 Nov), never under "Any hour" (the empty value)', () => {
    const other = `wk:${encodeWeekMask(mask((_d, h) => h >= 6 && h < 9))} ${DENVER}`;
    const rows = [base(NEW), base(other), base(OLD), base(null)];
    const key = facetsOf(rows[0], DENVER).hours;
    expect(key).not.toBe('');
    expect(facetsOf(rows[1], DENVER).hours).toBe(key); // two different masks, one filter value
    expect(key).not.toBe(facetsOf(rows[2], DENVER).hours);
    expect(key).not.toContain('wk:');
    const opts = filterOptions(rows, DENVER).hours;
    expect(opts.map(o => o.label).sort()).toEqual(['7:00 AM–11:00 PM', 'Any hour', 'Custom weekly hours']);
    expect(opts.find(o => o.value === key)!.title).toBe('Awake hours that differ by day.'); // no count, no zone
    expect(opts.find(o => o.value === '')!.label).toBe('Any hour');
    const f = { ...NO_FILTERS, hours: key };
    expect(rows.filter(r => inFilters(r, f, DENVER))).toEqual([rows[0], rows[1]]);
    // the row's own hover is where two masks are told apart
    expect(hoursTitle(rows[0].window)).not.toBe(hoursTitle(rows[1].window));
  });
  it('a row recorded with a mask gives its setup back (the zone and the hours), where an unreadable text gives null', () => {
    const s = rowSetup({ window: NEW });
    expect(s).not.toBeNull();
    expect(s!.availability!.timezone).toBe(DENVER);
    expect(s!.availability!.blocked).toEqual(splitDay.flatMap((a, i) => (a ? [] : [i]))); // Availability.blocked
    expect(rowSetup({ window: 'nonsense' })).toBeNull();
    expect(rowSetup({ window: OLD })!.availability).toMatchObject({ days: [], fromHour: 7, toHour: 23, timezone: DENVER });
  });
  it('the awake / any-hour filters count a mask row as an awake-hours row', () => {
    const awake = { ...DEFAULT_MY_RUNS_FILTERS, hours: 'awake' as const };
    const any = { ...DEFAULT_MY_RUNS_FILTERS, hours: 'any' as const };
    const EGG_DAY = 1_815_840_000;
    expect(inMyRunsFilters(base(NEW), awake, EGG_DAY)).toBe(true);
    expect(inMyRunsFilters(base(NEW), any, EGG_DAY)).toBe(false);
    expect(inDeadlineFilter(base(NEW), { hours: 'awake' })).toBe(true);
    expect(inDeadlineFilter(base(NEW), { hours: 'any' })).toBe(false);
  });
  it('the fingerprint tells two masks apart, and is the old fingerprint for an old text', () => {
    const other = `wk:${encodeWeekMask(mask((_d, h) => h >= 6 && h < 9))} ${DENVER}`;
    expect(contentFingerprint(base(NEW))).not.toBe(contentFingerprint(base(other)));
    expect(contentFingerprint(base(NEW))).toBe(contentFingerprint(base(NEW)));
    expect(contentFingerprint(base(OLD))).toContain(JSON.stringify(OLD));
  });
});

describe('awakeFromBlocked: the one inversion with Availability.blocked', () => {
  it('turns blocked indices (0-167, Monday first) into the awake array, each index once, in any order', () => {
    expect(awakeFromBlocked([])).toEqual(ALL);
    expect(awakeFromBlocked(Array.from({ length: 168 }, (_, i) => i))).toEqual(NONE);
    expect(awakeFromBlocked([0, 167])).toEqual(mask((d, h) => !((d === 0 && h === 0) || (d === 6 && h === 23))));
    expect(awakeFromBlocked([5, 0, 5])).toEqual(awakeFromBlocked([0, 5]));
  });
  it('ignores entries that are not whole numbers 0-167', () => {
    expect(awakeFromBlocked([-1, 168, 0.5, Number.NaN, 7])).toEqual(awakeFromBlocked([7]));
  });
  it('is the inverse of the indices a mask blocks', () => {
    const blocked = (m: boolean[]) => m.flatMap((a, i) => (a ? [] : [i]));
    for (const m of [splitDay, work, workish]) expect(awakeFromBlocked(blocked(m))).toEqual(m);
  });
});

describe('a mask made from a legacy window writes today\'s describeAvailability text (Reliability\'s pin 2)', () => {
  // The legacy rule (search/availability.ts isAvailable): in the hours, and on a chosen day, where a window past midnight
  // belongs to the day it STARTED.
  const maskOf = (days: number[], from: number, to: number) => {
    const wraps = from > to;
    return Array.from({ length: 168 }, (_, i) => {
      const d = Math.floor(i / 24); // Monday first
      const sun = (d + 1) % 7; // our weekday, Sunday = 0
      const h = i % 24;
      const inHours = from === to || (wraps ? h >= from || h < to : h >= from && h < to);
      const day = wraps && h < to ? (sun + 6) % 7 : sun;
      return inHours && (!days.length || days.length === 7 || days.includes(day));
    });
  };
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = (days: number[], from: number, to: number, tz: string) => {
    const pad = (h: number) => `${String(h).padStart(2, '0')}:00`;
    const d = [...days].sort((a, b) => a - b);
    return `${!d.length || d.length === 7 ? 'every day' : d.map(x => DAYS[x]).join(',')} ${from === to ? 'all day' : `${pad(from)}-${pad(to)}`} ${tz}`;
  };
  const cases: [number[], number, number][] = [
    [[], 7, 23], [[], 23, 7], [[], 9, 1], [[1, 2, 3, 4, 5], 9, 17], [[0, 6], 8, 22], [[5, 6], 18, 2], [[5], 22, 6],
    [[1, 3], 0, 0], [[0, 1, 2, 3, 4, 5, 6], 6, 22], [[6, 0], 20, 4],
  ];
  it.each(cases)('days %j, %i to %i', (days, from, to) => {
    const expected = days.length && days.length < 7 || from !== to ? today(days, from, to, DENVER) : null;
    expect(weekWindowText(maskOf(days, from, to), DENVER)).toBe(expected);
  });
  it('every day, all day is no schedule (null), and all day on chosen days keeps the day list', () => {
    expect(weekWindowText(maskOf([], 0, 0), DENVER)).toBeNull();
    expect(weekWindowText(maskOf([1, 3], 5, 5), DENVER)).toBe(`Mon,Wed all day ${DENVER}`);
  });
});

describe('one text with Reliability\'s describeAvailability (needs their wiring: r10-core plus this file)', () => {
  const blocked = (m: boolean[]) => m.flatMap((a, i) => (a ? [] : [i]));
  const sched = (m: boolean[]) => ({ days: [], fromHour: 0, toHour: 0, timezone: DENVER, blocked: blocked(m) });
  it('a mask that is not one daily window reads as the wk: text; one that is keeps the old words and key', () => {
    expect(describeAvailability(sched(splitDay))).toBe(weekWindowText(splitDay, DENVER));
    const daily = mask((_d, h) => h >= 7 && h < 23);
    const a = { days: [], fromHour: 7, toHour: 23, timezone: DENVER, blocked: blocked(daily) };
    expect(describeAvailability(a)).toBe(`every day 07:00-23:00 ${DENVER}`);
    expect(availabilityKey(a)).toBe(availabilityKey({ days: [], fromHour: 7, toHour: 23, timezone: DENVER }));
    expect(describeAvailability(sched(ALL))).toBe('any time');
    expect(describeAvailability(sched(NONE))).toBe('any time');
  });
});

describe('what players read for a custom week (Words, 21 Nov)', () => {
  const a = { days: [], fromHour: 0, toHour: 0, timezone: DENVER, blocked: splitDay.flatMap((x, i) => (x ? [] : [i])) };
  it('"Priced with custom weekly hours, no time off": never the window the mask was made from, never wk:', () => {
    expect(hoursWords(a)).toBe('custom weekly hours');
    expect(hoursShort(a)).toBe('custom weekly hours');
    expect(pricedWithLine({ availability: a, timeOff: [] })).toBe('Priced with custom weekly hours, no time off');
  });
  it('a mask that is one daily window still reads in the old words', () => {
    const daily = { days: [], fromHour: 7, toHour: 23, timezone: DENVER, blocked: mask((_d, h) => !(h >= 7 && h < 23)).flatMap((x, i) => (x ? [i] : [])) };
    expect(hoursWords(daily)).toBe('awake hours 7:00 AM to 11:00 PM');
    expect(hoursShort(daily)).toBe('7:00 AM–11:00 PM');
  });
  it('My Runs says "custom weekly hours" for a mask row, never the wk: code', () => {
    expect(rowHoursWords({ window: `wk:${encodeWeekMask(splitDay)} ${DENVER}` } as BoardRow)).toBe('custom weekly hours');
  });
});

describe('this file reads a daily window as Reliability\'s maskOfWindow does (r10-core e5591fd34)', () => {
  const DAYSETS: number[][] = [[], [0, 1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5], [0, 6], [5], [5, 6], [0], [3, 4]];
  it('every from/to, with several day lists: the same week, and the text round-trips', () => {
    for (const days of DAYSETS)
      for (let from = 0; from < 24; from++)
        for (let to = 0; to < 24; to++) {
          const theirs = awakeFromBlocked(maskOfWindow(days, from, to));
          const text = describeAvailability({ days, fromHour: from, toHour: to, timezone: 'UTC' });
          if (text === 'any time') expect(theirs).toEqual(ALL);
          else expect(windowHours(text)).toEqual(theirs);
          // the text a week writes for itself is that same text
          expect(weekWindowText(theirs, 'UTC')).toBe(theirs.every(Boolean) ? null : text);
        }
  });
});
