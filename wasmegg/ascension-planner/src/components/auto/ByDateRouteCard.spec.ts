/** By a date's route card (ByDateRouteCard.vue): the finished answer, and the best so far mid-run. */
import { describe, expect, it } from 'vitest';
import { h } from 'vue';
import ByDateRouteCard from './ByDateRouteCard.vue';
import RouteResultCard from './RouteResultCard.vue';
import { BUILDUP_NOTE } from '@/search/byDateSimulate';
import { renderHtml, textOf } from '@/test/renderComponent';
import { spareLabel } from '@/search/deadlineSummary';
import type { DeadlineRoute } from '@/search/deadline';

const DEADLINE = 1_815_660_000; // Jul 14, 2027 10:00 AM UTC
const leg = (endTE: number, endTime: number, days: number) =>
  ({ key: 'continue', endTE, endTime, durationSeconds: days * 86400, maxELR: 1, tier13Unlocked: true }) as never;
const route = (over: Partial<DeadlineRoute> = {}): DeadlineRoute => ({
  chain: [166, 197, 223, 247],
  reachAt: DEADLINE - 27.3 * 3600,
  ascendAt: DEADLINE - 27.3 * 3600,
  spare: 27.3 * 3600,
  legs: [
    leg(166, DEADLINE - 200 * 86400, 30),
    leg(197, DEADLINE - 120 * 86400, 80),
    leg(223, DEADLINE - 50 * 86400, 70),
    leg(247, DEADLINE - 27.3 * 3600, 48.9),
  ],
  ...over,
});
const props = (over: object = {}) => ({ route: route(), deadline: DEADLINE, zone: 'UTC', ...over });

describe('ByDateRouteCard', () => {
  it('the finished answer: highest by the date, the route, the TE and spare beside it, a leg table under it', async () => {
    const html = await renderHtml(ByDateRouteCard, props(), { default: () => 'Stopped early.' });
    const t = textOf(html);
    expect(t).toMatch(/^Highest by .*2027/);
    expect(t).toMatch(/166 197 223 247 247 TE reached .*2027.*, 27\.3 h to spare/);
    expect(t).toContain('Stopped early.');
    // Laid out as Fastest's leg table: Leg, to TE, Start, Finish, Days.
    expect(t).toMatch(/Leg → TE Start Finish Days A1 166 .* 30\.00 A2 197 .* 80\.00 A3 223 .* 70\.00 A4 247 .* 48\.90/);
    expect(html).toContain('data-testid="by-date-legs"');
    expect(t).not.toContain('Best so far');
    expect(t).not.toContain('can still improve');
  });

  it('mid-run: labelled the best so far, and says it can still improve', async () => {
    const t = textOf(await renderHtml(ByDateRouteCard, props({ running: true })));
    expect(t).toMatch(/^Best so far · highest by .*2027/);
    expect(t).toContain('166 197 223 247 247 TE');
    expect(t).toContain('The search is still going, so this can still improve.');
    expect(t).toContain('Leg → TE Start Finish Days');
  });

  it('a best so far without its legs yet (replayed) shows what is known, and no empty table', async () => {
    const html = await renderHtml(ByDateRouteCard, props({ running: true, route: route({ legs: [] }) }));
    expect(html).not.toContain('by-date-legs');
    expect(textOf(html)).toContain('166 197 223 247 247 TE');
    expect(textOf(html)).toContain('The time of each stop comes with the finished result.');
  });

  it('a leg missing its numbers shows a dash rather than NaN', async () => {
    const bad = { key: 'continue', endTE: 197 } as never;
    const t = textOf(await renderHtml(ByDateRouteCard, props({ running: true, route: route({ legs: [bad] }) })));
    expect(t).toContain('A1 197 — — —');
    expect(t).not.toMatch(/NaN|Invalid/);
  });

  it('says when the player can ascend, when that is later than reaching the stop', async () => {
    const r = route({ ascendAt: DEADLINE - 3600 });
    expect(textOf(await renderHtml(ByDateRouteCard, props({ route: r })))).toContain('You can ascend from');
  });
});

