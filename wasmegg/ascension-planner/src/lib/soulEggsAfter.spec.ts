/**
 * SOUL EGGS AFTER THE PLAN, ON MY RUNS (27 Oct 2026, Jordan: Single run shows "Soul eggs: −3.0s, remaining 9.7s"; My
 * runs should say the same for the followed route). One plain line on Right now (under Next shifts) and on the saved
 * answer tile when it is that same route. Worded (27 Oct 2026, Jordan) "Soul eggs left after this plan: about 9.8s
 * (you'll spend about 2.9s on 47 shifts, about 24 of them build-up shifts, estimated)". The
 * shifts are priced as All planned shifts prices them (lib/shiftCost.ts `plannedShiftsCost` at today's soul eggs, from
 * the save's shifts since its last Path reset), the numbers written as Single run writes them (`formatNumber(x, 1)`).
 * Amber under a quarter left (lib/soulEggs.ts SE_WARN_BELOW, the warning's own threshold); nothing without the save's
 * soul eggs or a planned count.
 */
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import RightNowCard from '@/components/myruns/RightNowCard.vue';
import SavedTile from '@/components/myruns/SavedTile.vue';
import { formatNumber } from './format';
import { plannedShiftsCost } from './shiftCost';
import { QUARTER_SHIFTS, soulEggsAfterLine } from './soulEggs';
import type { NowPlan } from './nowPlan';
import type { Tile } from './savedTiles';

const SE = 12.7e21;

describe('soulEggsAfterLine (lib/soulEggs.ts)', () => {
  it("today's soul eggs less the planned shifts' cost, from the save's shifts done", () => {
    const spent = plannedShiftsCost(SE, 20, 48);
    const line = soulEggsAfterLine({ soulEggs: SE, done: 20, planned: { count: 48 } })!;
    expect(line.text).toBe(
      `Soul eggs left after this plan: about ${formatNumber(SE - spent, 1)} (you'll spend about ${formatNumber(spent, 1)} on 48 shifts)`
    );
    expect(line.amber).toBe(false);
  });

  it('says how many of the shifts are the estimated build-up shifts', () => {
    const line = soulEggsAfterLine({ soulEggs: SE, done: 0, planned: { count: 48, opening: 24 } })!;
    expect(line.text).toMatch(
      /^Soul eggs left after this plan: about \d+\.\ds \(you'll spend about \d+\.\d[a-zA-Z]+ on 48 shifts, about 24 of them build-up shifts, estimated\)$/
    );
  });

  it("formats like Single run's Spent / Remaining: 's' for sextillions, one decimal", () => {
    const line = soulEggsAfterLine({ soulEggs: 12.7e21, done: 0, planned: { count: 1 } })!;
    expect(line.text).toMatch(/^Soul eggs left after this plan: about 12\.\ds \(you'll spend about \d+\.\d[a-zA-Z]+ on 1 shift\)$/);
  });

  it('no shifts planned', () => {
    expect(soulEggsAfterLine({ soulEggs: 12.7e21, done: 0, planned: { count: 0 } })!.text).toBe(
      'Soul eggs left after this plan: about 12.7s (no shifts planned)'
    );
  });

  it('amber under a quarter left (the warning\'s threshold); the warning itself is unchanged', () => {
    expect(soulEggsAfterLine({ soulEggs: 1e21, done: 0, planned: { count: QUARTER_SHIFTS - 1 } })!.amber).toBe(false);
    expect(soulEggsAfterLine({ soulEggs: 1e21, done: 0, planned: { count: QUARTER_SHIFTS } })!.amber).toBe(true);
  });

  it('nothing without the save\'s soul eggs or a planned count', () => {
    expect(soulEggsAfterLine({ soulEggs: null, done: 0, planned: { count: 48 } })).toBeNull();
    expect(soulEggsAfterLine({ soulEggs: 0, done: 0, planned: { count: 48 } })).toBeNull();
    expect(soulEggsAfterLine({ soulEggs: SE, done: 0, planned: null })).toBeNull();
  });
});

describe('the saved answer tile (SavedTile.vue)', () => {
  const tile: Tile = {
    goal: 'fastest',
    answer: {
      chain: [300, 490],
      end: 1_800_000_000,
      endTE: 490,
      spareHours: null,
      calculatedAt: 1_799_000_000_000,
      saveSeconds: null,
      fromTE: null,
      source: 'snapshot',
      how: 'instant',
    },
    olderSave: false,
    sure: null,
  };
  const props = { tile, goal: 'fastest' as const, title: 'Fastest to 490 TE', target: 490, now: 1_799_000_000, zone: 'UTC', standing: '', standingLabel: '' };

  it('shows the line it is given, amber when it is', async () => {
    const plain = await renderHtml(SavedTile, { ...props, soulEggsAfter: { text: "Soul eggs left after this plan: about 9.7s (you'll spend about 3.0s on 48 shifts)", amber: false } });
    expect(textOf(plain)).toContain("Soul eggs left after this plan: about 9.7s (you'll spend about 3.0s on 48 shifts)");
    expect(plain).toMatch(/data-testid="now-tile-soul-eggs"[^>]*>|class="[^"]*text-slate-600[^"]*"[^>]*data-testid="now-tile-soul-eggs"/);
    const amber = await renderHtml(SavedTile, { ...props, soulEggsAfter: { text: 'Soul eggs left after this plan: about 1.0s', amber: true } });
    expect(amber).toMatch(/class="[^"]*text-amber-800[^"]*"[^>]*data-testid="now-tile-soul-eggs"/);
    expect(textOf(await renderHtml(SavedTile, props))).not.toContain('Soul eggs left after this plan');
  });
});

describe('Right now (RightNowCard.vue): one line under Next shifts', () => {
  const T0 = Date.parse('2027-01-04T17:00:00Z') / 1000;
  const plan: NowPlan = {
    goal: 'fastest',
    deadline: null,
    chain: [490],
    end: T0 + 86400,
    endTE: 490,
    legs: null,
    tableLegs: [{ from: 460, to: 490, endTE: 490, start: T0, end: T0 + 86400, label: '2-sale' }],
    exact: false,
    instantTE: null,
    calculatedAt: T0 * 1000,
    planStart: T0,
    spareHours: null,
    runnerUpHours: null,
    meta: null,
    whatIf: null,
  };
  const props = {
    card: { plan, goal: { goal: 'fastest' as const, target: 490, deadline: null }, state: 'this-save' as const },
    onVirtue: true,
    currentEgg: 'curiosity',
    teSoFar: 460,
    ascNow: 1,
    track: null,
    events: [],
    shownEvents: [],
    gear: null,
    now: T0 + 60,
    zone: 'UTC',
    saveSeconds: T0,
    eggDayYear: 2027,
  };
  it('shows the line it is given; none without one', async () => {
    const html = await renderHtml(RightNowCard, { ...props, soulEggsAfter: { text: "Soul eggs left after this plan: about 9.7s (you'll spend about 3.0s on 48 shifts)", amber: false } });
    expect(html).toContain('data-testid="now-soul-eggs-after"');
    expect(textOf(html)).toContain("Soul eggs left after this plan: about 9.7s (you'll spend about 3.0s on 48 shifts)");
    expect(await renderHtml(RightNowCard, props)).not.toContain('now-soul-eggs-after');
  });
});
