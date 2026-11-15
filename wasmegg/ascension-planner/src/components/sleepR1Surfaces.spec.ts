/**
 * "You won't reach R1 before you sleep" on its surfaces (Jordan's option a, 15 Nov 2026): the instant answer's "When each step happens", the
 * Full timeline of a plan with no exact legs, My runs' Next step ("if you prestige now") and the Build-up tracker. Reliability's check
 * (lib/sleepBeforeR1.ts) and Words' text (lib/sleepBeforeR1Words.ts) are used as they are. Each surface: the flagged case shows the line;
 * no hours, held shifts and an unflagged start do not. Hours 7 AM-11 PM Denver, Wed 18 Nov 2026 (MST).
 * The two big cards (My runs' Next step, the tracker) are pinned in the source: their own specs render them with far more state.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import InstantSteps from '@/components/auto/InstantSteps.vue';
import AscensionList from '@/components/myruns/AscensionList.vue';
import { ascensionSteps, type StepLeg } from '@/lib/instantSteps';
import type { Availability } from '@/search/availabilitySchedule';

const ZONE = 'America/Denver';
const HOURS: Availability = { days: [], fromHour: 7, toHour: 23, timezone: ZONE };
const at = (day: 18 | 19, hhmm: string) => Date.parse(`2026-11-${day}T${hhmm}:00-07:00`) / 1000;
const H = 3600;
const leg = (from: number, endTE: number, start: number, end: number): StepLeg => ({ from, to: endTE, endTE, start, end });
// A1 ends 10:30 PM; A2 (the table's) starts then, from 197 TE.
const late = [leg(150, 197, at(18, '08:00'), at(18, '22:30')), leg(197, 240, at(18, '22:30'), at(19, '22:30') + 3 * H)];
const morning = [leg(150, 197, at(18, '08:00'), at(18, '22:30')), leg(197, 240, at(19, '07:00'), at(19, '07:00') + 3 * 86400)];
const LINE = /Your silo buys \(R1\)/;

describe('the instant answer: When each step happens', () => {
  const render = (legs: StepLeg[], o: { hours?: Availability | null; heldShifts?: boolean } = {}) =>
    renderHtml(InstantSteps, { legs, zone: ZONE, hours: o.hours === undefined ? HOURS : o.hours, ...(o.heldShifts ? { heldShifts: true } : {}) });
  it('A2 starts at 10:30 PM: its line says the silo buys run past bedtime, "may come as late as"', async () => {
    const html = await render(late);
    expect(html).toContain('data-testid="step-r1-sleep"');
    expect(textOf(html)).toMatch(LINE);
    expect(textOf(html)).toContain('may come as late as');
    // One line, on A2 only: A1 is the ascension you are in.
    expect(html.match(/data-testid="step-r1-sleep"/g)).toHaveLength(1);
  });
  it('not for a morning start, without hours, or with held shifts', async () => {
    expect(await render(morning)).not.toContain('step-r1-sleep');
    expect(await render(late, { hours: null })).not.toContain('step-r1-sleep');
    expect(await render(late, { heldShifts: true })).not.toContain('step-r1-sleep');
  });
});

describe('the Full timeline (no exact legs)', () => {
  const render = (legs: StepLeg[], hours: Availability | null | undefined, heldShifts = false) =>
    renderHtml(AscensionList, { lines: ascensionSteps(legs, HOURS, [], []), zone: ZONE, ...(hours === undefined ? {} : { hours }), ...(heldShifts ? { heldShifts: true } : {}) });
  it('A2 at 10:30 PM: the warning under it, once', async () => {
    const html = await render(late, HOURS);
    expect(html.match(/data-testid="ascension-r1-sleep"/g)).toHaveLength(1);
    expect(textOf(html)).toMatch(LINE);
  });
  it('not for a morning start, no hours, held shifts, or the ascension you are in', async () => {
    expect(await render(morning, HOURS)).not.toContain('ascension-r1-sleep');
    expect(await render(late, null)).not.toContain('ascension-r1-sleep');
    expect(await render(late, undefined)).not.toContain('ascension-r1-sleep');
    expect(await render(late, HOURS, true)).not.toContain('ascension-r1-sleep');
  });
});

describe('the cards are wired (source pin)', () => {
  const read = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8');
  it('My runs\' Next step: "if you prestige now", under the step, only when the step is the prestige', () => {
    const card = read('./myruns/RightNowCard.vue');
    expect(card).toContain('data-testid="now-r1-sleep"');
    expect(card).toContain('sleepBeforeR1NextStep(');
    expect(card).toContain('r1IfPrestigeNow(');
    expect(card).toMatch(/if \(a\?\.kind !== 'prestige'\) return ''/);
    // The line never sits inside the action / plan line / "Nothing left" v-if chain: the next element after it is
    // never a v-else or v-else-if (that would hide the plan's line, or show "Nothing left" under the action).
    for (const m of card.matchAll(/data-testid="now-r1-sleep"[^\n]*\n\s*<[a-z]+([^>]*)>/g)) {
      expect(m[1]).not.toMatch(/\bv-else/);
    }
  });
  it('the Build-up tracker: the current ascension, only while R1 is ahead', () => {
    const t = read('./myruns/BuildUpTracker.vue');
    expect(t).toContain('data-testid="buildup-r1-sleep"');
    expect(t).toContain('sleepBeforeR1Tracker(');
    expect(t).toContain('r1OfTrackerLines(');
  });
  it('the hashed files do not import it (the result code stays put)', () => {
    for (const f of ['../lib/buildUpTracker.ts', '../lib/nowPlan.ts']) expect(read(f)).not.toMatch(/sleepBeforeR1/);
  });
  it('InstantRoute tells InstantSteps whether the shifts are held', () => {
    const r = read('./auto/InstantRoute.vue');
    expect(r.match(/:held-shifts="store\.deferShifts"/g)).toHaveLength(2);
  });
});
