/**
 * Every egg's next TE on Your eggs (Jordan, 26 Oct 2026): over 100 TE full habs at once (remaining / max ELR); at or
 * below, the habs refill at the IHR and the eggs laid meanwhile count (lib/nextTeEgg.ts).
 */
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import YourEggs from '@/components/myruns/YourEggs.vue';
import {
  aboutWords,
  afterShiftLine,
  afterShiftLines,
  afterShiftNote,
  eggNextTeSeconds,
  rampSeconds,
  shiftRates,
  type ShiftRates,
} from './nextTeEgg';
import { farmFacts } from './farmFacts';
import { nextTEThreshold, TE_BREAKPOINTS } from './truthEggs';
import type { CurrentFarmState } from '@/types';

const H = 3600;
const D = 86400;
const ZONE = 'America/Los_Angeles';
// Fri 15 Oct 2027, 2:40 pm PDT.
const NOW = Date.parse('2027-10-15T21:40:00Z') / 1000;

const near = (got: number, want: number) => expect(Math.abs(got - want) / want).toBeLessThan(0.001);

describe('the ramp: habs filling at the IHR, the eggs laid meanwhile counted', () => {
  // 10 chickens a second into 1,000 places, 2 eggs a chicken a second: 2,000 eggs a second at full habs, after 100 s,
  // with 100,000 eggs laid on the way (∫0..100 20 t dt).
  const r = { pop0: 0, ihr: 10, maxHabs: 1000, perChicken: 2, maxElr: 2000 };

  it('past full habs: the hand-worked piecewise integral', () => {
    // 100 s to fill (100,000 eggs), then 200,000 more at 2,000 a second: 100 s.
    near(rampSeconds(300_000, r), 200);
  });

  it('reached before the habs are full: eggs(T) = 10 T², T = sqrt(remaining / 10)', () => {
    near(rampSeconds(40_000, r), Math.sqrt(4000));
    expect(rampSeconds(40_000, r)).toBeLessThan(100);
  });

  it('takes longer than remaining / max ELR (by half the fill time once full)', () => {
    for (const rem of [1e4, 1e5, 3e5, 1e7]) expect(rampSeconds(rem, r)).toBeGreaterThan(rem / r.maxElr);
    near(rampSeconds(1e7, r) - 1e7 / r.maxElr, 50);
  });

  it('from a part-full farm (the egg being laid): 500 chickens, full after 50 s with 75,000 laid', () => {
    near(rampSeconds(175_000, { ...r, pop0: 500 }), 100);
    // Already full: the plain rate.
    near(rampSeconds(1e6, { ...r, pop0: 1000 }), 500);
  });

  it('shipping-limited: the rate stops at the shipping when the habs are 3/4 full', () => {
    const s = { ...r, maxElr: 1500 };
    // 75 s to 1,500 a second, 56,250 laid; 93,750 more at 1,500 a second: 62.5 s.
    near(rampSeconds(150_000, s), 137.5);
  });

  it('nothing to do, or no way there', () => {
    expect(rampSeconds(0, r)).toBe(0);
    expect(rampSeconds(100, { ...r, ihr: 0 })).toBe(Infinity);
  });
});

describe('the next TE per egg', () => {
  const rates: ShiftRates = { maxHabs: 1e10, perChicken: 1e3, maxElr: 1e13, ihr: 5e4 };
  const delivered = 3e15;
  const remaining = nextTEThreshold(delivered) - delivered;

  it('over 100 TE: remaining / max ELR, for an egg after a shift and for the egg being laid', () => {
    const after = eggNextTeSeconds({ delivered, current: false, population: 0, totalTe: 150, rates });
    const laid = eggNextTeSeconds({ delivered, current: true, population: 3e9, totalTe: 150, rates });
    expect(after).toBeCloseTo(remaining / rates.maxElr, 6);
    expect(laid).toBeCloseTo(remaining / rates.maxElr, 6);
  });

  it('at or below 100 TE: the ramp, longer than the plain rate; the egg being laid starts from its chickens', () => {
    const after = eggNextTeSeconds({ delivered, current: false, population: 0, totalTe: 100, rates })!;
    expect(after).toBeCloseTo(rampSeconds(remaining, { ...rates, pop0: 0 }), 6);
    expect(after).toBeGreaterThan(remaining / rates.maxElr);
    const laid = eggNextTeSeconds({ delivered, current: true, population: 5e9, totalTe: 100, rates })!;
    expect(laid).toBeLessThan(after);
  });

  it('nothing at the TE cap or without rates', () => {
    const top = TE_BREAKPOINTS[TE_BREAKPOINTS.length - 1] + 1;
    expect(eggNextTeSeconds({ delivered: top, current: false, population: 0, totalTe: 50, rates })).toBeNull();
    expect(eggNextTeSeconds({ delivered, current: false, population: 0, totalTe: 50, rates: null })).toBeNull();
  });
});

