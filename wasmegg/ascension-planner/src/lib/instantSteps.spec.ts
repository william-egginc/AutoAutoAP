import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { instantSteps, type StepLeg } from './instantSteps';
import { STEPS_LINK, STEPS_NOTE } from './instantStepsWords';
import { renderHtml, textOf } from '@/test/renderComponent';
import InstantSteps from '@/components/auto/InstantSteps.vue';
import type { Availability } from '@/search/availability';

const TZ = 'America/Los_Angeles';
const H = 3600;
const D = 86400;
// Monday 4 Jan 2027, 9:00 am PST = 17:00 UTC.
const T0 = Date.parse('2027-01-04T17:00:00Z') / 1000;
const hours9to5: Availability = { days: [], fromHour: 9, toHour: 17, timezone: TZ };
const leg = (from: number, endTE: number, start: number, end: number, extra: Partial<StepLeg> = {}): StepLeg => ({
  from,
  to: endTE,
  endTE,
  start,
  end,
  ...extra,
});

describe('instantSteps: one line per ascension', () => {
  it('the first ascension is "now"; a prestige right after the last stop did not wait', () => {
    const lines = instantSteps([leg(100, 110, T0, T0 + 2 * H), leg(110, 120, T0 + 2 * H, T0 + 4 * H)], null, null);
    expect(lines.map(l => [l.asc, l.now, l.wait, l.stopTE])).toEqual([
      [1, true, null, 110],
      [2, false, null, 120],
    ]);
    expect(lines[1].readyAt).toBeNull();
  });

  it('a prestige held to the hours says so, with when it was ready', () => {
    const end = T0 + 10 * H; // 7:00 pm PST, outside 9-5
    const next = T0 + 24 * H; // 9:00 am next day
    const lines = instantSteps([leg(100, 110, T0, end), leg(110, 120, next, next + 3 * H)], hours9to5, null);
    expect(lines[1]).toMatchObject({ wait: 'hours', readyAt: end, prestigeAt: next });
  });

  it('a prestige pushed past a no-prestige day says days, even inside the hours', () => {
    const end = T0 + 2 * H;
    const win = { from: T0, to: T0 + 3 * D };
    const lines = instantSteps([leg(100, 110, T0, end), leg(110, 120, T0 + 3 * D, T0 + 3 * D + 2 * H)], null, [win]);
    expect(lines[1]).toMatchObject({ wait: 'days', readyAt: end });
    // With hours as well: the days still name the wait.
    const both = instantSteps([leg(100, 110, T0, end), leg(110, 120, T0 + 3 * D + 18 * H, T0 + 4 * D)], hours9to5, [win]);
    expect(both[1].wait).toBe('days');
  });

  it('no-prestige days that the prestige does not touch change nothing', () => {
    const lines = instantSteps([leg(100, 110, T0, T0 + 2 * H), leg(110, 120, T0 + 2 * H, T0 + 4 * H)], null, [
      { from: T0 + 10 * D, to: T0 + 12 * D },
      { from: 5, to: 5 }, // empty: dropped
    ]);
    expect(lines.every(l => l.wait === null)).toBe(true);
  });

  it('a first prestige held to the morning (heldOpening) waits for the hours', () => {
    const lines = instantSteps([leg(100, 110, T0 + 24 * H, T0 + 30 * H, { heldOpening: 'morning', wanted: T0 + 10 * H })], hours9to5, null);
    expect(lines[0]).toMatchObject({ now: false, wait: 'hours', readyAt: T0 + 10 * H });
  });

  it('legs missing or empty give no lines, never a throw', () => {
    expect(instantSteps(null, null, null)).toEqual([]);
    expect(instantSteps([], hours9to5, [{ from: 1, to: 2 }])).toEqual([]);
    expect(instantSteps([{ from: 1, to: 2, endTE: 2, start: NaN, end: 5 }], null, null)).toEqual([]);
  });
});

describe('a FRESH first ascension is not "the ascension you are in" (17 Nov 2026: 93 TE, no virtue farm)', () => {
  // The route's first leg starts fresh ('2-sale', '3-sale-tier13': search/routeFinder.ts firstLegOptions): the player prestiges
  // NOW to start it. Only a continued one ('continue', 'buildup', or no label) is the ascension the farm is in.
  it('the line knows: fresh for N-sale labels, not for continue / build-up / none; `now` is unchanged', () => {
    const at = (label?: string) => instantSteps([leg(93, 110, T0, T0 + 2 * H, label ? { label } : {}), leg(110, 133, T0 + 3 * H, T0 + 9 * H)], null, null);
    for (const l of ['2-sale', '3-sale-tier13']) expect(at(l).map(x => [x.now, x.fresh])).toEqual([[true, true], [false, false]]);
    for (const l of ['continue', 'buildup', undefined]) expect(at(l).map(x => [x.now, x.fresh])).toEqual([[true, false], [false, false]]);
  });
  it('InstantSteps.vue: a fresh A1 says prestige now; a continued one keeps "in the ascension you are in"', async () => {
    const legsOf = (label: string) => [leg(93, 110, T0, T0 + 2 * H, { label }), leg(110, 133, T0 + 3 * H, T0 + 9 * H)];
    const fresh = textOf(await renderHtml(InstantSteps, { legs: legsOf('2-sale'), zone: TZ, hours: null, noPrestige: [] }));
    expect(fresh).toContain('A1 · prestige now, to start a fresh ascension');
    expect(fresh).not.toContain('in the ascension you are in');
    const cont = textOf(await renderHtml(InstantSteps, { legs: legsOf('continue'), zone: TZ, hours: null, noPrestige: [] }));
    expect(cont).toContain('A1 · now, in the ascension you are in');
  });
});

describe('InstantSteps.vue', () => {
  const legs = [leg(100, 110, T0, T0 + 2 * H), leg(110, 120, T0 + 3 * D, T0 + 3 * D + 2 * H)];
  const props = { legs, zone: TZ, hours: null, noPrestige: [{ from: T0, to: T0 + 3 * D }] };

  it('is folded by default, names the step list and the wait, in 12-hour times', async () => {
    const html = await renderHtml(InstantSteps, props);
    expect(html).toContain('data-testid="instant-steps"');
    expect(html).not.toMatch(/<details[^>]*\bopen\b/);
    const t = textOf(html);
    expect(t).toContain(STEPS_LINK);
    expect(t).not.toContain('When each step happens');
    expect(t).toContain(STEPS_NOTE);
    // A visible bordered link, not a caption (17 Nov 2026).
    expect(html).toMatch(/<summary[^>]*class="[^"]*\bborder\b[^"]*\bborder-emerald-300\b/);
    expect(t).toContain('waits past your no-prestige days');
    expect(t).toMatch(/\b(am|pm|AM|PM)\b/);
    expect(t).not.toMatch(/\b(table|chain|checkpoint)s?\b/i);
    expect(html).toContain('min-h-[44px]');
  });

  it('shows nothing without legs', async () => {
    expect(textOf(await renderHtml(InstantSteps, { ...props, legs: [] }))).toBe('');
  });

  it('sits under both green boxes of the instant answer', () => {
    const src = readFileSync('src/components/auto/InstantRoute.vue', 'utf8');
    expect(src).toContain('<InstantSteps :legs="boxLead.legs"');
    expect(src).toContain('<InstantSteps :legs="dateBoxLegs"');
  });
});
