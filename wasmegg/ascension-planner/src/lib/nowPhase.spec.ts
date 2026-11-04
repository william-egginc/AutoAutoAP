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
  // The save on the plan's egg at that time (integrity before H1, kindness after): the plan agrees with it.
  phaseNow({ onVirtue: true, plan, nowSeconds, setMatch: 'mix', saveEgg: nowSeconds < H1 ? 'integrity' : 'kindness', saveElr: 1e12, ...o });

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
    // The set worn decides the phase (30 Oct 2026: before, the plan's H1 step did, and the badge flipped).
    expect(at(NOW, { setMatch: 'production' })).toEqual({ phase: 'producing', elr: 1e12, elrFrom: 'save' });
    expect(at(H1 + 60, { setMatch: 'production' })).toEqual({ phase: 'producing', elr: 1e12, elrFrom: 'save' });
    expect(at(H1 + 60, { setMatch: 'earnings' })).toEqual({ phase: 'building', elr: 1e12, elrFrom: 'save' });
    // No rate from the save: the agreeing plan's projected one.
    expect(at(H1 + 60, { setMatch: 'production', saveElr: null })).toEqual({ phase: 'producing', elr: 2e12, elrFrom: 'projected' });
    // "A mix": the plan's projected rate for either phase when it has legs.
    expect(at(NOW, { setMatch: 'mix' })?.elrFrom).toBe('projected');
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

  // 30 Oct 2026 (alt A1): the badge flipped Building/Producing with which request finished first. The save wins.
  describe('the save wins over the followed route', () => {
    const D = 24 * H;
    // A followed route planned from an older state: still on Kindness now, C3 in an hour, H1 a day out.
    const stale: NowPlan = {
      ...plan,
      chain: [209, 287, 490],
      legs: [
        leg(
          NOW - 10 * H,
          NOW + 3 * D,
          209,
          [
            { at: NOW + H, egg: 'curiosity', fromEgg: 'kindness', te: 0 },
            { at: NOW + D, egg: 'humility', fromEgg: 'curiosity', te: 0 },
            { at: NOW + D, egg: 'kindness', fromEgg: 'humility', te: 0 },
          ],
          3e12
        ),
        leg(NOW + 3 * D + H, NOW + 20 * D, 490, []),
      ],
      planStart: NOW - 10 * H,
    };
    const tableOnly: NowPlan = {
      ...stale,
      legs: null,
      tableLegs: [
        { start: NOW - 10 * H, end: NOW + 3 * D, from: 146, to: 209, endTE: 209 },
        { start: NOW + 3 * D + H, end: NOW + 20 * D, from: 209, to: 490, endTE: 490 },
      ],
    };
    const alt = (o: Partial<Parameters<typeof phaseNow>[0]> = {}) =>
      phaseNow({ onVirtue: true, plan: stale, nowSeconds: NOW, setMatch: 'production', saveEgg: 'kindness', saveElr: 1e12, ...o });

    it('production set on, the plan saying a future Humility: Producing, with or without the simulated legs', () => {
      expect(alt()).toEqual({ phase: 'producing', elr: 1e12, elrFrom: 'save' });
      expect(alt({ plan: tableOnly })).toEqual(alt());
    });

    it('earnings set on: Building, whatever the plan says', () => {
      expect(alt({ setMatch: 'earnings' })?.phase).toBe('building');
      expect(at(H1 + 60, { setMatch: 'earnings', saveEgg: 'kindness' })?.phase).toBe('building');
    });

    it("the save's egg isn't the plan's at now: the plan is ignored, the set decides", () => {
      // On a mix: the plan alone would say Building (H1 ahead); on another egg it can't say.
      expect(alt({ setMatch: 'mix', saveEgg: 'kindness' })?.phase).toBe('building');
      expect(alt({ setMatch: 'mix', saveEgg: 'curiosity' })).toBeNull();
      expect(alt({ setMatch: 'mix', saveEgg: null })).toBeNull();
      expect(alt({ setMatch: 'production', saveEgg: 'curiosity' })?.phase).toBe('producing');
    });
  });

  it('its words', () => {
    expect(phaseWords({ phase: 'building', elr: null, elrFrom: null })).toEqual({ title: 'Building', rate: '' });
    expect(phaseWords({ phase: 'producing', elr: 1e12, elrFrom: 'save' }).rate).toMatch(
      /^.+\/hr · from your save$/
    );
    expect(phaseWords({ phase: 'producing', elr: 2e12, elrFrom: 'projected' }).rate).toMatch(/· projected$/);
  });
});