describe('the words', () => {
  it('rounded: minutes under an hour, hours and minutes under two days, days and whole hours after', () => {
    expect(aboutWords(25 * 60)).toBe('~25 min');
    expect(aboutWords(59.7 * 60)).toBe('~1 h');
    expect(aboutWords(18 * H + 28 * 60 + 10)).toBe('~18 h 28 m');
    expect(aboutWords(47 * H)).toBe('~47 h');
    expect(aboutWords(2 * D + 4 * H + 20 * 60)).toBe('~2 d 4 h');
    expect(aboutWords(12 * D + 23.6 * H)).toBe('~13 d');
    expect(afterShiftLine(2 * D + 4 * H)).toBe('next TE in ~2 d 4 h after you shift here');
  });

  it('over 10 years: not at this rate; no time: nothing', () => {
    expect(afterShiftLine(3651 * D)).toBe('next TE after you shift here: not at this rate (over 10 years)');
    expect(afterShiftLine(3649 * D)).toMatch(/^next TE in ~3649 d/);
    expect(afterShiftLine(null)).toBeNull();
  });

  it('the note says how, and the save it is from', () => {
    const save = NOW - 3 * H;
    expect(afterShiftNote(150, save, NOW, ZONE)).toBe(
      'After a shift: your farm, research and artifacts as in the save, habs full straight away (over 100 TE) · estimated from your save of Oct 15 at 11:40 AM'
    );
    expect(afterShiftNote(80, save, NOW, ZONE)).toContain('habs refilling at your internal hatchery rate, the eggs laid meanwhile counted');
  });

  it('lines for the eggs the player is not on, none for the egg being laid or one at the cap', () => {
    const rates: ShiftRates = { maxHabs: 1e10, perChicken: 1e3, maxElr: 1e13, ihr: 5e4 };
    const top = TE_BREAKPOINTS[TE_BREAKPOINTS.length - 1] + 1;
    const lines = afterShiftLines({
      eggs: [
        { egg: 'curiosity', current: true },
        { egg: 'integrity', current: false },
        { egg: 'humility', current: false },
      ],
      delivered: { curiosity: 1e15, integrity: 1e15, humility: top },
      totalTe: 200,
      rates,
    });
    expect(Object.keys(lines)).toEqual(['integrity']);
    expect(lines.integrity).toMatch(/^next TE in ~.* after you shift here$/);
    expect(afterShiftLines({ eggs: [{ egg: 'integrity', current: false }], delivered: {}, totalTe: 50, rates: null })).toEqual({});
  });
});

