/**
 * YOUR EGGS: THE CLOCK TIME PER EGG (ux34-a, 28 Oct 2026). Beside "next TE in ~2d 11h" each egg also says the day and
 * time in the browser's own format ("next TE about Wed, Oct 30 at 11:00 AM", lib/eventWhen.ts `dateAt` with the
 * weekday). The egg being laid: from now at the save's rate. Every other egg: "… if you shift now" (now + the egg's
 * after-shift time), always: since spec-myruns-fix2 (13 Nov 2026) never timed from the plan's shift to it, and the
 * "to goal" view has no times of its own, only the plan's shift to each egg (`goal`, with a followed plan).
 * The clock is fixed (vi.setSystemTime) and every fixture is relative to it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eggClockLines, eggNextTeSeconds } from './nextTeEgg';
import { eggLines } from './farmFacts';
import { dateAt } from './eventWhen';
import { getThresholdForTE } from './truthEggs';
import { GOAL_NO_SHIFT_WORDS, GOAL_ON_EGG_WORDS, goalShiftWords } from './yourEggsWords';
import { renderHtml, textOf } from '@/test/renderComponent';
import YourEggs from '@/components/myruns/YourEggs.vue';

const H = 3600;
const D = 86400;
const ZONE = 'America/Los_Angeles';
const FIXED = Date.parse('2027-10-15T21:40:00Z');
let NOW = 0;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXED);
  NOW = Math.floor(Date.now() / 1000);
});
afterEach(() => vi.useRealTimers());

// 150 TE in all (habs full straight after a shift). Curiosity laid at 1e12/s, each egg at its 30th TE's start.
const at30 = getThresholdForTE(30);
const delivered = { curiosity: at30, kindness: at30, integrity: at30, humility: at30, resilience: at30 };
const rates = { maxHabs: 1e10, perChicken: 200, maxElr: 2e12, ihr: 1e4 };

function clock(o: { plan?: boolean; shifts?: { kind: string; egg?: string; at: number }[]; save?: number } = {}) {
  const eggs = eggLines(delivered, {}, 'curiosity', 1e12, null);
  return eggClockLines({
    eggs,
    delivered,
    totalTe: 150,
    rates,
    plan: o.plan ?? false,
    now: NOW,
    saveSeconds: o.save ?? NOW,
    zone: ZONE,
    shifts: o.shifts ?? [],
  });
}

describe('eggClockLines (lib/nextTeEgg.ts)', () => {
  it("the egg being laid: its next TE's day and time from now, in the browser's format with the weekday", () => {
    const eggs = eggLines(delivered, {}, 'curiosity', 1e12, null);
    const left = eggs.find(e => e.current)!.nextInSeconds!;
    const l = clock({ save: NOW - 2 * H });
    expect(l.next.curiosity).toBe(`next TE about ${dateAt(NOW - 2 * H + left, NOW, ZONE, true)}`);
    // 12-hour with am/pm in en-US, the weekday first.
    expect(l.next.curiosity).toMatch(/^next TE about [A-Z][a-z]{2}, [A-Z][a-z]{2} \d+(, \d{4})? at \d{1,2}:\d{2}\s?[AP]M$/);
  });

  it('an egg you are not on: now + its after-shift time, "if you shift now"', () => {
    const t = eggNextTeSeconds({ delivered: at30, current: false, population: 0, totalTe: 150, rates })!;
    const l = clock();
    expect(l.next.kindness).toBe(`next TE about ${dateAt(NOW + t, NOW, ZONE, true)} if you shift now`);
  });

  it("a shift to it in the plan's Next shifts: still from now (\"next TE\" is if you shift now)", () => {
    const t = eggNextTeSeconds({ delivered: at30, current: false, population: 0, totalTe: 150, rates })!;
    const S = NOW + 5 * H;
    const l = clock({ plan: true, shifts: [{ kind: 'prestige', at: NOW + H }, { kind: 'shift', egg: 'humility', at: S }, { kind: 'shift', egg: 'humility', at: S + D }] });
    expect(l.next.humility).toBe(`next TE about ${dateAt(NOW + t, NOW, ZONE, true)} if you shift now`);
  });

  it('the "to goal" view: the plan\'s first shift to each egg, the egg you are on, or none listed (DRAFT words)', () => {
    const S = NOW + 5 * H;
    const l = clock({ plan: true, shifts: [{ kind: 'shift', egg: 'humility', at: S }] });
    expect(l.goal.humility).toBe(goalShiftWords(dateAt(S, NOW, ZONE, true)));
    expect(l.goal.curiosity).toBe(GOAL_ON_EGG_WORDS);
    expect(l.goal.kindness).toBe(GOAL_NO_SHIFT_WORDS);
    // No plan: no goal lines.
    expect(clock({ shifts: [{ kind: 'shift', egg: 'humility', at: S }] }).goal).toEqual({});
  });

  it('nothing when there is no time (no rates, over about 10 years)', () => {
    const none = eggClockLines({
      eggs: eggLines(delivered, {}, 'curiosity', null, null),
      delivered,
      totalTe: 150,
      rates: null,
      now: NOW,
      saveSeconds: NOW,
      zone: ZONE,
      shifts: [],
    });
    expect(none).toEqual({ next: {}, goal: {} });
  });
});

describe('YourEggs shows the clock line under each egg in "next TE", the plan line in "to goal"', () => {
  const props = () => ({
    eggs: eggLines(delivered, {}, 'curiosity', 1e12, null),
    facts: null,
    shiftsDone: 0,
    nextShiftCost: null,
    plannedShifts: null,
    clothedEquipped: null,
    clothedEarnings: null,
    now: NOW,
    saveSeconds: NOW,
    afterShift: { lines: { kindness: 'next TE in ~2d after you shift here' }, note: 'note' },
    goalLines: { curiosity: 'g', kindness: 'g', integrity: 'g', humility: 'g', resilience: 'g' },
    clockLines: clock({ plan: true, shifts: [{ kind: 'shift', egg: 'kindness', at: NOW + D }] }),
  });
  it('"next TE": the duration line kept, the clock line beside it', async () => {
    const p = props();
    const html = await renderHtml(YourEggs, { ...p, view: 'next' });
    const t = textOf(html);
    expect(t).toContain('next TE in ~2d after you shift here');
    expect(t).toContain(p.clockLines.next.kindness);
    expect(t).toContain(p.clockLines.next.curiosity);
    expect(html).toContain('data-testid="now-egg-when"');
    expect(t).not.toContain(p.clockLines.goal.kindness);
  });
  it('"to goal": the plan line, no next TE lines', async () => {
    const p = props();
    const t = textOf(await renderHtml(YourEggs, { ...p, view: 'goal' }));
    expect(t).toContain(p.clockLines.goal.kindness);
    expect(t).not.toContain('next TE in ~2d after you shift here');
    expect(t).not.toContain(p.clockLines.next.kindness);
  });
});

describe('wired on My runs', () => {
  it('useNowPage builds the clock lines from the plan\'s Next shifts; MyRunsView passes them', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const page = readFileSync(resolve(__dirname, '../composables/useNowPage.ts'), 'utf8');
    expect(page).toMatch(/eggClockLines\(\{[\s\S]*?shifts: nextShiftLines\.value/);
    const view = readFileSync(resolve(__dirname, '../components/MyRunsView.vue'), 'utf8');
    expect(view).toContain(':clock-lines="page.clockLines.value"');
  });
});