describe('ByDateRouteCard: TE per egg and the next TE', () => {
  // 50 + 50 + 49 + 49 + 49 = 247 (search/endEggs.spec.ts has the arithmetic).
  const endEggs = { delivered: [7.1e18, 7.2e18, 6.9e18, 6.7e18, 6.8e18], te: [50, 50, 49, 49, 49], egg: 'kindness' };
  const withEnd = (over: object = {}) => {
    const r = route();
    const last = { ...(r.legs[3] as object), maxELR: 1e12, endEggs, ...over } as never;
    return { ...r, legs: [...r.legs.slice(0, 3), last] };
  };

  it('lays out each egg at the end, and WHEN its next TE would come (a date, not eggs; Jordan 16 Oct)', async () => {
    const html = await renderHtml(ByDateRouteCard, props({ route: withEnd() }));
    const t = textOf(html);
    expect(html).toContain('data-testid="by-date-te-per-egg"');
    expect(t).toContain('TE per egg TE Next TE Curiosity');
    // The "At final rate" column and the eggs still to lay are gone from the table.
    expect(t).not.toContain('At final rate');
    expect(t).not.toContain('Next TE in');
    expect(t).not.toMatch(/310\.00q eggs/);
    // The last leg ends 27.3 h before the deadline. The farm is on kindness: 2.3e17 eggs at 1e12 a second
    // (63.9 h), a date and time in the planner's zone, 12-hour. The other eggs need a shift first.
    const end = DEADLINE - 27.3 * 3600;
    const at = (s: number) => new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(s * 1000));
    expect(t).toContain('Curiosity 50 after a shift');
    expect(t).toMatch(new RegExp(`Kindness · laying 49 ${at(end + 2.3e5).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    expect(html).toMatch(/title="310\.00q eggs to go, after a shift to this egg, which starts the farm again from one chicken"/);
    // After the deadline: said so, and never as a TE the answer could have had (15 Oct 2026, Halceyx).
    expect(t).toMatch(
      /Laying on after the last stop, your next TE \(Kindness, at the final rate of 3\.60q eggs an hour\) would come about .*2027.*, after the deadline, so it isn't counted\./
    );
  });

  it('no next-TE line when laying on would beat the deadline (the search should have found that route)', async () => {
    const html = await renderHtml(ByDateRouteCard, props({ route: withEnd(), deadline: DEADLINE + 100 * 3600 }));
    expect(html).toContain('data-testid="by-date-te-per-egg"');
    expect(html).not.toContain('by-date-next-te"');
  });

  it('without a rate: the TE, and a dash for when, with its reason in the title', async () => {
    const html = await renderHtml(ByDateRouteCard, props({ route: withEnd({ maxELR: 0 }) }));
    const t = textOf(html);
    expect(t).toContain('TE per egg TE Next TE Curiosity 50 after a shift');
    expect(t).toMatch(/Kindness · laying 49 —/);
    expect(html).toContain("final delivery rate isn&#39;t known, so there is no time for it.");
    expect(t).not.toContain('Laying on after the last stop');
  });

  it('without the end time: a dash, and the title says the date is what is missing', async () => {
    const html = await renderHtml(ByDateRouteCard, props({ route: withEnd({ endTime: undefined }) }));
    expect(textOf(html)).toMatch(/Kindness · laying 49 —/);
    expect(html).toContain("end time isn&#39;t known, so there is no date for it.");
  });

  it('shows nothing when the legs carry no end state, or it does not add up', async () => {
    const plain = await renderHtml(ByDateRouteCard, props());
    expect(plain).not.toContain('by-date-te-per-egg');
    const off = await renderHtml(ByDateRouteCard, props({ route: { ...withEnd(), chain: [166, 197, 223, 248] } }));
    expect(off).not.toContain('by-date-te-per-egg');
  });
});

describe('ByDateRouteCard: the button row (as on Fastest\'s card)', () => {
  it('Simulate this plan, with its note', async () => {
    const t = textOf(
      await renderHtml(
        ByDateRouteCard,
        props({ simulate: true, simulateNote: BUILDUP_NOTE })
      )
    );
    expect(t).toContain('Single run prices the first ascension as a fresh build/continue. Simulate this plan');
    expect(await renderHtml(ByDateRouteCard, props())).not.toContain('by-date-simulate');
    expect(await renderHtml(ByDateRouteCard, props({ simulate: true }))).not.toContain('by-date-simulate-note');
  });

  it('Simulate, Share, CSV, Save answer in that order, styled as Fastest\'s Build / Share / CSV / Save run', async () => {
    const html = await renderHtml(ByDateRouteCard, props({ simulate: true, canShare: true, canCsv: true, canSave: true }));
    expect(textOf(html)).toMatch(
      /Simulate this plan Share CSV ↓ Save answer Simulate this plan opens this route in Single run \(Joo's original planner\) and simulates every shift: when each TE arrives, and each ascension's dates and purchases\. Leg/
    );
    const fast = await renderHtml(RouteResultCard, {
      chain: [212, 280, 490],
      days: 760.5,
      finalTE: 490,
      endLabel: 'Feb 15, 2029',
      running: false,
      canSave: true,
    });
    const classOf = (h: string, text: string) => h.match(new RegExp(`class="([^"]*)"[^>]*>\\s*${text}`))?.[1];
    expect(classOf(html, 'Simulate this plan')).toContain('bg-emerald-700');
    expect(classOf(html, 'Simulate this plan')).toBe(classOf(fast, 'Build this plan'));
    expect(classOf(html, 'Share')).toContain('border-emerald-300');
    expect(classOf(html, 'Share')).toBe(classOf(fast, 'Share'));
  });

  it('an earlier result: labelled "Your last run" with when it was found', async () => {
    const t = textOf(await renderHtml(ByDateRouteCard, props({ lastRun: 'Oct 11, 2026, 3:05 PM' })));
    expect(t).toMatch(/^Your last run · Oct 11, 2026, 3:05 PM · highest by .*2027/);
    expect(textOf(await renderHtml(ByDateRouteCard, props()))).not.toContain('Your last run');
  });

  it('mid-run: only Simulate', async () => {
    const t = textOf(
      await renderHtml(ByDateRouteCard, props({ running: true, simulate: true, canShare: true, canCsv: true, canSave: true }))
    );
    expect(t).toContain('Simulate this plan');
    expect(t).not.toMatch(/Share|CSV|Save answer/);
  });
});

