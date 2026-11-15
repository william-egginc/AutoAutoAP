import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  buildCalendarEvents,
  CAL_MAX_EVENTS,
  CAL_NOTES_MAX,
  CAL_TITLE_MAX,
  inHours,
  sameCalendar,
  type CalLine,
} from './calendarFeedEvents';

// The collector's own validator (collector/cal.js `readCal`): what the builder makes must be what the collector's `cal` kind
// accepts. The collector's cal.js lives on its own branch until the two merge: point AAAP_COLLECTOR_CAL at it to run the
// contract tests now; they skip when the file is not there.
const calPath = process.env.AAAP_COLLECTOR_CAL ?? fileURLToPath(new URL('../../collector/cal.js', import.meta.url));
const haveCollector = existsSync(calPath);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const readCal: (v: unknown) => any = haveCollector
  ? (await import(/* @vite-ignore */ pathToFileURL(calPath).href)).readCal
  : () => ({});

const NOW = Date.UTC(2026, 10, 15, 23, 10, 0); // 4:10 pm MST
const SEC = Math.floor(NOW / 1000);
const START = 1793000000;
const line = (o: Partial<CalLine> & { key: string }): CalLine => ({
  kind: 'research',
  at: SEC + 3600,
  text: 'buy Grav Plating (17 → 18)',
  tickable: true,
  checkIn: 0,
  ...o,
});
const buy = (i: number, o: Partial<CalLine> = {}): CalLine =>
  line({ key: `${SEC + i * 3600}:0`, at: SEC + i * 3600, checkIn: i, text: `buy Research ${i} (1 → 2)`, ...o });
const real = <T extends { uid: string }>(events: T[]): T[] => events.filter(e => e.uid !== 'asof');
const buildFull = (lines: CalLine[], more: Partial<Parameters<typeof buildCalendarEvents>[0]> = {}) =>
  buildCalendarEvents({ now: NOW, ascensionStart: START, lines, ticks: new Set(), zone: 'America/Denver', ...more });
/** The list without the "Plan last updated" marker, for the tests about the events themselves. */
const build = (lines: CalLine[], more: Partial<Parameters<typeof buildCalendarEvents>[0]> = {}) => {
  const out = buildFull(lines, more);
  return { ...out, events: real(out.events) };
};
const FOOT = 'Planned as of 4:10 PM MST. Open the planner to confirm.';

