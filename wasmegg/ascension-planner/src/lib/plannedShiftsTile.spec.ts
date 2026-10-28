/**
 * ALL PLANNED SHIFTS, PLAINER (ux34-a item 2, 28 Oct 2026): the tile reads "41 shifts, will cost about 2.3s soul eggs
 * (at today's prices), about 18 of them build-up shifts (estimated)". The build-up part only when estimated build-up
 * shifts are included; singular and plural; "no shifts planned" with none. One source with Right now's line "You'll
 * have about 10.4s soul eggs left when this plan is done (about 2.3s goes on 41 shifts …)" (lib/soulEggs.ts): the
 * same count and the same cost, written the same way.
 */
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import YourEggs from '@/components/myruns/YourEggs.vue';
import { formatNumber } from './format';
import { plannedShiftsCost } from './shiftCost';
import { plannedShiftsWords, soulEggsAfterLine } from './soulEggs';

const SE = 12.7e21;
const DONE = 20;
const planned = (count: number, opening = 0, partial = false) => ({
  count,
  cost: plannedShiftsCost(SE, DONE, count),
  opening,
  ...(partial ? { partial: true } : {}),
});

describe('plannedShiftsWords (lib/soulEggs.ts)', () => {
  it('41 shifts, the cost at today\'s prices, about 18 of them build-up shifts (estimated)', () => {
    const p = planned(41, 18);
    expect(plannedShiftsWords(p)).toEqual({
      value: '41 shifts',
      note: `will cost about ${formatNumber(p.cost, 1)} soul eggs (at today's prices), about 18 of them build-up shifts (estimated)`,
    });
  });
  it('no build-up part without estimated shifts; singular', () => {
    const p = planned(12);
    expect(plannedShiftsWords(p).note).toBe(`will cost about ${formatNumber(p.cost, 1)} soul eggs (at today's prices)`);
    expect(plannedShiftsWords(planned(1)).value).toBe('1 shift');
    expect(plannedShiftsWords(planned(5, 1)).note).toMatch(/, about 1 of them a build-up shift \(estimated\)$/);
    expect(plannedShiftsWords(planned(1, 1)).note).toMatch(/, a build-up shift \(estimated\)$/);
  });
  it("the instant answer's shifts only: says what is left out", () => {
    expect(plannedShiftsWords(planned(12, 0, true)).note).toMatch(
      /\(at today's prices\), the shifts listed, without each new ascension's first hours$/
    );
  });
  it('no shifts planned', () => {
    expect(plannedShiftsWords(planned(0))).toEqual({ value: 'no shifts planned', note: '' });
  });
});

describe("the same figures as Right now's soul eggs line", () => {
  it('count and cost match, written alike', () => {
    const p = planned(41, 18);
    const w = plannedShiftsWords(p);
    const line = soulEggsAfterLine({ soulEggs: SE, done: DONE, planned: p })!.text;
    const cost = formatNumber(p.cost, 1);
    expect(w.note).toContain(`about ${cost} soul eggs`);
    expect(line).toContain(`about ${cost} goes on 41 shifts`);
  });
  it("the line takes the tile's cost when given (one source)", () => {
    const line = soulEggsAfterLine({ soulEggs: SE, done: DONE, planned: { count: 41, cost: 2.3e21 } })!.text;
    expect(line).toContain('about 2.3s goes on 41 shifts');
    expect(line).toContain(`about ${formatNumber(SE - 2.3e21, 1)} soul eggs left`);
  });
});

describe('YourEggs renders it', () => {
  const base = { eggs: [], facts: null, shiftsDone: DONE, nextShiftCost: null, clothedEquipped: null, clothedEarnings: null, now: 0, saveSeconds: 0 };
  it('the tile reads as one sentence', async () => {
    const p = planned(41, 18);
    const t = textOf(await renderHtml(YourEggs, { ...base, plannedShifts: p }));
    expect(t).toContain(
      `All planned shifts 41 shifts will cost about ${formatNumber(p.cost, 1)} soul eggs (at today's prices), about 18 of them build-up shifts (estimated)`
    );
  });
});
