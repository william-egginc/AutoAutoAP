/**
 * THE BUILD-UP LINE ON THE FULL TIMELINE (26 Oct 2026, Jordan: the opening shifts are not in the instant answer). At the
 * start of each ascension from the table: "You do the build-up for 2 sales, then start producing at 3.574q/hr", from
 * the leg's variant and its rate (RouteLeg.peakELR, carried by the estimate and the background re-pricing); the
 * current ascension simulated on the save takes its variant and peak (LegSummary.key, maxELR). None for continue.
 */
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import AscensionList from './AscensionList.vue';
import RightNowCard from './RightNowCard.vue';
import { stepLegsOf, withTableShifts, type NowPlan } from '@/lib/nowPlan';
import { ascensionSteps } from '@/lib/instantSteps';
import { planFromEstimate } from '@/lib/followEstimate';
import { simLegOf, withCurrentSim, type SimLeg } from '@/lib/followSim';
import type { Route } from '@/search/routeFinder';
import type { LegSummary } from '@/search/types';

const ZONE = 'America/Los_Angeles';
const H = 3600;
const D = 86400;
const T0 = Date.parse('2027-01-04T17:00:00Z') / 1000;
// 3.574q/hr, 4.5q/hr and 5.1q/hr in eggs per second.
const R2 = 3.574e15 / 3600;
const R3 = 4.5e15 / 3600;
const R4 = 5.1e15 / 3600;

/** A1 the save's own continue, A2 a 2-sale tier-13 build, A3 a 1-sale, A4 a 3-sale whose rate is not known. */
function route(withRates = true): Route {
  const a2 = T0 + 1 * D;
  const a3 = T0 + 4 * D;
  const a4 = T0 + 8 * D;
  const rate = (r: number) => (withRates ? { peakELR: r } : {});
  return {
    chain: [226, 277, 317, 490],
    end: a4 + 3 * D,
    seconds: a4 + 3 * D - T0,
    legs: [
      { from: 200, to: 226, endTE: 226, start: T0, end: a2, sales: 0, tier13: false, label: 'continue' },
      { from: 226, to: 277, endTE: 277, start: a2, end: a3, sales: 2, tier13: true, label: '2-sale-tier13', ...rate(R2) },
      { from: 277, to: 317, endTE: 317, start: a3, end: a4, sales: 1, tier13: false, label: '1-sale', ...rate(R3) },
      { from: 317, to: 490, endTE: 490, start: a4, end: a4 + 3 * D, sales: 3, tier13: false, label: '3-sale' },
    ],
  };
}
const SOURCE = { meta: null, pricing: { v: 1 as const, final: 490, options: { startTE: 200, start: T0, firstLegs: [] } } };
const plan = (withRates = true): NowPlan => planFromEstimate(route(withRates), { goal: 'fastest', deadline: null }, SOURCE, T0 * 1000);

/** As useNowPage builds the Full timeline's lines. */
const linesOf = (p: NowPlan) =>
  ascensionSteps(
    stepLegsOf(p).map((l, i) => ({
      ...l,
      ...(p.tableLegs?.[i]?.shifts ? { shifts: p.tableLegs[i].shifts } : {}),
      ...(p.tableLegs?.[i]?.simulated ? { simulated: true } : {}),
      ...(p.tableLegs?.[i]?.variant ? { variant: p.tableLegs[i].variant } : {}),
      ...(p.tableLegs?.[i]?.label ? { label: p.tableLegs[i].label } : {}),
      ...(p.tableLegs?.[i]?.peakELR !== undefined ? { peakELR: p.tableLegs[i].peakELR } : {}),
    })),
    null,
    null
  );

describe('the rate reaches the plan (planFromEstimate, withTableShifts)', () => {
  it('each table leg keeps its rate; a leg without one has none', () => {
    expect(plan().tableLegs!.map(l => l.peakELR)).toEqual([undefined, R2, R3, undefined]);
    expect(plan(false).tableLegs!.every(l => l.peakELR === undefined)).toBe(true);
  });

  it('the instant answer\'s own route re-priced in the background brings its rates onto the same legs only', () => {
    const bare = plan(false);
    expect(withTableShifts(bare, route(true)).tableLegs!.map(l => l.peakELR)).toEqual([undefined, R2, R3, undefined]);
    const moved = { ...route(true), legs: route(true).legs.map((l, i) => (i === 2 ? { ...l, end: l.end + D } : l)) };
    expect(withTableShifts(bare, moved).tableLegs!.map(l => l.peakELR)).toEqual([undefined, R2, undefined, undefined]);
    // A leg that already has a rate keeps it.
    const other = { ...route(true), legs: route(true).legs.map(l => (l.peakELR ? { ...l, peakELR: 1 } : l)) };
    expect(withTableShifts(plan(), other).tableLegs!.map(l => l.peakELR)).toEqual([undefined, R2, R3, undefined]);
  });
});

