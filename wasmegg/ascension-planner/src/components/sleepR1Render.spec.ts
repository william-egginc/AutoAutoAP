/**
 * The R1 sleep warning MOUNTED on its surfaces (orchestrator / QA, 15 Nov 2026: source pins weren't enough): RouteTimeline
 * (a plan with exact legs; Chain Finder and By a date results), My Runs' Next step (simulated prestige, and the plan-events
 * fallback "Not done yet: prestige …" with the plan's own line beside it in Follow), and the Build-up tracker. Held shifts
 * (the default) give the softer line; not held, the full one; no hours, none. Instant steps and AscensionList:
 * sleepR1Surfaces.spec.ts. Placeholder data only.
 */
import { describe, expect, it } from 'vitest';
import { createPinia } from 'pinia';
import { renderHtml, textWithDots as textOf } from '@/test/renderComponent';
import RouteTimeline from '@/components/auto/RouteTimeline.vue';
import RightNowCard from '@/components/myruns/RightNowCard.vue';
import BuildUpTracker from '@/components/myruns/BuildUpTracker.vue';
import { buildUpTracker, trackerSummary } from '@/lib/buildUpTracker';
import { fixturePlan, mt, ZONE as TZONE } from '@/lib/buildUpTracker.fixture';
import type { Availability } from '@/search/availability';
import type { LegSummary } from '@/search/types';
import type { PlanEvent, NowPlan } from '@/lib/nowPlan';
import type { CardPlan } from '@/composables/useNowPage';

const ZONE = 'America/Denver';
const HOURS: Availability = { days: [], fromHour: 7, toHour: 23, timezone: ZONE };
const H = 3600;
/** Denver wall time, 18-19 Nov 2026 (MST, UTC-7). */
const at = (day: 18 | 19, hhmm: string) => Date.parse(`2026-11-${day}T${hhmm}:00-07:00`) / 1000;
const count = (s: string, sub: string) => s.split(sub).length - 1;

// ---------------------------------------------------------------- RouteTimeline (exact legs)
/** A fresh leg starting at `start` with C2, K2, R1 at `r1`, C3 30 min later, H1 two hours on. */
function leg(start: number, r1: number, endTE: number): LegSummary {
  const shifts = [
    { at: r1 - 3600, egg: 'curiosity', fromEgg: 'integrity', te: 5 },
    { at: r1 - 1800, egg: 'kindness', fromEgg: 'curiosity', te: 6 },
    { at: r1, egg: 'resilience', fromEgg: 'kindness', te: 7 },
    { at: r1 + 1800, egg: 'curiosity', fromEgg: 'resilience', te: 8 },
    { at: r1 + 1800 + 7200, egg: 'humility', fromEgg: 'curiosity', te: 20 },
  ];
  return { key: 'fresh', endTE, durationSeconds: 86400, startTime: start, endTime: start + 86400, shifts } as unknown as LegSummary;
}
const legsNight = [leg(at(18, '08:00'), at(18, '09:00'), 197), leg(at(18, '21:00'), at(19, '01:00'), 240)];
const legsHeld = [leg(at(18, '08:00'), at(18, '09:00'), 197), leg(at(18, '21:00'), at(19, '07:00'), 240)];
const timeline = (legs: LegSummary[], o: { hours?: Availability | null; held?: boolean; hereAt?: number } = {}) =>
  renderHtml(RouteTimeline, {
    chain: [197, 240],
    legs,
    zone: ZONE,
    open: true,
    hours: o.hours === undefined ? HOURS : o.hours,
    heldShifts: !!o.held,
    ...(o.hereAt !== undefined ? { hereAt: o.hereAt } : {}),
  });