describe('the rates from the save', () => {
  const farm: CurrentFarmState = {
    eggType: 50,
    cash: 0,
    numSilos: 1,
    commonResearches: { comfy_nests: 20, internal_hatchery1: 10 },
    habs: [18, 18, 18, 18],
    vehicles: [{ vehicleId: 11, trainLength: 10 }],
    population: 1e6,
    deliveredEggs: 0,
    lastStepTime: 0,
    cashEarned: 0,
    cashSpent: 0,
  };
  const base = { farm, epic: {}, colleggtibles: { habCap: 1, elr: 1, shippingCap: 1, ihr: 1 }, equipped: [] };

  it("full habs are the save's own rate source at full population; the IHR grows 1.1x a TE", () => {
    const r = shiftRates({ ...base, totalTe: 50 })!;
    const full = farmFacts({ ...base, farm: { ...farm, population: 1e15 } })!;
    expect(r.maxHabs).toBeCloseTo(full.habCapacity, 3);
    // farmFacts at a population past the habs lays more than the habs can hold: cap it there to compare.
    const atCap = farmFacts({ ...base, farm: { ...farm, population: full.habCapacity } })!;
    expect(r.maxElr).toBeCloseTo(atCap.elr, 3);
    expect(r.ihr).toBeGreaterThan(0);
    const r60 = shiftRates({ ...base, totalTe: 60 })!;
    expect(r.ihr).toBeGreaterThan(500 / 60);
    near(r60.ihr / r.ihr, Math.pow(1.1, 10));
    expect(shiftRates({ ...base, farm: null, totalTe: 50 })).toBeNull();
  });
});

describe('Your eggs with several eggs (server render)', () => {
  const props = {
    eggs: [
      { egg: 'curiosity', te: 41, progress: 0.6, current: false, nextInSeconds: null },
      { egg: 'integrity', te: 38, progress: 0.35, current: true, nextInSeconds: 18 * H + 28 * 60 },
      { egg: 'humility', te: 98, progress: 1, current: false, nextInSeconds: null },
      { egg: 'resilience', te: 12, progress: 0.1, current: false, nextInSeconds: null },
    ],
    facts: { habCapacity: 1e4, habFull: 1, elr: 1, siloMinutes: 60 },
    shiftsDone: 10,
    nextShiftCost: null,
    plannedShifts: null,
    clothedEquipped: null,
    clothedEarnings: null,
    now: NOW,
    saveSeconds: NOW,
    zone: ZONE,
    afterShift: {
      lines: { curiosity: 'next TE in ~2 d 4 h after you shift here', resilience: 'next TE in ~25 min after you shift here' },
      note: 'After a shift: … · estimated from your save of Oct 15 at 2:40 PM',
    },
  };

  it('a line under each egg the player is not on; the egg being laid keeps its words; nothing for an egg without one', async () => {
    const html = await renderHtml(YourEggs, props);
    const t = textOf(html);
    expect(t).toContain('next TE in 18 h 28 m at your save\'s rate');
    expect(t).toContain('Curiosity 41 TE');
    expect(t).toContain('next TE in ~2 d 4 h after you shift here');
    expect(t).toContain('next TE in ~25 min after you shift here');
    expect(html.match(/data-testid="now-egg-after-shift"/g)?.length).toBe(2);
    // The time line stands in for "N% to the next TE · after a shift"; Humility, with no time, keeps it.
    expect(t).not.toContain('60% to the next TE');
    expect(t).not.toContain('10% to the next TE');
    expect(t).toContain('100% to the next TE · after a shift');
    expect(t).toContain('estimated from your save of Oct 15 at 2:40 PM');
  });

  it('phone width: one column, the lines wrap, the type scale (no size under 11 px, no caps)', async () => {
    const html = await renderHtml(YourEggs, props);
    expect(html).toContain('grid-cols-1 sm:grid-cols-5');
    const lines = html.match(/<p[^>]*data-testid="now-egg-after-shift"[^>]*>/g) ?? [];
    for (const p of lines) {
      expect(p).toContain('break-words');
      expect(p).toContain('text-body');
      expect(p).toContain('tabular-nums');
      expect(p).not.toMatch(/text-\[(\d|10)px\]|uppercase|whitespace-nowrap/);
    }
    const note = html.match(/<p[^>]*data-testid="now-eggs-after-shift-note"[^>]*>/)?.[0] ?? '';
    expect(note).toContain('text-small');
    expect(note).toContain('break-words');
  });

  it('without after-shift lines (no data): no line and no note', async () => {
    const html = await renderHtml(YourEggs, { ...props, afterShift: null });
    expect(html).not.toContain('now-egg-after-shift');
    expect(textOf(html)).toContain('60% to the next TE · after a shift');
  });
});