describe('ascensionSteps: one build-up line per fresh ascension from the table', () => {
  it('none for the save\'s own continue, the sales and rate for each build, the sales alone without a rate', () => {
    expect(linesOf(plan()).map(l => l.buildUp)).toEqual([
      undefined,
      'You do the build-up for 2 sales, then start producing at 3.574q/hr',
      'You do the build-up for 1 sale, then start producing at 4.500q/hr',
      'You do the build-up for 3 sales',
    ]);
    expect(linesOf(plan(false)).map(l => l.buildUp)).toEqual([
      undefined,
      'You do the build-up for 2 sales',
      'You do the build-up for 1 sale',
      'You do the build-up for 3 sales',
    ]);
  });
});

describe('the ascension you are in, simulated', () => {
  const sim = (key: string, maxELR?: number): SimLeg => ({
    key,
    startTime: T0,
    endTime: T0 + 20 * H,
    endTE: 226,
    buildPhaseEndTime: T0 + 6 * H,
    shifts: [{ at: T0 + 8 * H, egg: 'humility' }],
    ...(maxELR !== undefined ? { maxELR } : {}),
  });
  // The table's A1 as a fresh 1-sale from first legs, with its own rate: the simulation replaces both.
  const freshA1 = (): NowPlan => {
    const p = plan();
    return { ...p, tableLegs: p.tableLegs!.map((l, i) => (i === 0 ? { ...l, label: '1-sale', peakELR: R3 } : l)) };
  };

  it('its variant and peak (LegSummary.key, maxELR) give the line', () => {
    const lines = linesOf(withCurrentSim(freshA1(), sim('3-sale-tier13', R4)));
    expect(lines[0].buildUp).toBe('You do the build-up for 3 sales, then start producing at 5.100q/hr');
  });

  it('a simulated continue has none, even where the table had a build', () => {
    expect(linesOf(withCurrentSim(freshA1(), sim('continue', R4)))[0].buildUp).toBeUndefined();
    expect(linesOf(withCurrentSim(freshA1(), sim('buildup', R4)))[0].buildUp).toBeUndefined();
  });

  it('without its peak (a record kept before it was stored): the sales alone, not the table\'s rate', () => {
    const p = withCurrentSim(freshA1(), sim('2-sale'));
    expect(p.tableLegs![0].peakELR).toBeUndefined();
    expect(linesOf(p)[0].buildUp).toBe('You do the build-up for 2 sales');
  });

  it('simLegOf keeps the simulated leg\'s maxELR, and none when it has no usable one', () => {
    const leg = { key: '2-sale', endTE: 226, durationSeconds: 20 * H, maxELR: R2, endTime: T0 + 20 * H, startTime: T0, tier13Unlocked: false };
    expect(simLegOf(leg as LegSummary)!.maxELR).toBe(R2);
    expect(simLegOf({ ...leg, maxELR: 0 } as LegSummary)!.maxELR).toBeUndefined();
    expect(simLegOf({ ...leg, maxELR: NaN } as LegSummary)!.maxELR).toBeUndefined();
  });
});

describe('AscensionList.vue and Right now\'s Full timeline', () => {
  it('the line under each ascension it applies to, before its shifts; none on A1 (continue)', async () => {
    const html = await renderHtml(AscensionList, { lines: linesOf(plan()), zone: ZONE });
    expect(html.match(/data-testid="now-ascension-buildup"/g)).toHaveLength(3);
    const t = textOf(html);
    expect(t).toContain('You do the build-up for 2 sales, then start producing at 3.574q/hr');
    expect(t).toContain('You do the build-up for 1 sale, then start producing at 4.500q/hr');
    expect(t).toContain('You do the build-up for 3 sales');
    expect(t).not.toContain('You do the build-up for 3 sales, then');
    // A1 has no line; A2's comes after its own header and before A3's.
    const a1 = t.indexOf('A1'), a2 = t.indexOf('A2'), a3 = t.indexOf('A3');
    const line = t.indexOf('You do the build-up for 2 sales');
    expect(t.slice(a1, a2)).not.toContain('build-up');
    expect(line).toBeGreaterThan(a2);
    expect(line).toBeLessThan(a3);
  });

  it('wraps at phone width: no nowrap or horizontal scroll on the line', async () => {
    const html = await renderHtml(AscensionList, { lines: linesOf(plan()), zone: ZONE });
    const lines = html.match(/<p[^>]*data-testid="now-ascension-buildup"[^>]*>[^<]*<\/p>/g)!;
    expect(lines).toHaveLength(3);
    for (const l of lines) {
      expect(l).toContain('break-words');
      expect(l).not.toMatch(/whitespace-nowrap|overflow-x-(auto|scroll)|\bw-\[\d{3,}px\]/);
    }
  });

  it('on Right now\'s card, with the plan\'s other lines', async () => {
    const p = plan();
    const html = await renderHtml(RightNowCard, {
      card: { plan: p, goal: { goal: 'fastest', target: 490, deadline: null }, state: 'this-save' },
      onVirtue: true,
      currentEgg: 'curiosity',
      teSoFar: 200,
      ascNow: 1,
      track: null,
      events: [],
      shownEvents: [],
      gear: null,
      now: T0 + H,
      zone: ZONE,
      saveSeconds: T0,
      eggDayYear: 2027,
      ascensions: linesOf(p),
    });
    expect(html).toContain('data-testid="now-ascensions"');
    expect(textOf(html)).toContain('You do the build-up for 2 sales, then start producing at 3.574q/hr');
  });
});