describe('spareLabel', () => {
  it('minutes, hours under two days, then days', () => {
    expect(spareLabel(40 * 60)).toBe('40 min');
    expect(spareLabel(27.3 * 3600)).toBe('27.3 h');
    expect(spareLabel(3.5 * 86400)).toBe('3.5 days');
  });
});

describe('RouteResultCard (Fastest): last run and the Build note', () => {
  const base = { chain: [212, 280, 490], days: 760.5, finalTE: 490, endLabel: 'Feb 15, 2029' };
  it('an earlier result says "Your last run" with when; a live one says Fastest found', async () => {
    expect(textOf(await renderHtml(RouteResultCard, { ...base, running: false, lastRun: 'Oct 11, 2026, 3:05 PM' }))).toMatch(
      /^Your last run · Oct 11, 2026, 3:05 PM/
    );
    const live = textOf(await renderHtml(RouteResultCard, { ...base, running: false }));
    expect(live).toMatch(/^Fastest found/);
    expect(live).toContain("Build this plan opens this route in Single run (Joo's original planner) and simulates every shift: when each TE arrives");
    // While running: still the best so far, never "Your last run".
    expect(textOf(await renderHtml(RouteResultCard, { ...base, running: true, lastRun: 'x' }))).toMatch(/^Best so far/);
  });
});

describe('RouteResultCard (Fastest) mid-run', () => {
  const base = { chain: [212, 280, 490], days: 760.5, finalTE: 490, endLabel: 'Feb 15, 2029' };
  it('says the best so far can still improve while running, and not once finished', async () => {
    expect(textOf(await renderHtml(RouteResultCard, { ...base, running: true }))).toContain(
      'The search is still going, so this can still improve.'
    );
    expect(
      textOf(await renderHtml(RouteResultCard, { ...base, running: false }, { default: () => h('i') }))
    ).not.toContain('can still improve');
  });
});
