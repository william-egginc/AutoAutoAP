import { describe, expect, it } from 'vitest';
import { firstLegShifts, oneMoreTE } from './routeExtras';
import { renderHtml, textOf } from '@/test/renderComponent';
import RouteExtras from '@/components/auto/RouteExtras.vue';
import { getThresholdForTE } from '@/lib/truthEggs';
import type { LegSummary } from './types';

const T0 = Date.UTC(2026, 9, 13, 22, 0) / 1000; // Tue Oct 13, 4 pm MDT
const leg = (over: Partial<LegSummary>): LegSummary =>
  ({ key: '2-sale-tier13', endTE: 166, durationSeconds: 86400, maxELR: 1e12, ...over }) as LegSummary;
const shifts = [
  { at: T0, egg: 'humility' },
  { at: T0 + 2 * 86400 + 1800, egg: 'integrity' },
];
const tes = [52, 50, 49, 48, 48];
const endLeg = leg({
  endTE: 247,
  endTime: T0 + 100 * 86400,
  maxELR: 2.4e11,
  endEggs: { delivered: tes.map(t => getThresholdForTE(t) * 1.02), te: tes, egg: 'curiosity' },
} as Partial<LegSummary>);

describe('firstLegShifts', () => {
  it("the first leg's shifts, in order; nothing when not recorded", () => {
    expect(firstLegShifts([leg({ shifts }), leg({ shifts: [{ at: 1, egg: 'x' }] })])).toEqual(shifts);
    expect(firstLegShifts([leg({})])).toEqual([]);
    expect(firstLegShifts(null)).toEqual([]);
  });
});

describe('oneMoreTE', () => {
  it("a run's measured cost first", () => {
    expect(oneMoreTE({ chain: [166, 247], reachAt: T0, runCost: 10 * 3600 })).toEqual({
      te: 248,
      seconds: 36000,
      at: T0 + 36000,
      how: 'run',
    });
  });
  it("else the last leg's final rate; nothing at 490 or with noRate", () => {
    const m = oneMoreTE({ chain: [166, 247], legs: [leg({}), endLeg], reachAt: T0 + 100 * 86400 });
    expect(m?.how).toBe('rate');
    expect(m?.te).toBe(248);
    expect(m!.seconds).toBeGreaterThan(0);
    expect(oneMoreTE({ chain: [166, 247], legs: [leg({}), endLeg], reachAt: T0, noRate: true })).toBeNull();
    expect(oneMoreTE({ chain: [300, 490], reachAt: T0, runCost: 3600 })).toBeNull();
  });
});

describe('RouteExtras', () => {
  it('folds the shifts into one line, then a list "Shift to Humility · Tue Oct 13, 4 pm"', async () => {
    const t = textOf(
      await renderHtml(RouteExtras, { chain: [166, 247], legs: [leg({ shifts })], reachAt: T0, zone: 'America/Denver', runCost: 36000 })
    );
    expect(t).toContain('First ascension: 2 egg shifts, Tue Oct 13, 4 pm to Thu Oct 15, 4:30 pm');
    expect(t).toContain('Shift to Humility · Tue Oct 13, 4 pm');
    expect(t).toContain('Shift to Integrity · Thu Oct 15, 4:30 pm');
    expect(t).toMatch(/One more TE \(248\): about 10 h later, about Wed Oct 14, 2 am ?\./);
  });
  it('nothing to say: nothing drawn', async () => {
    expect(textOf(await renderHtml(RouteExtras, { chain: [300, 490], legs: [leg({})], reachAt: T0, zone: 'UTC' }))).toBe('');
  });
});
