import { describe, expect, it } from 'vitest';
import {
  addLegSample,
  BAR_CAP,
  byDatePlan,
  DEFAULT_MEMO_CAPACITY,
  deadlineMemoCapacity,
  deadlinePercent,
  enoughSets,
  estimateNote,
  estimateRoutes,
  finishedWeight,
  firstRouteLegs,
  laterRouteLegs,
  legsLeft,
  MEMO_ENTRY_BYTES,
  MEMO_MAX_ENTRIES,
  MEMO_MIN_ENTRIES,
  MEMO_POOL_BYTES,
  memoCeiling,
  memoWorkingSet,
  planLegs,
  plannedRoutes,
  RATE_WINDOW_SECONDS,
  recentLegRate,
  liveLegRate,
  RATE_MIN_SECONDS,
  roundedRoutes,
  spaceShapeKey,
  usableRatio,
} from './deadlineEstimate';
import { DEFAULT_MEMO_CAPACITY as CHAIN_DEFAULT_MEMO } from './chain';

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

  it('learns about 4 a set from finished sets once a fair share is finished, well under the 11 a set guess', () => {
    // An old report (no brackets): a quarter of the sets finished.
    const e = estimateRoutes(23000, first, { sets, finishedSets: 2400, finishedRoutes: 9600, openRoutes: 2 * 6232 });
    expect(e.learned).toBe(true);
    expect(e.basis).toBe('finished');
    expect(e.basedOnSets).toBe(2400);
    expect(e.perSet).toBeCloseTo(4, 5);
    expect(e.total).toBeGreaterThan(30000);
    expect(e.total).toBeLessThan(42000);
  });

  it("does not trust the early finishers' cheap average from a small share of the sets", () => {
    // 1,200 of 8,632 finished (14%): the cheap ones. Not enough to throw the first guess away...
    const e = estimateRoutes(19664, first, { sets, finishedSets: 1200, finishedRoutes: 3600, openRoutes: 2 * 7432 });
    expect(e.learned).toBe(false);
    expect(e.total).toBe(first);
    // ...and the per-set figure for sets not tried yet is only moved part of the way toward it.
    expect(finishedWeight({ sets, finishedSets: 1200, finishedRoutes: 3600, openRoutes: 0 })).toBeCloseTo(
      1200 / sets / 0.25,
      5
    );
    expect(e.perSet).toBeGreaterThan(3600 / 1200);
    expect(e.perSet).toBeLessThan(first / sets);
  });

  it('counts routes open sets already used, never goes negative, and keeps a route for each open set', () => {
    const e = estimateRoutes(40000, first, { sets, finishedSets: 8000, finishedRoutes: 32000, openRoutes: 9000 });
    // 632 sets still open need at least a route each, whatever their average says.
    expect(e.total).toBeGreaterThanOrEqual(40000 + 632);
  });

  it('lands on the real count when every set is finished', () => {
    const e = estimateRoutes(34913, first, { sets, finishedSets: sets, finishedRoutes: 34913, openRoutes: 0 });
    expect(e.total).toBe(34913);
  });

  it('is trusted at a quarter of the sets finished, never under 20', () => {
    expect(enoughSets({ sets: 60, finishedSets: 15, finishedRoutes: 60, openRoutes: 0 })).toBe(false);
    expect(enoughSets({ sets: 1000, finishedSets: 50, finishedRoutes: 200, openRoutes: 0 })).toBe(false);
    expect(enoughSets({ sets: 1000, finishedSets: 250, finishedRoutes: 1000, openRoutes: 0 })).toBe(true);
    expect(enoughSets({ sets: 100000, finishedSets: 200, finishedRoutes: 800, openRoutes: 0 })).toBe(false);
    expect(enoughSets({ sets: 100000, finishedSets: 25000, finishedRoutes: 100000, openRoutes: 0 })).toBe(true);
  });

  it('words the note honestly', () => {
    const e = estimateRoutes(12000, first, { sets, finishedSets: 2400, finishedRoutes: 9600, openRoutes: 0 });
    expect(estimateNote(e)).toBe('estimated from the first 2,400 sets; first guess was ~95,000');
    const b = estimateRoutes(12000, first, {
      sets,
      finishedSets: 100,
      finishedRoutes: 400,
      openRoutes: 11600,
      untouched: 0,
      bracketNeed: 20000,
    });
    expect(estimateNote(b)).toBe('estimated from the 8,632 sets tried so far; first guess was ~95,000');
  });

  it('rounds for display and validates a remembered ratio', () => {
    expect(roundedRoutes(34913)).toBe(35000);
    expect(roundedRoutes(812)).toBe(812);
    expect(usableRatio('4.1')).toBe(4.1);
    expect(usableRatio('abc')).toBe(0);
    expect(usableRatio(0)).toBe(0);
  });
});

