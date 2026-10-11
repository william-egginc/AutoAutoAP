/** The "one more TE" hint on By a date's answer (search/oneMoreTE.ts). */
import { describe, expect, it } from 'vitest';
import { lastTECostFrom, oneMoreTECost, oneMoreTEHint, tableTECostSeconds } from './oneMoreTE';
import { PricedRoutes, type DeadlineRoute } from './deadline';

const H = 3600;
const D = 86400;
const DEADLINE = 1_815_660_000;
const route = (last: number, spare: number, over: Partial<DeadlineRoute> = {}): DeadlineRoute => ({
  chain: [166, 197, last],
  reachAt: DEADLINE - spare,
  ascendAt: DEADLINE - spare,
  spare,
  legs: [],
  ...over,
});

describe('tableTECostSeconds', () => {
  it('the measured ~51 h at 239-248 and ~45 h at 327-338, a line between, nothing outside 235-345', () => {
    expect(tableTECostSeconds(244)! / H).toBeCloseTo(51);
    expect(tableTECostSeconds(240)! / H).toBeCloseTo(51);
    expect(tableTECostSeconds(288)! / H).toBeCloseTo(48);
    expect(tableTECostSeconds(335)! / H).toBeCloseTo(45);
    expect(tableTECostSeconds(234)).toBeNull();
    expect(tableTECostSeconds(346)).toBeNull();
  });
});

describe('lastTECostFrom', () => {
  it('the best route against the soonest route the run priced to one stop lower', () => {
    const all = new PricedRoutes();
    const best = route(247, 3 * D);
    all.add('166,197,247', best.reachAt, best.ascendAt);
    all.add('166,197,246', best.reachAt - 40 * H, best.reachAt - 40 * H);
    all.add('165,197,246', best.reachAt - 30 * H, best.reachAt - 30 * H);
    all.add('166,197,248', best.reachAt + 44 * H, best.reachAt + 44 * H);
    all.add('166,196,246', NaN, NaN);
    expect(lastTECostFrom(all, best)! / H).toBeCloseTo(40);
  });

  it('nothing priced one lower, or no routes: null', () => {
    const all = new PricedRoutes();
    const best = route(247, 3 * D);
    all.add('166,197,247', best.reachAt, best.ascendAt);
    expect(lastTECostFrom(all, best)).toBeNull();
    expect(lastTECostFrom(null, best)).toBeNull();
  });
});

describe('oneMoreTECost', () => {
  it("the run's own first, else the table, else the route's own next TE by laying", () => {
    expect(oneMoreTECost(route(247, D), 40 * H)).toEqual({ seconds: 40 * H, from: 'run' });
    expect(oneMoreTECost(route(247, D))).toMatchObject({ from: 'table' });
    // Below the table: the next TE by laying after the last stop (search/endEggs.ts).
    const last = {
      key: '1-sale',
      endTE: 200,
      endTime: DEADLINE - 5 * D,
      durationSeconds: 1,
      maxELR: 1e12,
      tier13Unlocked: true,
      // 40 x 5 = 200; TE 41 is at 4.06e18, so each egg is 1.6e17 = 1.6e5 s away.
      endEggs: { delivered: [3.9e18, 3.9e18, 3.9e18, 3.9e18, 3.9e18], te: [40, 40, 40, 40, 40], egg: 'curiosity' },
    } as never;
    const low = route(200, 5 * D, { legs: [last] });
    expect(oneMoreTECost(low)).toMatchObject({ from: 'laying' });
    expect(oneMoreTECost(low)!.seconds).toBeCloseTo(1.6e5, -1);
    expect(oneMoreTECost(route(200, 5 * D))).toBeNull();
  });
});

describe('oneMoreTEHint', () => {
  it('stopped early with more spare than one TE: the hint, with what one TE costs', () => {
    const h = oneMoreTEHint({ route: route(247, 3.2 * D), stoppedEarly: true });
    expect(h?.text).toBe(
      "A better route may exist: this run stopped early with 3.2 days spare, more than one TE's worth (one more TE costs about 51 h here). Let it finish, or widen the boxes."
    );
  });

  it("not with less spare than one TE, using the run's own cost when it has one", () => {
    expect(oneMoreTEHint({ route: route(247, 40 * H), stoppedEarly: true })).toBeNull();
    // 40 h spare against the run's own 30 h: yes.
    expect(oneMoreTEHint({ route: route(247, 40 * H), stoppedEarly: true, runCost: 30 * H })?.text).toContain(
      'with 40.0 h spare'
    );
  });

  it('never for a finished run over its whole space with the best route inside its boxes', () => {
    expect(oneMoreTEHint({ route: route(247, 10 * D), stoppedEarly: false })).toBeNull();
  });

  it("a finished Simple run with narrow boxes, or a best route on its box's edge: widen the boxes", () => {
    expect(oneMoreTEHint({ route: route(247, 3 * D), stoppedEarly: false, narrow: true })?.text).toBe(
      "A better route may exist: this run's boxes were narrow, and it has 3.0 days spare, more than one TE's worth (one more TE costs about 51 h here). Widen the boxes."
    );
    expect(oneMoreTEHint({ route: route(247, 3 * D), stoppedEarly: false, onEdge: true })?.text).toContain(
      'its best route is on the edge of its box, with 3.0 days spare'
    );
  });

  it('nothing to go on (no table, no legs): no hint rather than a guess', () => {
    expect(oneMoreTEHint({ route: route(200, 30 * D), stoppedEarly: true })).toBeNull();
    expect(oneMoreTEHint({ route: null, stoppedEarly: true })).toBeNull();
  });
});