describe('buildCalendarEvents', () => {
  it('makes one event per check-in, uid from the ascension and the first line key', () => {
    const out = build([
      buy(1),
      line({ key: `${SEC + 3600}:1`, at: SEC + 3600, checkIn: 1, text: 'buy Another (2 → 3)' }),
      buy(2),
    ]);
    expect(out.v).toBe(1);
    expect(out.asOf).toBe(NOW);
    expect(out.events.map(e => e.uid)).toEqual([`${START}:${SEC + 3600}:0`, `${START}:${SEC + 7200}:0`]);
    expect(out.events[0]).toMatchObject({ kind: 'buy', start: (SEC + 3600) * 1000, seq: 0 });
    expect(out.events[0]!.title).toBe('Buy: Research 1 (1 → 2) +1 more');
    expect(out.events[0]!.notes).toBe(`- buy Research 1 (1 → 2)\n- buy Another (2 → 3)\n${FOOT}`);
  });
  it('the kind is the most urgent line: prestige over shift over buy; shifts and the prestige are critical with a lead', () => {
    const at = SEC + 3600;
    const mixed = (kind: CalLine['kind']) =>
      build([line({ key: 'a:0', at, checkIn: 0 }), line({ key: 'a:1', at, checkIn: 0, kind, text: 'do the thing' })])
        .events[0]!;
    expect(mixed('shift')).toMatchObject({ kind: 'shift', critical: true, lead: 10 });
    expect(mixed('prestige')).toMatchObject({ kind: 'prestige', critical: true, lead: 30 });
    expect(mixed('hab')).toMatchObject({ kind: 'buy', lead: 5 });
    expect(mixed('hab').critical).toBeUndefined();
    expect(mixed('setSwap').kind).toBe('shift');
    expect(mixed('siloTrick').kind).toBe('shift');
  });
  it('drops ticked lines; a fully ticked check-in is not an event; a partly ticked one lists what is left', () => {
    const lines = [buy(1), line({ key: `${SEC + 3600}:1`, at: SEC + 3600, checkIn: 1, text: 'buy B' }), buy(2)];
    const part = build(lines, { ticks: new Set([`${SEC + 3600}:0`]) });
    expect(part.events.length).toBe(2);
    expect(part.events[0]!.title).toBe('Buy: B');
    expect(part.events[0]!.uid).toBe(`${START}:${SEC + 3600}:1`);
    const all = build(lines, { ticks: new Set([`${SEC + 3600}:0`, `${SEC + 3600}:1`]) });
    expect(all.events.map(e => e.start)).toEqual([(SEC + 7200) * 1000]);
  });
  it('sale starts and back online are notes, waits and warnings are not events, other untickable lines are skipped', () => {
    const out = build([
      line({ key: 'e:1', kind: 'saleStart', at: SEC + 3600, tickable: false, checkIn: -1, text: 'sale starts' }),
      line({ key: 'e:2', kind: 'saleWait', at: SEC + 3600, tickable: false, checkIn: -1, text: 'wait for the sale' }),
      line({ key: 'e:3', kind: 'warning', at: 0, tickable: false, checkIn: -1, text: 'careful' }),
      line({ key: 'e:4', kind: 'back', at: SEC + 7200, tickable: false, checkIn: -1, text: 'back online' }),
      line({ key: 'e:5', kind: 'research', at: SEC + 9000, tickable: false, checkIn: -1, text: 'x' }),
    ]);
    expect(out.events.map(e => [e.kind, e.title])).toEqual([
      ['note', 'Sale starts'],
      ['note', 'Back online'],
    ]);
    expect(out.events.every(e => e.lead === undefined)).toBe(true);
  });
  it('include switches kinds off; the route event is off by default and one event at the finish when on', () => {
    const lines = [buy(1), buy(2, { kind: 'shift', text: 'swap' })];
    expect(build(lines, { options: { include: { buy: false } } }).events.map(e => e.kind)).toEqual(['shift']);
    const route = { goal: 'bydate:1800000000', finish: SEC + 5 * 86400, endTE: 120 };
    expect(build(lines, { route }).events.some(e => e.kind === 'route')).toBe(false);
    const on = build(lines, { route, options: { include: { route: true } } });
    const r = on.events.find(e => e.kind === 'route')!;
    expect(r).toMatchObject({
      uid: 'route:bydate:1800000000',
      start: route.finish * 1000,
      title: 'Reach 120 TE (about)',
    });
  });
  it('keeps events from a day ago to `days` ahead, soonest first, and says how far the list reaches', () => {
    const out = build([buy(-30), buy(-2), buy(1), buy(24 * 14), buy(24 * 15)]);
    expect(out.events.map(e => e.start / 3_600_000 - NOW / 3_600_000)).toEqual([-2, 1, 24 * 14]);
    expect(out.window).toEqual({ from: NOW - 86_400_000, to: NOW + 14 * 86_400_000 });
    expect(build([buy(1), buy(24 * 10)], { options: { days: 3 } }).events.length).toBe(1);
  });
  it('at most 100 events: the soonest, window.to is the last one so the record says how far it reaches', () => {
    const lines = Array.from({ length: 150 }, (_, i) => buy(i + 1));
    const out = buildFull(lines);
    expect(out.events.length).toBe(CAL_MAX_EVENTS); // 99 check-ins and the marker
    expect(real(out.events).length).toBe(CAL_MAX_EVENTS - 1);
    expect(out.window.to).toBe(real(out.events)[98]!.start);
    expect(real(out.events)[0]!.start).toBe((SEC + 3600) * 1000);
  });
  it('text: titles to 80, notes to 300, no player ID, no control characters, nothing the collector would refuse', () => {
    const long = 'buy ' + 'Very Long Research Name '.repeat(20);
    const out = build([
      line({ key: 'k:0', checkIn: 0, text: long }),
      line({ key: 'k:1', checkIn: 0, text: `ei1234567890123456 ${long}\u0007`, tail: 'offline 1 min' }),
      ...Array.from({ length: 6 }, (_, i) => line({ key: `k:${i + 2}`, checkIn: 0, text: long })),
    ]);
    const e = out.events[0]!;
    expect(e.title.length).toBeLessThanOrEqual(CAL_TITLE_MAX);
    expect(e.notes!.length).toBeLessThanOrEqual(CAL_NOTES_MAX);
    expect(JSON.stringify(out)).not.toMatch(/EI\d{16}/i);
    // eslint-disable-next-line no-control-regex
    expect(e.title).not.toMatch(/[\u0000-\u001f]/);
    expect(e.title.endsWith('more')).toBe(true);
  });
  it('uids only use characters the collector accepts and stay under 80', () => {
    const out = build([
      line({ key: 'e:2026/11 15 "x"', kind: 'saleStart', tickable: false, checkIn: -1, text: 'sale' }),
      line({ key: 'x'.repeat(200), at: SEC + 7200, checkIn: 3 }),
    ]);
    for (const e of out.events) expect(e.uid).toMatch(/^[A-Za-z0-9._:-]{1,80}$/);
    expect(new Set(out.events.map(e => e.uid)).size).toBe(2);
  });
  it('seq: 0 for a new event, bumps only when start, title, notes or lead changed since the last list', () => {
    const first = build([buy(1), buy(2)]);
    const same = build([buy(1), buy(2)], { previous: first });
    expect(same.events.map(e => e.seq)).toEqual([0, 0]);
    const moved = build([buy(1, { at: SEC + 3600 + 600 }), buy(2)], { previous: same });
    expect(moved.events.map(e => e.seq)).toEqual([1, 0]);
    const reworded = build([buy(1, { at: SEC + 3600 + 600, text: 'buy different' }), buy(2)], { previous: moved });
    expect(reworded.events.map(e => e.seq)).toEqual([2, 0]);
    const lead = build([buy(1, { at: SEC + 3600 + 600, text: 'buy different' }), buy(2)], {
      previous: reworded,
      options: { lead: { buy: 15 } },
    });
    expect(lead.events.map(e => e.seq)).toEqual([3, 1]);
  });
  it('src: equal for the same events; the time stays the one the plan last changed, and moves when anything an event says changes', () => {
    const a = buildFull([buy(1), buy(2)]);
    const later = buildFull([buy(1), buy(2)], { now: NOW + 60_000, previous: a });
    expect(sameCalendar(a, later)).toBe(true);
    expect(later.asOf).toBe(a.asOf);
    expect(JSON.stringify(later.events)).toBe(JSON.stringify(a.events)); // the events do not change at all, so nothing to send
    const changed = buildFull([buy(1), buy(2, { text: 'other' })], { now: NOW + 60_000, previous: a });
    expect(sameCalendar(a, changed)).toBe(false);
    expect(changed.asOf).toBe(NOW + 60_000);
    expect(sameCalendar(null, a)).toBe(false);
  });
  it('is deterministic and does not touch its input', () => {
    const lines = [buy(3), buy(1), buy(2)];
    const frozen = JSON.stringify(lines);
    const ticks = new Set(['x']);
    const a = build(lines, { ticks });
    const b = build([...lines].reverse(), { ticks });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(lines)).toBe(frozen);
    expect([...ticks]).toEqual(['x']);
  });
  it("quiet: events outside the hours (overnight window, the hours' own zone) are flagged", () => {
    const hours = { start: '07:00', end: '22:00', timezone: 'America/Denver' };
    // 4:10 pm MST now: +1 h = 5:10 pm (in), +7 h = 11:10 pm (out), +13 h = 5:10 am (out), +16 h = 8:10 am (in)
    const out = build([buy(1), buy(7), buy(13), buy(16)], { hours });
    expect(out.events.map(e => !!e.quiet)).toEqual([false, true, true, false]);
    expect(build([buy(1)]).events[0]!.quiet).toBeUndefined();
  });
  it('inHours: same-day and overnight windows, equal bounds mean always, a bad zone falls back to UTC', () => {
    const noon = Date.UTC(2026, 10, 15, 12, 0, 0);
    expect(inHours(noon, { start: '09:00', end: '17:00', timezone: 'UTC' }, 'UTC')).toBe(true);
    expect(inHours(noon, { start: '13:00', end: '17:00', timezone: 'UTC' }, 'UTC')).toBe(false);
    expect(inHours(noon, { start: '22:00', end: '07:00', timezone: 'UTC' }, 'UTC')).toBe(false);
    expect(inHours(Date.UTC(2026, 10, 15, 23, 0, 0), { start: '22:00', end: '07:00', timezone: 'UTC' }, 'UTC')).toBe(
      true
    );
    expect(inHours(noon, { start: '08:00', end: '08:00' }, 'UTC')).toBe(true);
    expect(inHours(noon, { start: '09:00', end: '17:00', timezone: 'Not/AZone' }, 'UTC')).toBe(true);
  });
  it('an empty plan is an empty list, not an error', () => {
    const out = build([]);
    expect(out.events).toEqual([]);
    expect(out.window.to).toBe(NOW + 14 * 86_400_000);
  });
  it('lead: null or 0 turns the alert off', () => {
    expect(build([buy(1)], { options: { lead: { buy: null } } }).events[0]!.lead).toBeUndefined();
    expect(build([buy(1)], { options: { lead: { buy: 0 } } }).events[0]!.lead).toBeUndefined();
  });
});

