import { describe, expect, it } from 'vitest';
import {
  byDatePlan,
  enoughSets,
  estimateNote,
  estimateRoutes,
  firstRouteLegs,
  legsLeft,
  plannedRoutes,
  RATE_WINDOW_SECONDS,
  recentLegRate,
  roundedRoutes,
  spaceShapeKey,
  usableRatio,
} from './deadlineEstimate';

describe('deadline route estimate', () => {
  const sets = 8632;
  const first = 95000;

  it('keeps the first guess until enough sets are done', () => {
    const e = estimateRoutes(500, first, { sets, finishedSets: 100, finishedRoutes: 300, openRoutes: 2000 });
    expect(e.learned).toBe(false);
    expect(e.total).toBe(first);
    expect(estimateNote(e)).toBe('');
  });

  it('never goes below what is already priced', () => {
    expect(estimateRoutes(120000, first, undefined).total).toBe(120000);
  });

  it('learns about 4 a set from finished sets, well under the 11 a set guess', () => {
    const e = estimateRoutes(19664, first, { sets, finishedSets: 1200, finishedRoutes: 4800, openRoutes: 2 * 7432 });
    expect(e.learned).toBe(true);
    expect(e.basedOnSets).toBe(1200);
    expect(e.perSet).toBeGreaterThan(3.9);
    expect(e.perSet).toBeLessThan(4.6);
    expect(e.total).toBeGreaterThan(30000);
    expect(e.total).toBeLessThan(42000);
  });

  it('counts routes open sets already used, and never goes negative', () => {
    const e = estimateRoutes(40000, first, { sets, finishedSets: 8000, finishedRoutes: 32000, openRoutes: 9000 });
    expect(e.total).toBeGreaterThanOrEqual(40000);
  });

  it('lands on the real count when every set is finished', () => {
    const e = estimateRoutes(34913, first, { sets, finishedSets: sets, finishedRoutes: 34913, openRoutes: 0 });
    expect(e.total).toBe(34913);
  });

  it('is trusted at 5% of a small run but not under 20 sets', () => {
    expect(enoughSets({ sets: 100, finishedSets: 5, finishedRoutes: 20, openRoutes: 0 })).toBe(false);
    expect(enoughSets({ sets: 1000, finishedSets: 50, finishedRoutes: 200, openRoutes: 0 })).toBe(true);
    expect(enoughSets({ sets: 100000, finishedSets: 150, finishedRoutes: 600, openRoutes: 0 })).toBe(false);
    expect(enoughSets({ sets: 100000, finishedSets: 200, finishedRoutes: 800, openRoutes: 0 })).toBe(true);
  });

  it('words the note honestly', () => {
    const e = estimateRoutes(5000, first, { sets, finishedSets: 1200, finishedRoutes: 4800, openRoutes: 0 });
    expect(estimateNote(e)).toBe('estimated from the first 1,200 sets; first guess was ~95,000');
  });

  it('rounds for display and validates a remembered ratio', () => {
    expect(roundedRoutes(34913)).toBe(35000);
    expect(roundedRoutes(812)).toBe(812);
    expect(usableRatio('4.1')).toBe(4.1);
    expect(usableRatio('abc')).toBe(0);
    expect(usableRatio(0)).toBe(0);
  });
});

describe('the estimate in legs', () => {
  it("charges a set's first route its own legs, and the legs it shares once per worker holding them", () => {
    // One 3-ascension group (siblings 160 200 / 160 210): 160 shared, each set's own leg, each first route's last leg.
    expect(
      firstRouteLegs(
        [
          [160, 200],
          [160, 210],
        ],
        8
      )
    ).toBe(1 + 2 + 2);
    // A set with no early stops is its last leg only.
    expect(firstRouteLegs([[]], 8)).toBe(1);
  });

  it('is front-loaded: legs left fall fast through the first round, then one a route', () => {
    const o = { routesTotal: 4000, sets: 1000, firstLegs: 3000 };
    expect(legsLeft({ ...o, priced: 0 })).toBe(3000 + 3000);
    expect(legsLeft({ ...o, priced: 500 })).toBe(1500 + 3000);
    expect(legsLeft({ ...o, priced: 1000 })).toBe(3000);
    expect(legsLeft({ ...o, priced: 3999 })).toBe(1);
    // Never under a leg a route still to go.
    expect(legsLeft({ ...o, priced: 900, firstLegs: 0 })).toBe(3100);
  });

  it('measures the rate over the recent window, not since the start', () => {
    const now = 10_000_000;
    const slow: [number, number][] = [
      [now - 3600_000, 0],
      [now - RATE_WINDOW_SECONDS * 1000, 100],
      [now, 100 + RATE_WINDOW_SECONDS * 2],
    ];
    expect(recentLegRate(slow, now)).toBeCloseTo(2, 5);
    expect(
      recentLegRate(
        [
          [now - 60_000, 0],
          [now, 50],
        ],
        now
      )
    ).toBeNull();
  });

  it('remembers routes per set by the shape of the space, not one figure for all', () => {
    const a = spaceShapeKey([
      [
        [151, 152, 153],
        [200, 205, 210],
      ],
      [],
    ]);
    expect(a).toBe(
      spaceShapeKey([
        [],
        [
          [171, 172, 173],
          [220, 225, 230],
        ],
      ])
    );
    expect(a).not.toBe(
      spaceShapeKey([
        [
          [151, 152, 153],
          [200, 210, 220],
        ],
        [],
      ])
    );
  });

  it('plans a space with the instant answer added, about 4 routes a set', () => {
    const plan = byDatePlan({
      rows: [
        {
          asc: 3,
          bands: [
            [160, 161, 162],
            [200, 210],
          ],
        },
      ],
      currentTE: 150,
      lastHi: 330,
      instantSets: [[159, 195]],
      workers: 2,
      workerSecondsPerLeg: 4,
    });
    expect(plan.sets).toBe(7);
    expect(plan.routes).toBe(plannedRoutes({ sets: 7, workers: 2, currentTE: 150 }));
    expect(plan.legs).toBe(plan.firstLegs + plan.routes - 7);
    expect(plan.seconds).toBeCloseTo((plan.legs * 4) / 2, 5);
  });
});
