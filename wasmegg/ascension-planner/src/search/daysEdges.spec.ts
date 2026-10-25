/**
 * Days off and no-prestige days at the edges, through the instant answer (routeFinder.ts) on Egg Day 2027 (a player's
 * Safari, 24 Oct 2026: By a date, hours 7:00 am to 5:00 am in America/Denver, no-prestige days 29-31 Oct and 22-24 Nov
 * 2026, a day off on 27 Oct 2027, "I took a day off and it broke the simulator"). Nothing here throws, and each edge
 * prices as it should: days after the deadline change nothing, overlapping or back-to-back stretches price as the one
 * stretch they make, a single day is one whole local day. The synthetic table of routeFinder.noPrestige.spec.ts,
 * moved to the player's dates.
 */
import { describe, expect, it, vi } from 'vitest';

// Each case prices a real table: slow under the full suite's load (timed out at 20 s twice, passes alone).
vi.setConfig({ testTimeout: 120_000 });
import { canonicalDelivered, pacificHourOfWeek, type BuildParams } from './precomputedLeg';
import { findRoutes, priceChain, type BuildLookup, type Route } from './routeFinder';
import { noPrestigeAt } from './noPrestige';
import { timeOffWindows, type TimeOffDates } from './timeOff';
import { instantTail } from './instantGear';
import type { Availability } from './availability';
import { getNextSaleEnd } from '@/lib/events';
import { eggDaySeconds } from '@/lib/eggDay';

const TZ = 'America/Denver';
const START = Date.parse('2026-10-24T20:00:00Z') / 1000; // Sat 24 Oct 2026, 2:00 pm in Denver
const DEADLINE = eggDaySeconds(2027); // 14 Jul 2027, 9:00 am Pacific
const FROM = 190;
const FINAL = 490;
const table: BuildLookup = (te, hour) => {
  if (te < FROM || te > FINAL) return null;
  const cellStart = START + ((hour - pacificHourOfWeek(START) + 168) % 168) * 3600;
  const b: BuildParams = {
    sales: 1,
    tier13: false,
    waitStart: 3600 * (20 + (te % 7) + (hour % 5)),
    saleEnd: getNextSaleEnd(cellStart) - cellStart,
    peakELR: 2e12 * (1 + (te - FROM) / 5),
    delivered: canonicalDelivered(te),
  };
  return [b];
};
/** 7:00 am to 5:00 am the next day, every day. */
const HOURS: Availability = { days: [0, 1, 2, 3, 4, 5, 6], fromHour: 7, toHour: 5, timezone: TZ };
const PLAYER_DAYS: TimeOffDates[] = [
  { from: '2026-10-29', to: '2026-10-31' },
  { from: '2026-11-22', to: '2026-11-24' },
];
const SILO = 2 * 86400;

/** The instant answer as InstantRoute asks for it: By a date, the hours ticked, held shifts on, the days. */
function find(days: TimeOffDates[]) {
  const np = timeOffWindows(days, TZ);
  const tail = instantTail(HOURS, true, undefined, np.length ? { noPrestige: np, siloSeconds: SILO } : null);
  return findRoutes({ table, startTE: FROM, start: START, final: FINAL, maxAscensions: 8, deadline: DEADLINE, hours: HOURS, ...tail });
}
const routes = (f: { byDateByAscensions: (Route | null)[]; byAscensions: (Route | null)[] }) =>
  [...f.byDateByAscensions, ...f.byAscensions].filter((r): r is Route => !!r);
/** No prestige (each leg's start after the first) on a no-prestige day. */
function heldPast(f: Parameters<typeof routes>[0], days: TimeOffDates[]): void {
  const ws = timeOffWindows(days, TZ);
  for (const r of routes(f)) for (let i = 1; i < r.legs.length; i++) expect(noPrestigeAt(r.legs[i].start, ws)).toBeNull();
}
/** Every number in the answer finite: nothing for the card to choke on. */
function allFinite(f: object): void {
  const bad: string[] = [];
  JSON.stringify(f, (k, v) => {
    if (typeof v === 'number' && !Number.isFinite(v)) bad.push(k);
    return v;
  });
  expect(bad).toEqual([]);
}

