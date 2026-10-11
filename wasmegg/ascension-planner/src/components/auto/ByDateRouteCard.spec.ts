/** By a date's route card (ByDateRouteCard.vue): the finished answer, and the best so far mid-run. */
import { describe, expect, it } from 'vitest';
import { h } from 'vue';
import ByDateRouteCard from './ByDateRouteCard.vue';
import RouteResultCard from './RouteResultCard.vue';
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
  it('the finished answer: highest by the date, the TE and route, the spare, a row per stop', async () => {
    const t = textOf(await renderHtml(ByDateRouteCard, props(), { default: () => 'Stopped early.' }));
    expect(t).toMatch(/^Highest by .*2027/);
    expect(t).toContain('247 TE via 166 197 223 247');
    expect(t).toContain('with 27.3 h to spare.');
    expect(t).toContain('Stopped early.');
    expect(t).toMatch(/Stop Reached Leg 166 .* 30\.0 d 197 .* 80\.0 d 223 .* 70\.0 d 247 .* 48\.9 d/);
    expect(t).not.toContain('Best so far');
    expect(t).not.toContain('can still improve');
  });

  it('mid-run: labelled the best so far, and says it can still improve', async () => {
    const t = textOf(await renderHtml(ByDateRouteCard, props({ running: true })));
    expect(t).toMatch(/^Best so far · highest by .*2027/);
    expect(t).toContain('247 TE via 166 197 223 247');
    expect(t).toContain('The search is still going, so this can still improve.');
    expect(t).toContain('Stop Reached Leg');
  });

  it('a best so far without its legs yet (replayed) shows what is known, and no empty table', async () => {
    const html = await renderHtml(ByDateRouteCard, props({ running: true, route: route({ legs: [] }) }));
    expect(html).not.toContain('<table');
    expect(textOf(html)).toContain('247 TE via 166 197 223 247');
    expect(textOf(html)).toContain('The time of each stop comes with the finished result.');
  });

  it('a leg missing its numbers shows a dash rather than NaN', async () => {
    const bad = { key: 'continue', endTE: 197 } as never;
    const t = textOf(await renderHtml(ByDateRouteCard, props({ running: true, route: route({ legs: [bad] }) })));
    expect(t).toContain('197 — —');
    expect(t).not.toMatch(/NaN|Invalid/);
  });

  it('says when the player can ascend, when that is later than reaching the stop', async () => {
    const r = route({ ascendAt: DEADLINE - 3600 });
    expect(textOf(await renderHtml(ByDateRouteCard, props({ route: r })))).toContain('(you can ascend from');
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

  it('lays out each egg at the end, its next TE, and when the soonest would come', async () => {
    const html = await renderHtml(ByDateRouteCard, props({ route: withEnd() }));
    const t = textOf(html);
    expect(html).toContain('data-testid="by-date-te-per-egg"');
    expect(t).toContain('TE per egg TE Next TE in At final rate');
    expect(t).toMatch(/Curiosity 50 310\.00q eggs 3\.6 days/);
    expect(t).toMatch(/Humility 49 130\.00q eggs 36\.1 h/);
    expect(t).toMatch(/Kindness · laying 49/);
    expect(t).toMatch(
      /your next TE would arrive about .*2027.* \(Humility, at the final rate of 3\.60q eggs an hour\)\./
    );
  });

  it('without a rate: the TE and eggs needed, no times and no next TE', async () => {
    const t = textOf(await renderHtml(ByDateRouteCard, props({ route: withEnd({ maxELR: 0 }) })));
    expect(t).toContain('TE per egg TE Next TE in Curiosity 50 310.00q eggs');
    expect(t).not.toContain('At final rate');
    expect(t).not.toContain('next TE would arrive');
  });

  it('shows nothing when the legs carry no end state, or it does not add up', async () => {
    const plain = await renderHtml(ByDateRouteCard, props());
    expect(plain).not.toContain('by-date-te-per-egg');
    const off = await renderHtml(ByDateRouteCard, props({ route: { ...withEnd(), chain: [166, 197, 223, 248] } }));
    expect(off).not.toContain('by-date-te-per-egg');
  });
});

describe('spareLabel', () => {
  it('minutes, hours under two days, then days', () => {
    expect(spareLabel(40 * 60)).toBe('40 min');
    expect(spareLabel(27.3 * 3600)).toBe('27.3 h');
    expect(spareLabel(3.5 * 86400)).toBe('3.5 days');
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