describe.skipIf(!haveCollector)('the collector contract', () => {
  it("everything the builder makes passes the collector's readCal, unchanged", () => {
    const lines: CalLine[] = [
      buy(1),
      line({
        key: `${SEC + 3600}:1`,
        at: SEC + 3600,
        checkIn: 1,
        kind: 'shift',
        text: 'swap to the farm set',
        tail: 'offline 1 min',
      }),
      buy(2, { kind: 'prestige', text: 'prestige now' }),
      line({
        key: 'e:sale',
        kind: 'saleStart',
        at: SEC + 9000,
        tickable: false,
        checkIn: -1,
        text: 'sale; starts, "now"\nnext',
      }),
      line({ key: 'y'.repeat(150), at: SEC + 12000, checkIn: 7, text: 'z'.repeat(400) }),
    ];
    const first = build(lines, {
      hours: { start: '07:00', end: '22:00', timezone: 'America/Denver' },
      route: { goal: 'race490', finish: SEC + 86400 * 3, endTE: 490 },
      options: { include: { route: true } },
    });
    const checked = readCal(JSON.parse(JSON.stringify(first)));
    expect(checked.problems).toBeUndefined();
    expect(checked.value).toEqual(JSON.parse(JSON.stringify(first)));
    const again = build(lines, { previous: first });
    expect(readCal(JSON.parse(JSON.stringify(again))).problems).toBeUndefined();
  });
  it('a list that would be over the size cap loses its latest events, and window.to says where it ends', () => {
    const lines = Array.from({ length: 150 }, (_, i) =>
      buy(i + 1, { text: 'buy ' + 'Research Name (17 → 18), '.repeat(6), tail: 'offline 1 min' })
    );
    const out = build(lines, { hours: { start: '07:00', end: '22:00', timezone: 'America/Denver' } });
    expect(new TextEncoder().encode(JSON.stringify(out)).length).toBeLessThan(24 * 1024);
    expect(out.events.length).toBeLessThan(CAL_MAX_EVENTS);
    expect(out.events.length).toBeGreaterThan(30);
    expect(out.window.to).toBe(out.events[out.events.length - 1]!.start);
    expect(out.events[0]!.start).toBe((SEC + 3600) * 1000);
    expect(readCal(JSON.parse(JSON.stringify(out))).problems).toBeUndefined();
  });
});

