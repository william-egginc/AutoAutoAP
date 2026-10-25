import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { canonicalDelivered, pacificHourOfWeek, type BuildParams } from './precomputedLeg';
import {
  claimAt,
  creditWait,
  findRoutes,
  priceChain,
  priceLeg,
  prestigeBackFor,
  tailOptionsOf,
  type BuildLookup,
  type Route,
} from './routeFinder';
import { noPrestigeAt } from './noPrestige';
import { timeOffWindows } from './timeOff';
import { instantTail } from './instantGear';
import { instantKey } from './instantSnapshot';
import type { Availability } from './availability';
import { getNextSaleEnd } from '@/lib/events';
import { countTEThresholdsPassed } from '@/lib/truthEggs';

// No prestige on these days in the instant answer (routeFinder.ts `TailOptions.noPrestige`): each prestige waits past
// them to the next allowed time (inside the hours when set), the laying meanwhile capped at the silos for the part
// the days add, By a date's claim waits too, and nothing changes without them. The synthetic table of
// routeFinder.claim.spec.ts.
const START = Date.parse('2027-01-04T17:00:00Z') / 1000; // Monday 4 Jan 2027, 9:00 am PST
const FROM = 100;
const FINAL = 130;
const TZ = 'America/Los_Angeles';
const table: BuildLookup = (te, hour) => {
  if (te < FROM || te > FINAL) return null;
  const cellStart = START + ((hour - pacificHourOfWeek(START) + 168) % 168) * 3600;
  const b: BuildParams = {
    sales: 1,
    tier13: false,
    waitStart: 3600 * (2 + (te % 7) + (hour % 5)),
    saleEnd: getNextSaleEnd(cellStart) - cellStart,
    peakELR: 2e12 * (1 + (te - FROM) / 5),
    delivered: canonicalDelivered(te),
  };
  return [b];
};
const days9to5: Availability = { days: [], fromHour: 9, toHour: 17, timezone: TZ };
const find = (extra: object = {}) =>
  findRoutes({ table, startTE: FROM, start: START, final: FINAL, maxAscensions: 5, ...extra });
const ymd = (t: number) => new Date((t - 8 * 3600) * 1000).toISOString().slice(0, 10); // PST date
const routes = (f: { byAscensions: (Route | null)[] }) => f.byAscensions.filter((r): r is Route => !!r);

/** Every prestige of `r` (each leg's start after the first) outside the windows, and none before a window it waited on. */
function heldPastDays(r: Route, windows: { from: number; to: number }[]): void {
  for (let i = 1; i < r.legs.length; i++) {
    expect(noPrestigeAt(r.legs[i].start, windows)).toBeNull();
    const w = noPrestigeAt(r.legs[i - 1].end, windows);
    if (w) expect(r.legs[i].start).toBeGreaterThanOrEqual(w.to);
  }
}

describe('the instant answer holds each prestige past the no-prestige days', () => {
  it('without days: the same answer as before, to the second', async () => {
    const before = await find({ hours: days9to5 });
    const none = await find({ hours: days9to5, noPrestige: [] });
    expect(JSON.stringify(none)).toBe(JSON.stringify(before));
  });

  it('a stop reached on a no-prestige day waits to the next allowed time inside the hours', async () => {
    const before = await find({ hours: days9to5 });
    // The day the fastest route's second ascension starts on, made a no-prestige day.
    const route = routes(before).find(r => r.legs.length > 1)!;
    const day = ymd(route.legs[1].start);
    const windows = timeOffWindows([{ from: day, to: day }], TZ);
    const after = await find({ hours: days9to5, noPrestige: windows });
    for (const r of routes(after)) heldPastDays(r, windows);
    // The same route priced with the day (priceChain, as the polish prices it): its prestige the hours alone put on
    // the day is held to 9:00 am the day after (the hours' first hour after the window), and it ends later.
    const o = { startTE: FROM, start: START, hours: days9to5 };
    const plain = priceChain(table, o, route.chain)!;
    const held = priceChain(table, { ...o, noPrestige: windows }, route.chain)!;
    expect(plain.legs[1].start).toBe(route.legs[1].start);
    expect(held.legs[1].start).toBe(windows[0].to + 9 * 3600);
    expect(held.end).toBeGreaterThan(plain.end);
    // The finder routes around the day where that is sooner.
    expect(after.best!.end).toBeLessThanOrEqual(held.end);
    // Never sooner than with the hours alone.
    expect(after.best!.end).toBeGreaterThanOrEqual(before.best!.end);
  });

  it('with no hours set only the days apply', async () => {
    const before = await find();
    const route = routes(before).find(r => r.legs.length > 1)!;
    const day = ymd(route.legs[1].start);
    const windows = timeOffWindows([{ from: day, to: day }], TZ);
    const after = await find({ noPrestige: windows });
    for (const r of routes(after)) heldPastDays(r, windows);
    expect(after.best!.end).toBeGreaterThanOrEqual(before.best!.end);
  });

  it('a fresh ascension asked to start on a no-prestige day starts after it (priceLeg)', () => {
    const day = ymd(START + 86_400);
    const windows = timeOffWindows([{ from: day, to: day }], TZ);
    const t = windows[0].from + 3 * 3600;
    const plain = priceLeg(table, 105, t, canonicalDelivered(105), 110, 1, days9to5);
    const held = priceLeg(table, 105, t, canonicalDelivered(105), 110, 1, days9to5, { noPrestige: windows });
    expect(plain!.start).toBeLessThan(windows[0].to);
    expect(held!.start).toBe(windows[0].to + 9 * 3600);
  });
});

