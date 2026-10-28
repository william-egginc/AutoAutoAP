/**
 * PLANNED SHIFT COUNT IS TOO LOW (27 Oct 2026, Jordan: "All planned shifts 24" while Single run said +48 for the same
 * plan). The instant answer's shifts start at H1, so each fresh ascension's opening (K1, I1, C2, K2, R1, C3) was left
 * out. Until the table carries them, each fresh ascension from the table adds the simulator's standard opening
 * (lib/openingShifts.ts), said as "about N of them build-up shifts (estimated)" (ux34-a; was "includes about N …").
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import { eggOfShift } from '@/auto/hold';
import AscensionList from '@/components/myruns/AscensionList.vue';
import YourEggs from '@/components/myruns/YourEggs.vue';
import { ascensionSteps } from './instantSteps';
import { plannedShiftsAfter, shiftsAfter, stepLegsOf, type NowPlan } from './nowPlan';
import { OPENING_SHIFTS, OPENING_SHIFT_COUNT, estimatedOpening } from './openingShifts';

const H = 3600;
const D = 86400;
const T0 = Date.parse('2027-01-04T17:00:00Z') / 1000;
const ZONE = 'America/Los_Angeles';

/** The table's shifts of one ascension: from H1 on (search/legShifts.ts). */
const tail = (start: number) => [
  { at: start + 30 * H, egg: 'humility' },
  { at: start + 31 * H, egg: 'kindness' },
  { at: start + 2 * D, egg: 'curiosity' },
  { at: start + 2.5 * D, egg: 'integrity' },
];
/** A fresh ascension's own opening, as a future table (or the simulator) would list it. */
const opening = (start: number) => OPENING_SHIFTS.map((s, k) => ({ at: start + (k + 1) * 600, egg: s.egg }));

type Leg = NonNullable<NowPlan['tableLegs']>[number];
function planOf(legs: Leg[], over: Partial<NowPlan> = {}): NowPlan {
  return {
    goal: 'fastest',
    deadline: null,
    chain: legs.map(l => l.to),
    end: legs[legs.length - 1].end,
    endTE: legs[legs.length - 1].endTE,
    legs: null,
    tableLegs: legs,
    exact: false,
    instantTE: null,
    calculatedAt: T0 * 1000,
    planStart: T0,
    spareHours: null,
    runnerUpHours: null,
    meta: null,
    whatIf: null,
    ...over,
  };
}
const fresh = (i: number, to: number, label = '2-sale'): Leg => {
  const start = T0 + H + i * 4 * D;
  return { from: to - 30, to, endTE: to, start, end: start + 4 * D, label, shifts: tail(start) };
};

describe('the standard opening comes from the simulator (src/auto/ascension.ts, read only)', () => {
  it('six shifts: K1, I1 of the first C1 -> K1 -> I1 pass, then C2, K2, R1 and C3; each to its egg', () => {
    expect(OPENING_SHIFT_COUNT).toBe(6);
    expect(OPENING_SHIFTS.map(s => s.name)).toEqual(['K1', 'I1', 'C2', 'K2', 'R1', 'C3']);
    for (const s of OPENING_SHIFTS) expect(s.egg).toBe(eggOfShift(s.name));
    const src = readFileSync(resolve(__dirname, '../auto/ascension.ts'), 'utf8');
    // A fresh ascension starts on Curiosity (C1 has no shift) and its first pass is C1 -> K1 -> I1.
    expect(src).toContain("currentEgg: 'curiosity'");
    expect(src).toContain("continueOpening(empty, 'CKI', context, 'CKI')");
    // Then the listed shifts up to C3, in this order.
    const order = [...src.matchAll(/\{ name: '([A-Z]\d)', run: run[A-Z]\d \}/g)].map(m => m[1]);
    expect(order.slice(0, order.indexOf('C3') + 1)).toEqual(['C2', 'K2', 'R1', 'C3']);
  });
});

