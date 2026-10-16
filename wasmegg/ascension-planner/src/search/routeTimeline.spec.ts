import { describe, expect, it } from 'vitest';
import { eggBlocks, hasEggTimes, routeTimeline } from './routeTimeline';
import type { LegSummary } from './types';

const H = 3600;
const T0 = Date.parse('2026-11-01T12:00:00Z') / 1000;

function leg(o: Partial<LegSummary>): LegSummary {
  return {
    key: '1-sale',
    endTE: 200,
    durationSeconds: 0,
    maxELR: 1,
    endTime: 0,
    tier13Unlocked: false,
    ...o,
  } as LegSummary;
}

/** A1: Curiosity → Integrity → Curiosity → Kindness, ends on Kindness. A2: replayed (no shifts). */
const legs = [
  leg({
    startTime: T0,
    endTime: T0 + 100 * H,
    endTE: 210,
    shifts: [
      { at: T0 + 2 * H, egg: 'integrity', fromEgg: 'curiosity', te: 40 },
      { at: T0 + 50 * H, egg: 'curiosity', fromEgg: 'integrity', te: 45 },
      { at: T0 + 60 * H, egg: 'kindness', fromEgg: 'curiosity', te: 41 },
    ],
    endEgg: { egg: 'kindness', te: 44 },
  }),
  leg({ endTime: T0 + 300 * H, endTE: 230, replayed: true }),
];

describe('routeTimeline', () => {
  it('one line per ascension: its stop, its TE and when it is reached', () => {
    const t = routeTimeline([210, 230], legs);
    expect(t.map(l => [l.asc, l.stopTE, l.reachedAt])).toEqual([
      [1, 210, T0 + 100 * H],
      [2, 230, T0 + 300 * H],
    ]);
  });

  it("each egg's first shift, last shift and the TE it has then, in the order first laid", () => {
    const [a1] = routeTimeline([210, 230], legs);
    expect(a1.eggs).toEqual([
      // Opened on: first at the leg's start; left last at the second Curiosity stretch's end.
      { egg: 'curiosity', firstAt: T0, opens: true, lastAt: T0 + 60 * H, ends: false, te: 41 },
      { egg: 'integrity', firstAt: T0 + 2 * H, opens: false, lastAt: T0 + 50 * H, ends: false, te: 45 },
      // The egg it ends on: to the leg's end, at endEgg's TE.
      { egg: 'kindness', firstAt: T0 + 60 * H, opens: false, lastAt: T0 + 100 * H, ends: true, te: 44 },
    ]);
  });

  it('a leg without shifts (replayed) has its line and no eggs', () => {
    expect(routeTimeline([210, 230], legs)[1].eggs).toEqual([]);
    expect(hasEggTimes(legs)).toBe(true);
    expect(hasEggTimes([legs[1]])).toBe(false);
    expect(hasEggTimes(null)).toBe(false);
  });

  it('legs from before shifts kept their TE: the times stay, the TE is null (never a guess)', () => {
    const old = leg({
      startTime: T0,
      endTime: T0 + 10 * H,
      shifts: [
        { at: T0 + H, egg: 'integrity', fromEgg: 'curiosity' },
        { at: T0 + 5 * H, egg: 'humility' },
      ],
    });
    const [a1] = routeTimeline([200], [old]);
    expect(a1.eggs.map(e => [e.egg, e.firstAt, e.lastAt, e.te])).toEqual([
      ['curiosity', T0, T0 + H, null],
      // fromEgg missing on a later shift: the egg the farm was on is used.
      ['integrity', T0 + H, T0 + 5 * H, null],
      ['humility', T0 + 5 * H, T0 + 10 * H, null],
    ]);
  });

  it('an endEgg naming another egg than the one the shifts end on is not used', () => {
    const odd = leg({
      startTime: T0,
      endTime: T0 + 10 * H,
      shifts: [{ at: T0 + H, egg: 'integrity', fromEgg: 'curiosity', te: 3 }],
      endEgg: { egg: 'kindness', te: 9 },
    });
    expect(routeTimeline([200], [odd])[0].eggs[1]).toMatchObject({ egg: 'integrity', ends: true, te: null });
  });

  it('a leg that never shifts stays on its end egg', () => {
    const still = leg({ startTime: T0, endTime: T0 + 10 * H, shifts: [], endEgg: { egg: 'humility', te: 7 } });
    expect(routeTimeline([200], [still])[0].eggs).toEqual([
      { egg: 'humility', firstAt: T0, opens: true, lastAt: T0 + 10 * H, ends: true, te: 7 },
    ]);
  });

  it('nothing for no legs', () => {
    expect(routeTimeline([200, 210], [])).toEqual([]);
    expect(routeTimeline([200, 210], undefined)).toEqual([]);
  });
});

describe('eggBlocks (moved from ChainSearchPanel and Your latest run)', () => {
  it('the opener then one block per shift, each as long as the farm stays', () => {
    const b = eggBlocks(legs[0]);
    expect(b.map(x => [x.egg, x.at, x.isSwitch])).toEqual([
      ['curiosity', T0, false],
      ['integrity', T0 + 2 * H, true],
      ['curiosity', T0 + 50 * H, true],
      ['kindness', T0 + 60 * H, true],
    ]);
    expect(b[0].length).not.toBe('—');
    expect(eggBlocks(legs[1])).toEqual([]);
  });
});
