import { describe, expect, it } from 'vitest';
import { h1At, phaseNow, phaseWords } from './nowPhase';
import type { NowPlan } from './nowPlan';
import type { LegSummary } from '@/search/types';

const NOW = Date.UTC(2026, 9, 15, 20, 40) / 1000;
const H = 3600;
const leg = (start: number, end: number, endTE: number, shifts: LegSummary['shifts'], maxELR = 0) =>
  ({
    key: 'continue',
    endTE,
    durationSeconds: end - start,
    maxELR,
    endTime: end,
    tier13Unlocked: false,
    startTime: start,
    shifts,
  }) as LegSummary;
const H1 = NOW + 2 * H;
const plan: NowPlan = {
  goal: 'fastest',
  deadline: null,
  chain: [198, 490],
  end: NOW + 300 * H,
  endTE: 490,
  legs: [
    leg(
      NOW - 8 * H,
      NOW + 30 * H,
      198,
      [
        { at: NOW - 2 * H, egg: 'integrity', fromEgg: 'curiosity', te: 41 },
        { at: H1, egg: 'humility', fromEgg: 'integrity', te: 39 },
        { at: H1, egg: 'kindness', fromEgg: 'humility', te: 0 },
      ],
      2e12
    ),
    leg(NOW + 31 * H, NOW + 300 * H, 490, []),
  ],
  tableLegs: null,
  exact: true,
  instantTE: null,
  calculatedAt: (NOW - 2 * H) * 1000,
  planStart: NOW - 8 * H,
  spareHours: null,
  runnerUpHours: null,
  meta: null,
  whatIf: null,
};
const at = (nowSeconds: number, o: Partial<Parameters<typeof phaseNow>[0]> = {}) =>
  phaseNow({ onVirtue: true, plan, nowSeconds, setMatch: 'mix', saveElr: 1e12, ...o });

describe("Right now's badge", () => {
  it("finds Joo's H1 step: Humility, then straight to Kindness", () => {
    expect(h1At(plan.legs![0].shifts)).toBe(H1);
    expect(
      h1At([
        { at: NOW, egg: 'humility' },
        { at: NOW + H, egg: 'integrity' },
      ])
    ).toBeNull();
    expect(h1At(undefined)).toBeNull();
  });

  it('Building before the H1 step, Producing after it', () => {
    expect(at(NOW)?.phase).toBe('building');
    expect(at(H1 + 60)?.phase).toBe('producing');
  });

  it("the rate: the save's when it wears that phase's set, else the plan's projected one", () => {
    expect(at(NOW, { setMatch: 'earnings' })).toEqual({ phase: 'building', elr: 1e12, elrFrom: 'save' });
    expect(at(NOW, { setMatch: 'production' })).toEqual({ phase: 'building', elr: null, elrFrom: null });
    expect(at(H1 + 60, { setMatch: 'production' })).toEqual({ phase: 'producing', elr: 1e12, elrFrom: 'save' });
    expect(at(H1 + 60, { setMatch: 'earnings' })).toEqual({ phase: 'producing', elr: 2e12, elrFrom: 'projected' });
  });

  it('without a timeline, from the set equipped', () => {
    const noLegs = { ...plan, legs: null };
    expect(at(NOW, { plan: noLegs, setMatch: 'production' })?.phase).toBe('producing');
    expect(at(NOW, { plan: null, setMatch: 'earnings' })?.phase).toBe('building');
    expect(at(NOW, { plan: null, setMatch: 'mix' })).toBeNull();
    expect(at(NOW, { plan: null, setMatch: 'both' })).toBeNull();
  });

  it('not on virtue (or not known): no badge', () => {
    expect(at(NOW, { onVirtue: false })).toBeNull();
    expect(at(NOW, { onVirtue: null })).toBeNull();
  });

  it('its words', () => {
    expect(phaseWords({ phase: 'building', elr: null, elrFrom: null })).toEqual({ title: 'Building', rate: '' });
    expect(phaseWords({ phase: 'producing', elr: 1e12, elrFrom: 'save' }).rate).toMatch(
      /^ELR .+\/hr · from your save$/
    );
    expect(phaseWords({ phase: 'producing', elr: 2e12, elrFrom: 'projected' }).rate).toMatch(/· projected$/);
  });
});