describe('the windows the days make (timeOffWindows, for time off and no-prestige days alike)', () => {
  it('a single day is that whole local day', () => {
    expect(timeOffWindows([{ from: '2027-10-27', to: '2027-10-27' }], TZ)).toEqual([
      { from: Date.parse('2027-10-27T06:00:00Z') / 1000, to: Date.parse('2027-10-28T06:00:00Z') / 1000 },
    ]);
  });
  it('overlapping stretches make one', () => {
    const one = timeOffWindows([{ from: '2026-10-29', to: '2026-11-02' }], TZ);
    expect(
      timeOffWindows(
        [
          { from: '2026-10-29', to: '2026-10-31' },
          { from: '2026-10-30', to: '2026-11-02' },
        ],
        TZ
      )
    ).toEqual(one);
    // In any order, one inside the other too.
    expect(
      timeOffWindows(
        [
          { from: '2026-10-30', to: '2026-10-30' },
          { from: '2026-10-29', to: '2026-11-02' },
        ],
        TZ
      )
    ).toEqual(one);
  });
  it('back-to-back stretches make one', () => {
    expect(
      timeOffWindows(
        [
          { from: '2026-10-29', to: '2026-10-31' },
          { from: '2026-11-01', to: '2026-11-02' },
        ],
        TZ
      )
    ).toEqual(timeOffWindows([{ from: '2026-10-29', to: '2026-11-02' }], TZ));
  });
  it('days after the deadline are kept as they are (the searches decide they change nothing)', () => {
    const [w] = timeOffWindows([{ from: '2027-10-27', to: '2027-10-27' }], TZ);
    expect(w.from).toBeGreaterThan(DEADLINE);
  });
  it('half-typed or backwards rows are left out', () => {
    expect(
      timeOffWindows(
        [
          { from: '2027-10-27', to: '' },
          { from: '', to: '2027-10-27' },
          { from: '2027-10-27', to: '2027-07-14' },
        ],
        TZ
      )
    ).toEqual([]);
  });
});

describe('the instant answer on Egg Day 2027 with the days at the edges', () => {
  it('the player’s exact setup: no throw, every number finite, no prestige on the days, claimed by the deadline', async () => {
    const f = await find(PLAYER_DAYS);
    expect(f.byDate).not.toBeNull();
    expect(f.byDate!.end).toBeLessThanOrEqual(DEADLINE);
    allFinite(f);
    heldPast(f, PLAYER_DAYS);
    // The day off (27 Oct 2027, after the deadline) is not in the instant answer at all; the card names it as left
    // out. Its route priced again the same way, as the polish prices it, lands where the finder put it.
    const np = timeOffWindows(PLAYER_DAYS, TZ);
    const again = priceChain(
      table,
      { startTE: FROM, start: START, deadline: DEADLINE, hours: HOURS, ...instantTail(HOURS, true, undefined, { noPrestige: np, siloSeconds: SILO }) },
      f.byDate!.chain
    );
    expect(again?.end).toBe(f.byDate!.end);
  });

  it('no-prestige days after the deadline change nothing, to the second', async () => {
    const none = await find([]);
    const after = await find([{ from: '2027-10-27', to: '2027-10-27' }]);
    expect(JSON.stringify(after.byDate)).toBe(JSON.stringify(none.byDate));
    expect(JSON.stringify(after.byDateByAscensions)).toBe(JSON.stringify(none.byDateByAscensions));
  });

  it('overlapping and back-to-back no-prestige days price as the one stretch they make', async () => {
    const one = await find([{ from: '2026-10-29', to: '2026-11-02' }]);
    const overlap = await find([
      { from: '2026-10-29', to: '2026-10-31' },
      { from: '2026-10-30', to: '2026-11-02' },
    ]);
    const backToBack = await find([
      { from: '2026-10-29', to: '2026-10-31' },
      { from: '2026-11-01', to: '2026-11-02' },
    ]);
    expect(JSON.stringify(overlap.byDate)).toBe(JSON.stringify(one.byDate));
    expect(JSON.stringify(backToBack.byDate)).toBe(JSON.stringify(one.byDate));
    heldPast(one, [{ from: '2026-10-29', to: '2026-11-02' }]);
  });

  it('a single no-prestige day: no prestige on it, never sooner than without it', async () => {
    const none = await find([]);
    const day = await find([{ from: '2026-10-29', to: '2026-10-29' }]);
    heldPast(day, [{ from: '2026-10-29', to: '2026-10-29' }]);
    allFinite(day);
    expect(day.byDate!.legs[day.byDate!.legs.length - 1].endTE).toBeLessThanOrEqual(
      none.byDate!.legs[none.byDate!.legs.length - 1].endTE
    );
  });
});