describe('plannedShiftsAfter (lib/nowPlan.ts)', () => {
  it('4 fresh ascensions from the table: the shifts listed + 4 x the standard opening', () => {
    const p = planOf([fresh(0, 300), fresh(1, 330, '1-sale-tier13'), fresh(2, 360), fresh(3, 490, '3-sale')]);
    const listed = shiftsAfter(p, T0);
    expect(listed).toBe(16);
    expect(plannedShiftsAfter(p, T0)).toEqual({ count: 16 + 4 * OPENING_SHIFT_COUNT, listed: 16, opening: 4 * OPENING_SHIFT_COUNT });
  });

  it('the simulated current ascension (exact, its opening inside) is not counted twice', () => {
    const start = T0 - 2 * H;
    const sim: Leg = { from: 270, to: 300, endTE: 300, start, end: start + 3 * D, simulated: true, variant: '2-sale', shifts: [...opening(start), ...tail(start)] };
    const p = planOf([sim, fresh(1, 330), fresh(2, 360)]);
    // The simulated one's shifts after the save: its opening ran from start + 10 min to start + 1 h, all before T0.
    expect(plannedShiftsAfter(p, T0)).toEqual({ count: 4 + 8 + 2 * OPENING_SHIFT_COUNT, listed: 12, opening: 2 * OPENING_SHIFT_COUNT });
    // Simulated from the save on (started after it): still none added.
    const later = { ...sim, start: T0 + H, shifts: [...opening(T0 + H), ...tail(T0 + H)] };
    expect(plannedShiftsAfter(planOf([later]), T0)).toEqual({ count: 10, listed: 10, opening: 0 });
  });

  it('continue, buildup and first legs add none', () => {
    const cont = { ...fresh(0, 300), label: 'continue' };
    const bu = { ...fresh(1, 330), label: 'buildup' };
    const first = { ...fresh(2, 360), label: 'first' };
    expect(plannedShiftsAfter(planOf([cont, bu, first, fresh(3, 490)]), T0)).toEqual({ count: 16 + 6, listed: 16, opening: 6 });
    expect(estimatedOpening({ variant: 'continue', label: '2-sale' })).toBe(0);
  });

  it('a leg that lists its real opening (a future table) adds nothing', () => {
    const a = fresh(0, 300);
    const withOpening = { ...a, shifts: [...opening(a.start), ...tail(a.start)] };
    expect(plannedShiftsAfter(planOf([withOpening, fresh(1, 330)]), T0)).toEqual({ count: 10 + 4 + 6, listed: 14, opening: 6 });
  });

  it('an ascension that started before the save adds none; exact legs add none; nothing listed: null', () => {
    const before = { ...fresh(0, 300), start: T0 - D, shifts: tail(T0 - D) };
    expect(plannedShiftsAfter(planOf([before, fresh(1, 330)]), T0)?.opening).toBe(6);
    const exact = planOf([fresh(0, 300)], {
      legs: [{ shifts: tail(T0), endTime: T0 + 3 * D, endTE: 300 } as unknown as NonNullable<NowPlan['legs']>[number]],
      exact: true,
    });
    expect(plannedShiftsAfter(exact, T0)).toEqual({ count: 4, listed: 4, opening: 0 });
    const bare = planOf([{ ...fresh(0, 300), shifts: undefined }]);
    expect(plannedShiftsAfter(bare, T0)).toBeNull();
  });
});

describe('where the count is shown', () => {
  it("All planned shifts (YourEggs.vue) says about N of them are build-up shifts (estimated)", async () => {
    const base = { eggs: [], facts: null, shiftsDone: 100, nextShiftCost: null, clothedEquipped: null, clothedEarnings: null, now: T0, saveSeconds: T0 };
    const t = textOf(await renderHtml(YourEggs, { ...base, plannedShifts: { count: 40, cost: 1e18, opening: 24 } }));
    expect(t).toContain('40 shifts');
    expect(t).toContain('about 24 of them build-up shifts (estimated)');
    const none = textOf(await renderHtml(YourEggs, { ...base, plannedShifts: { count: 12, cost: 1e18, opening: 0 } }));
    expect(none).not.toContain('build-up shifts (estimated)');
  });

  it('the Full timeline says "about 6 build-up shifts" only where the ascension lists none of them', async () => {
    const a = fresh(0, 300);
    const listed = { ...fresh(1, 330), shifts: [...opening(T0 + H + 4 * D), ...tail(T0 + H + 4 * D)] };
    const cont = { ...fresh(2, 360), label: 'continue' };
    const p = planOf([a, listed, cont]);
    const lines = ascensionSteps(
      stepLegsOf(p).map((l, i) => ({ ...l, shifts: p.tableLegs![i].shifts, label: p.tableLegs![i].label })),
      null,
      null
    );
    expect(lines.map(l => l.openingShifts ?? 0)).toEqual([6, 0, 0]);
    const html = await renderHtml(AscensionList, { lines, zone: ZONE });
    const t = textOf(html);
    expect(t).toContain('You do the build-up for 2 sales');
    expect(t).toContain('Its first hours: about 6 build-up shifts (estimated, not listed)');
    expect(t.match(/build-up shifts \(estimated/g)).toHaveLength(1);
  });
});