describe('the laying while a no-prestige day holds a prestige (creditWait)', () => {
  const day = ymd(START + 86_400);
  const windows = timeOffWindows([{ from: day, to: day }], TZ);
  const eggs = canonicalDelivered(110);
  const rate = 1e12;
  // Leg ends 10:00 am on the no-prestige day: the hours alone would let it prestige at once; the day holds it 23 h
  // (to 9:00 am the next day).
  const end = windows[0].from + 10 * 3600;
  const wait = windows[0].to + 9 * 3600 - end;

  it('longer than the silos: credited only up to the silo seconds', () => {
    const c = creditWait(110, end, eggs, 0, rate, days9to5, { noPrestige: windows, siloSeconds: 6 * 3600 });
    expect(c.delivered[0]).toBe(eggs[0] + rate * 6 * 3600);
  });
  it('shorter than the silos: the whole wait', () => {
    const c = creditWait(110, end, eggs, 0, rate, days9to5, { noPrestige: windows, siloSeconds: 48 * 3600 });
    expect(c.delivered[0]).toBe(eggs[0] + rate * wait);
    expect(c.te).toBe(Math.max(110, c.delivered.reduce((n, e) => n + countTEThresholdsPassed(e), 0)));
  });
  it('the hours hold unchanged: a night wait outside any day is credited in full, whatever the silos', () => {
    const evening = START + 9 * 3600; // Monday 6:00 pm PST, not a no-prestige day
    const c = creditWait(110, evening, eggs, 0, rate, days9to5, { noPrestige: windows, siloSeconds: 60 });
    expect(c.delivered[0]).toBe(eggs[0] + rate * 15 * 3600);
  });
  it('no days and no hours: nothing waits', () => {
    expect(creditWait(110, end, eggs, 0, rate, undefined).delivered).toBe(eggs);
  });
});

describe('By a date: the claim is a prestige, so it waits past the days too', () => {
  it('claimAt', () => {
    const day = ymd(START + 86_400);
    const windows = timeOffWindows([{ from: day, to: day }], TZ);
    const t = windows[0].from + 12 * 3600;
    expect(claimAt(t, days9to5)).toBe(t);
    expect(claimAt(t, days9to5, { noPrestige: windows })).toBe(windows[0].to + 9 * 3600);
    expect(claimAt(t, null, { noPrestige: windows })).toBe(windows[0].to);
  });
});

describe('the days reach the workers and the saved-answer identity', () => {
  const windows = [{ from: 1_800_000_000, to: 1_800_086_400 }];
  it('instantTail and tailOptionsOf carry them (and the silo seconds), only when set', () => {
    const t = instantTail(days9to5, true, undefined, { noPrestige: windows, siloSeconds: 7200 });
    expect(t.noPrestige).toEqual(windows);
    expect(t.siloSeconds).toBe(7200);
    expect(tailOptionsOf(t)).toMatchObject({ noPrestige: windows, siloSeconds: 7200 });
    expect(instantTail(days9to5, true)).toEqual(instantTail(days9to5, true, undefined, { noPrestige: [], siloSeconds: 1 }));
    expect(tailOptionsOf(instantTail(days9to5, true))).not.toHaveProperty('noPrestige');
  });
  it('prestigeBackFor is the hours hook itself without days', () => {
    expect(prestigeBackFor(days9to5, {})).toBe(prestigeBackFor(days9to5, undefined));
    expect(prestigeBackFor(undefined, {})).toBeUndefined();
    expect(prestigeBackFor(undefined, { noPrestige: windows })!(1_800_000_100)).toBe(1_800_086_400);
  });
  it('a saved answer made without days keeps its key; one with days keys apart', () => {
    const base = {
      playerId: 'EI1234567890123456',
      finalTE: 490,
      currentTE: 200,
      eggsDelivered: {},
      artifacts: [],
      stones: [],
      epic: {},
      availability: null,
      timeOff: [],
      milestones: [],
      firstAscension: 'auto',
      useHours: false,
      maxAscensions: null,
    };
    expect(instantKey({ ...base, noPrestige: [] })).toBe(instantKey(base));
    expect(instantKey({ ...base, noPrestige: [{ from: '2027-01-05', to: '2027-01-05' }] })).not.toBe(instantKey(base));
  });
});

describe('the instant card', () => {
  const src = readFileSync(fileURLToPath(new URL('../components/auto/InstantRoute.vue', import.meta.url)), 'utf8');
  it('says the prestiges wait past the days, only when some are set', () => {
    expect(src).toContain('<p v-if="noPrestigeOn" class="text-[11px] text-slate-500" data-testid="instant-no-prestige">');
    expect(src).toContain('Your no-prestige days are kept: a prestige that would land on one waits for the next allowed time');
  });
  it('the "Prestige by" line, which times its own prestige by the hours only, says it does not know the days', () => {
    expect(src.match(/data-testid="prestige-by-no-days"/g)).toHaveLength(2);
    expect(src).toContain('The “Prestige by” line doesn\'t know your no-prestige days; Fast, Exact or Custom do.');
  });
  it('keys the saved answer with the days, and hands them to every pricing (answer, what-if, bracket, Prestige by)', () => {
    expect(src).toContain('noPrestige: store.noPrestige,');
    expect(src.match(/daysOf\(inputs\)|answerDays\)/g)!.length).toBeGreaterThanOrEqual(4);
  });
});