describe('RouteTimeline (Chain Finder, By a date, a followed plan with exact legs)', () => {
  it('not held: one line, under A2 (its R1 at 1:00 AM, after 11:00 PM)', async () => {
    const html = await timeline(legsNight);
    expect(count(html, 'data-testid="route-timeline-r1-sleep"')).toBe(1);
    expect(textOf(html)).toMatch(/Your silo buys \(R1\) start at .*1:00 AM.*after your hours end at .*11:00 PM/);
    expect(html.indexOf('route-timeline-r1-sleep')).toBeGreaterThan(html.lastIndexOf('A2'));
  });
  it("the line never splits a v-if/v-else pair: legs with eggs still render as details, never also as the bare 'no eggs' line", async () => {
    const html = await timeline(legsNight, { hours: null });
    expect(html).not.toMatch(/<p[^>]*class="px-2 py-1 pl-5[^"]*"[^>]*data-testid="route-timeline-line"/);
    const src = (await import('node:fs')).readFileSync(new URL('./auto/RouteTimeline.vue', import.meta.url), 'utf8');
    const after = src.slice(src.indexOf('data-testid="route-timeline-r1-sleep"'));
    expect(after.slice(0, after.indexOf('</template>'))).not.toMatch(/\bv-else/);
  });
  it('held (the default): the softer line, R1 waits until 7:00 AM', async () => {
    const html = await timeline(legsHeld, { held: true });
    expect(count(html, 'data-testid="route-timeline-r1-sleep"')).toBe(1);
    expect(textOf(html)).toMatch(/Your silo buys \(R1\) wait until .*7:00 AM, so your farm has 1 silo overnight/);
    expect(textOf(html)).not.toMatch(/Prestige in the morning/);
  });
  it('no hours: none; an ascension already started (hereAt): none', async () => {
    expect(await timeline(legsNight, { hours: null })).not.toContain('route-timeline-r1-sleep');
    expect(await timeline(legsNight, { hereAt: at(18, '22:00') })).not.toContain('route-timeline-r1-sleep');
  });
});

// ---------------------------------------------------------------- RightNowCard
const NOW = at(18, '22:30');
const prestigeDue: PlanEvent = { kind: 'prestige', at: NOW - 600, asc: 1, te: 191, past: false, notDone: true, next: true };
const later: PlanEvent = { kind: 'goal', at: NOW + 40 * 86400, asc: 2, te: 240, past: false, next: false };
const plan: NowPlan = {
  goal: 'fastest',
  chain: [191, 240],
  end: NOW + 40 * 86400,
  endTE: 240,
  legs: null,
  tableLegs: [{ from: 180, to: 191, endTE: 191, start: NOW - 86400, end: NOW - 600 }],
  exact: false,
  instantTE: 240,
  calculatedAt: NOW * 1000,
  planStart: NOW - 86400,
  spareHours: null,
  runnerUpHours: null,
  meta: null,
  whatIf: null,
} as unknown as NowPlan;
const card: CardPlan = { plan, goal: { goal: 'fastest', target: 240 }, state: 'this-save', key: 'fastest-240', name: 'Fastest to 240 TE' } as unknown as CardPlan;
const nowCard = (o: { card?: boolean; nextStep?: unknown; hours?: Availability | null; held?: boolean }) =>
  renderHtml(
    RightNowCard,
    {
      card: o.card === false ? null : card,
      onVirtue: true,
      currentEgg: 'humility',
      teSoFar: 191,
      ascNow: 1,
      track: null,
      events: [prestigeDue, later],
      shownEvents: [prestigeDue, later],
      gear: null,
      now: NOW,
      zone: ZONE,
      saveSeconds: NOW - 300,
      eggDayYear: 2027,
      follow: { chain: [191, 240], goalKey: 'fastest', estimating: null },
      nextStep: o.nextStep ?? null,
      r1Hours: o.hours === undefined ? HOURS : o.hours,
      r1Held: !!o.held,
    },
    {},
    [createPinia()]
  );

