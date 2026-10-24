import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { instantSteps, type StepLeg } from './instantSteps';
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

describe('InstantSteps.vue', () => {
  const legs = [leg(100, 110, T0, T0 + 2 * H), leg(110, 120, T0 + 3 * D, T0 + 3 * D + 2 * H)];
  const props = { legs, zone: TZ, hours: null, noPrestige: [{ from: T0, to: T0 + 3 * D }] };

  it('is folded by default, names the step list and the wait, in 12-hour times', async () => {
    const html = await renderHtml(InstantSteps, props);
    expect(html).toContain('data-testid="instant-steps"');
    expect(html).not.toMatch(/<details[^>]*\bopen\b/);
    const t = textOf(html);
    expect(t).toContain('When each step happens');
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