describe('the route total from where each set stands (brackets)', () => {
  // The real run that went wrong: 32,645 sets, round 4, a few hundred finished (the cheap ones).
  const sets = 32645;
  const first = 130580;
  const learn = (o: Partial<Parameters<typeof estimateRoutes>[2] & object> = {}) => ({
    sets,
    finishedSets: 412,
    finishedRoutes: 1648,
    // Four rounds in: every open set has used about four routes.
    openRoutes: 32233 * 4,
    inFlight: 0,
    untouched: 0,
    bracketNeed: 32233 * 2,
    round: 3,
    ...o,
  });

  it('does not collapse to the routes priced while sets are open (the old figure did)', () => {
    const priced = 1648 + 32233 * 4;
    const e = estimateRoutes(priced, first, learn());
    expect(e.learned).toBe(true);
    expect(e.basis).toBe('brackets');
    expect(e.total).toBe(priced + 32233 * 2);
    // The old figure: open x the early finishers' 4 a set, less what the open sets already used -> 0,
    // so the total was the routes priced, the bar read full and the time left could only rise.
    expect(Math.max(0, 32233 * (1648 / 412) - 32233 * 4)).toBe(0);
  });

  it('is never below priced + in flight + a route for every open set', () => {
    const priced = 50000;
    // A bracket report that says nothing is needed cannot pull it under the floor...
    expect(estimateRoutes(priced, first, learn({ bracketNeed: 0 })).total).toBe(priced + 32233);
    // ...and routes handed out but not priced are work still to do.
    expect(estimateRoutes(priced, first, learn({ bracketNeed: 0, inFlight: 40000 })).total).toBe(priced + 40000);
    // Before it is learned too: the first guess, but not below the floor.
    const early = estimateRoutes(priced, 1000, learn({ untouched: 30000, bracketNeed: 100 }));
    expect(early.learned).toBe(false);
    expect(early.total).toBe(priced + 32233);
  });

  it('counts sets not tried yet at the per-set figure, once a fair share has been tried', () => {
    // Round 1: 10,000 tried, 22,645 still to try at the first guess's 4 a set.
    const e = estimateRoutes(
      10000,
      first,
      learn({ finishedSets: 0, finishedRoutes: 0, untouched: 22645, bracketNeed: 30000 })
    );
    expect(e.learned).toBe(true);
    expect(e.basedOnSets).toBe(10000);
    expect(e.total).toBe(Math.round(10000 + 30000 + 22645 * (first / sets)));
    // Fewer than a quarter tried: the first guess still.
    const before = estimateRoutes(
      3000,
      first,
      learn({ finishedSets: 0, finishedRoutes: 0, untouched: 29645, bracketNeed: 9000 })
    );
    expect(before.learned).toBe(false);
    expect(before.total).toBe(first);
  });

  it('gives no total without a first guess until it has something to go on', () => {
    expect(estimateRoutes(100, 0, learn({ untouched: 32000 })).total).toBe(0);
    expect(estimateRoutes(100, 0, learn()).total).toBe(100 + 32233 * 2);
  });

  it('lands on the routes priced when every set is finished', () => {
    const e = estimateRoutes(130000, first, learn({ finishedSets: sets, openRoutes: 0, bracketNeed: 0 }));
    expect(e.total).toBe(130000);
  });
});

describe('the progress bar', () => {
  it('never reads full while more than a few minutes are left', () => {
    expect(deadlinePercent(130000, 130000, 8.3 * 3600)).toBe(BAR_CAP);
    expect(deadlinePercent(99, 100, 600)).toBe(BAR_CAP);
    // Unknown time left counts as "more than a few minutes".
    expect(deadlinePercent(99, 100, null)).toBe(BAR_CAP);
    // In the last few minutes it may go on, but never to 100 while running.
    expect(deadlinePercent(99, 100, 120)).toBe(99);
    expect(deadlinePercent(100, 100, 10)).toBe(99);
    expect(deadlinePercent(50, 100, 3600)).toBe(50);
    expect(deadlinePercent(10, 0, 3600)).toBe(0);
  });
});