describe("Words' wording (14 Nov)", () => {
  const at = SEC + 3600;
  const one = (kind: CalLine['kind'], text: string) =>
    build([line({ key: 'w:0', at, checkIn: 0, kind, text })]).events[0]!;
  it('titles: Shift to Humility, Buy: {item}, Ascend, Reach 120 TE (about)', () => {
    expect(one('shift', 'shift to Humility').title).toBe('Shift to Humility');
    expect(one('research', 'buy Grav Plating (17 → 18)').title).toBe('Buy: Grav Plating (17 → 18)');
    expect(one('prestige', 'prestige: start the ascension on Curiosity').title).toBe('Ascend');
    expect(one('prestige', 'prestige: start the ascension on Curiosity').notes).toBe(FOOT);
  });
  it('every event ends with "Planned as of <time> <the player\'s zone>. Open the planner to confirm." (12-hour, capitals)', () => {
    for (const e of build([buy(1), buy(2, { kind: 'shift', text: 'shift to Humility' })]).events)
      expect(e.notes!.endsWith(FOOT)).toBe(true);
    const utc = build([buy(1)], { zone: 'UTC' }).events[0]!;
    expect(utc.notes).toBe('Planned as of 11:10 PM UTC. Open the planner to confirm.');
    const tokyo = build([buy(1)], { zone: 'Asia/Tokyo' }).events[0]!;
    expect(tokyo.notes).toMatch(/^Planned as of 8:10 AM (GMT\+9|JST)\./);
  });
  it('a bad zone falls back to UTC instead of throwing', () => {
    expect(build([buy(1)], { zone: 'Not/AZone' }).events[0]!.notes).toMatch(/^Planned as of 11:10 PM UTC\./);
  });
  it('the marker event "Plan last updated 9:00 AM" is in the list when there are events, at the time the plan last changed', () => {
    const out = buildFull([buy(1)]);
    const m = out.events.find(e => e.uid === 'asof')!;
    expect(m).toMatchObject({ kind: 'note', start: NOW, title: 'Plan last updated 4:10 PM', seq: 0 });
    expect(m.notes).toBeUndefined();
    expect(buildFull([]).events).toEqual([]);
  });
  it("the marker's seq goes up when the plan changes; the footers keep their seq when only the time moves", () => {
    const a = buildFull([buy(1), buy(2)]);
    const b = buildFull([buy(1), buy(2, { text: 'buy other' })], { now: NOW + 3_600_000, previous: a });
    expect(b.events.find(e => e.uid === 'asof')!.seq).toBe(1);
    expect(b.events.find(e => e.uid === `${START}:${SEC + 3600}:0`)!.seq).toBe(0); // unchanged event: no bump
    expect(b.events.find(e => e.uid === `${START}:${SEC + 7200}:0`)!.seq).toBe(1);
  });
});