describe("My Runs' Next step: \"If you prestige now, …\"", () => {
  it('Follow, the plan-events fallback ("Not done yet: prestige at 191 TE"): the R1 line AND the plan\'s own line, no "Nothing left"', async () => {
    const html = await nowCard({});
    const t = textOf(html);
    expect(count(html, 'data-testid="now-r1-sleep"')).toBe(1);
    expect(t).toMatch(/If you prestige now, your silo buys \(R1\)/);
    expect(t).toMatch(/Not done yet: prestige/);
    expect(t).not.toMatch(/Nothing left in this plan/);
  });
  it('Follow, the simulated prestige: the action, the R1 line, and no "Nothing left" or plan line under the action', async () => {
    const html = await nowCard({ nextStep: { kind: 'prestige', at: NOW, te: 191, due: true } });
    expect(html).toContain('data-testid="now-next-action"');
    expect(count(html, 'data-testid="now-r1-sleep"')).toBe(1);
    expect(textOf(html)).not.toMatch(/Nothing left in this plan/);
  });
  it('Next step without a card (a followed route being worked out): the simulated prestige gets the line', async () => {
    const html = await nowCard({ card: false, nextStep: { kind: 'prestige', at: NOW, te: 191, due: true } });
    expect(count(html, 'data-testid="now-r1-sleep"')).toBe(1);
  });
  it('held shifts: the softer line; a shift step, or no hours: none', async () => {
    expect(textOf(await nowCard({ held: true }))).toMatch(/If you prestige now, your silo buys \(R1\) wait until .*7:00 AM, so your farm has 1 silo overnight/);
    expect(await nowCard({ nextStep: { kind: 'shift', egg: 'kindness', at: NOW + 600 } })).not.toContain('now-r1-sleep');
    expect(await nowCard({ hours: null })).not.toContain('now-r1-sleep');
  });
});

// ---------------------------------------------------------------- Build-up tracker
describe('the Build-up tracker: the ascension you are in, while R1 is ahead', () => {
  const p = fixturePlan();
  const NOW_T = mt(10, 30, 9, 0);
  const result = buildUpTracker({ actions: p.actions, zone: TZONE, hours: null, siloSeconds: p.siloSeconds, startSilos: 1, startEgg: 'curiosity', now: NOW_T });
  // Hours from 9 AM to 10 AM: if R1 is more than an hour ahead, the night comes first.
  const SHORT: Availability = { days: [], fromHour: 9, toHour: 10, timezone: TZONE };
  const tracker = (o: { hours?: Availability | null; held?: boolean } = {}) => {
    const ticks = new Set<string>();
    return renderHtml(BuildUpTracker, {
      state: 'ready',
      open: true,
      result,
      ticks,
      summary: trackerSummary(result, ticks),
      now: NOW_T,
      zone: TZONE,
      saveSeconds: NOW_T - 300,
      planSave: mt(10, 30, 8, 41),
      r1Hours: o.hours === undefined ? SHORT : o.hours,
      r1Held: !!o.held,
    });
  };
  it('the fixture has an R1 ahead of now, more than an hour on (precondition)', () => {
    const shifts = result.lines.filter(l => l.kind === 'shift' && l.at >= NOW_T);
    const eggs = shifts.map(l => (l as { items?: { kind: string; egg?: string }[] }).items?.find(i => i.kind === 'shift')?.egg);
    const r = eggs.indexOf('resilience');
    const h = eggs.indexOf('humility');
    expect(r).toBeGreaterThanOrEqual(0);
    expect(h < 0 || r < h).toBe(true);
    expect(shifts[r].at - NOW_T).toBeGreaterThan(H);
  });
  it('not held: the line once, at the top of the tracker', async () => {
    const html = await tracker();
    expect(count(html, 'data-testid="buildup-r1-sleep"')).toBe(1);
    expect(textOf(html)).toMatch(/Your silo buys \(R1\)/);
  });
  it('held: the softer line; no hours: none', async () => {
    expect(textOf(await tracker({ held: true }))).toMatch(/Your silo buys \(R1\) wait until .*so your farm has 1 silo overnight/);
    expect(await tracker({ hours: null })).not.toContain('buildup-r1-sleep');
  });
  it("the Monday 2x: the fixture plan runs past Mon Nov 2 9:00 AM, so the line says when 2x runs and to check in then", async () => {
    const html = await tracker({ hours: null });
    expect(count(html, 'data-testid="buildup-2x"')).toBe(1);
    expect(textOf(html)).toMatch(/2x earnings run from Mon.*Nov 2.*10:00 AM to Tue.*Nov 3.*10:00 AM.*check in between those times/);
  });
});