describe('the prefix memo of a By a date run', () => {
  it('starts from the same default as the chain evaluator', () => {
    expect(DEFAULT_MEMO_CAPACITY).toBe(CHAIN_DEFAULT_MEMO);
  });

  it("holds each worker's early legs with room to spare (the 32,645-set run on 19 workers)", () => {
    // ~1,718 sets a worker; with siblings sharing, ~1.2 early legs a set.
    const o = { sets: 32645, firstLegs: 32645 * 2.2, workers: 19 };
    expect(memoWorkingSet(o)).toBeCloseTo((32645 * 1.2) / 19, 5);
    const cap = deadlineMemoCapacity(o);
    expect(cap).toBeGreaterThanOrEqual(memoWorkingSet(o));
    expect(cap).toBe(memoCeiling(19));
    expect(laterRouteLegs({ ...o, capacity: cap })).toBe(1);
  });

  it('keeps all the memos inside one share of the tab, less each as workers are added', () => {
    for (const w of [1, 4, 8, 16, 19, 24, 31, 64]) {
      const each = memoCeiling(w);
      expect(each).toBeGreaterThanOrEqual(MEMO_MIN_ENTRIES);
      expect(each).toBeLessThanOrEqual(MEMO_MAX_ENTRIES);
      if (each > MEMO_MIN_ENTRIES) expect(each * w * MEMO_ENTRY_BYTES).toBeLessThanOrEqual(MEMO_POOL_BYTES);
    }
    expect(memoCeiling(31)).toBeLessThan(memoCeiling(19));
    expect(memoCeiling(19)).toBeLessThan(memoCeiling(8));
    // Huge space, many workers: the ceiling wins.
    expect(deadlineMemoCapacity({ sets: 200000, firstLegs: 200000 * 5, workers: 31 })).toBe(memoCeiling(31));
  });

  it('keeps the old 3,000 for a small run where that fits, and sizes up for a big one', () => {
    expect(deadlineMemoCapacity({ sets: 236, firstLegs: 600, workers: 8 })).toBe(DEFAULT_MEMO_CAPACITY);
    const big = { sets: 20000, firstLegs: 20000 * 3, workers: 8 };
    expect(deadlineMemoCapacity(big)).toBe(Math.min(memoCeiling(8), Math.ceil(1.5 * memoWorkingSet(big)) + 64));
    expect(deadlineMemoCapacity(big)).toBeGreaterThan(DEFAULT_MEMO_CAPACITY);
  });

  it('charges a later route its early legs again when the memo cannot hold them', () => {
    const o = { sets: 1000, firstLegs: 3000, workers: 1 };
    expect(laterRouteLegs({ ...o, capacity: 2000 })).toBe(1);
    expect(laterRouteLegs({ ...o, capacity: 1999 })).toBe(3);
  });

  it('plans the legs with that figure', () => {
    const sets = Array.from({ length: 40 }, (_, i) => [151 + (i % 5), 200 + Math.floor(i / 5)]);
    const plan = planLegs({ sets, workers: 2, currentTE: 150 });
    expect(plan.laterLegs).toBe(1);
    expect(plan.legs).toBeCloseTo(plan.firstLegs + (plan.routes - plan.sets) * plan.laterLegs, 5);
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
    const o = { sets: 1000, firstLegs: 3000, laterLegs: 1 };
    expect(legsLeft({ ...o, routesLeft: 4000, untouched: 1000 })).toBe(3000 + 3000);
    expect(legsLeft({ ...o, routesLeft: 3500, untouched: 500 })).toBe(1500 + 3000);
    expect(legsLeft({ ...o, routesLeft: 3000, untouched: 0 })).toBe(3000);
    expect(legsLeft({ ...o, routesLeft: 1, untouched: 0 })).toBe(1);
    // Never under a leg a route still to go.
    expect(legsLeft({ ...o, routesLeft: 3100, untouched: 100, firstLegs: 0 })).toBe(3100);
  });

  it('charges later routes the legs they really cost on this run', () => {
    // The memo-starved run: ~2.07 real legs a later route, not the 1 the plan assumed.
    expect(legsLeft({ routesLeft: 1000, untouched: 0, sets: 10, firstLegs: 30, laterLegs: 2.07 })).toBeCloseTo(2070, 5);
    // A figure under one leg a route is not possible.
    expect(legsLeft({ routesLeft: 1000, untouched: 0, sets: 10, firstLegs: 30, laterLegs: 0.5 })).toBe(1000);
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

  it('a carried-on run does not count its replayed routes as speed', () => {
    // A resumed run replays 4,000 routes from its checkpoint in 10 s, then simulates 2 legs a second.
    const t0 = 50_000_000;
    let samples: [number, number][] = [];
    for (let s = 0; s <= 10; s++) samples = addLegSample(samples, t0 + s * 1000, s * 400, s * 400);
    // Replay alone: one sample, no rate at all.
    expect(samples).toEqual([[t0 + 10_000, 0]]);
    expect(recentLegRate(samples, t0 + 10_000)).toBeNull();
    // Real work after it: no rate-based figure before 2 minutes of it...
    const at = (s: number) => t0 + 10_000 + s * 1000;
    for (let s = 1; s <= 90; s++) samples = addLegSample(samples, at(s), 4000 + 2 * s, 4000);
    expect(recentLegRate(samples, at(90))).toBeNull();
    // ...and then the real 2 legs a second, not 4,000 routes in 10 s.
    for (let s = 91; s <= 200; s++) samples = addLegSample(samples, at(s), 4000 + 2 * s, 4000);
    expect(recentLegRate(samples, at(200))).toBeCloseTo(2, 1);
    // The same counts without telling replayed from real would have read a huge rate.
    const naive: [number, number][] = [
      [t0, 0],
      [at(200), 4000 + 400],
    ];
    expect(recentLegRate(naive, at(200))!).toBeGreaterThan(20);
  });

  // Review, 9 Oct: a small By a date run said "(measuring…)" through round 2 with seconds left, since
  // the measured rate waited for two minutes of work the run never had.
  it('stops measuring once the workers have done real work, blending toward the measured rate', () => {
    const t0 = 70_000_000;
    // Nothing real yet: the planned rate, measuring.
    expect(liveLegRate([], t0, 3)).toEqual({ rate: 3, measuring: true });
    expect(liveLegRate([[t0, 0]], t0, 3)).toEqual({ rate: 3, measuring: true });
    expect(liveLegRate([[t0, 0]], t0, null)).toEqual({ rate: null, measuring: true });
    // The first batch of real legs, 6 s in at 10 legs a second: no longer measuring, mostly the plan.
    const early: [number, number][] = [
      [t0, 0],
      [t0 + 6000, 60],
    ];
    const r = liveLegRate(early, t0 + 6000, 3);
    expect(r.measuring).toBe(false);
    expect(r.rate).toBeCloseTo((6 / RATE_MIN_SECONDS) * 10 + (1 - 6 / RATE_MIN_SECONDS) * 3, 6);
    // With no plan, what it measured.
    expect(liveLegRate(early, t0 + 6000, null)).toEqual({ rate: 10, measuring: false });
    // Two minutes in: the measured rate alone.
    const full: [number, number][] = [
      [t0, 0],
      [t0 + RATE_MIN_SECONDS * 1000, RATE_MIN_SECONDS * 10],
    ];
    expect(liveLegRate(full, t0 + RATE_MIN_SECONDS * 1000, 3)).toEqual({ rate: 10, measuring: false });
  });

  it('a carried-on run still measures from where its replay ends, not from the replay', () => {
    const t0 = 80_000_000;
    let samples: [number, number][] = [];
    for (let s = 0; s <= 10; s++) samples = addLegSample(samples, t0 + s * 1000, s * 400, s * 400);
    expect(liveLegRate(samples, t0 + 10_000, 2)).toEqual({ rate: 2, measuring: true });
    // 6 s of real work at 2 legs a second: measured, and nowhere near the replay's 400 a second.
    for (let s = 1; s <= 6; s++) samples = addLegSample(samples, t0 + 10_000 + s * 1000, 4000 + 2 * s, 4000);
    const r = liveLegRate(samples, t0 + 16_000, 2);
    expect(r.measuring).toBe(false);
    expect(r.rate).toBeCloseTo(2, 5);
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
