import { describe, expect, it } from 'vitest';
import { eggBlocks, hasEggTimes, routeTimeline, shiftSteps, stepLength, timelineMoments } from './routeTimeline';
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

describe('shiftSteps: every stretch in order, so the build-up shows (fix 22b)', () => {
  const D = 24 * H;
  // A real-shaped leg: C1 30 min, I1 13 min, K1 0 s, C2 55 s, K2 0 s, R1 1 s, C3 15 d, H1 0 s, K3 5 d.
  const t1 = T0 + 1800;
  const t2 = t1 + 780;
  const t3 = t2 + 55;
  const t4 = t3 + 1;
  const t5 = t4 + 15 * D;
  const real = leg({
    startTime: T0,
    endTime: t5 + 5 * D,
    endTE: 250,
    shifts: [
      { at: t1, egg: 'integrity', fromEgg: 'curiosity', te: 28 },
      { at: t2, egg: 'kindness', fromEgg: 'integrity', te: 20 },
      { at: t2, egg: 'curiosity', fromEgg: 'kindness', te: 15 },
      { at: t3, egg: 'kindness', fromEgg: 'curiosity', te: 29 },
      { at: t3, egg: 'resilience', fromEgg: 'kindness', te: 15 },
      { at: t4, egg: 'curiosity', fromEgg: 'resilience', te: 10 },
      { at: t5, egg: 'humility', fromEgg: 'curiosity', te: 60 },
      { at: t5, egg: 'kindness', fromEgg: 'humility', te: 12 },
    ],
    endEgg: { egg: 'kindness', te: 40 },
  });

  it('order, labels (opener is C1, each egg counted per ascension), starts, lengths, TE at each end', () => {
    const st = shiftSteps(real);
    expect(st.map(x => [x.label, x.egg, x.start, x.seconds, x.te, x.noLaying])).toEqual([
      ['C1', 'curiosity', T0, 1800, 28, false],
      ['I1', 'integrity', t1, 780, 20, false],
      ['K1', 'kindness', t2, 0, 15, true],
      ['C2', 'curiosity', t2, 55, 29, false],
      ['K2', 'kindness', t3, 0, 15, true],
      ['R1', 'resilience', t3, 1, 10, false],
      ['C3', 'curiosity', t4, 15 * D, 60, false],
      ['H1', 'humility', t5, 0, 12, true],
      // The last stretch: to the leg's end, at endEgg's TE.
      ['K3', 'kindness', t5, 5 * D, 40, false],
    ]);
    expect(st.map(x => stepLength(x.seconds))).toEqual([
      '30 min',
      '13 min',
      '0 s',
      '55 s',
      '0 s',
      '1 s',
      '15 d',
      '0 s',
      '5 d',
    ]);
  });

  it('routeTimeline carries the steps; timelineMoments includes their starts', () => {
    const [a1] = routeTimeline([250], [real]);
    expect(a1.steps.map(x => x.label).join(' ')).toBe('C1 I1 K1 C2 K2 R1 C3 H1 K3');
    // The per-egg summary (the footer) is still there.
    expect(a1.eggs.map(e => e.egg)).toEqual(['curiosity', 'integrity', 'kindness', 'resilience', 'humility']);
    expect(timelineMoments([a1])).toContain(t4);
  });

  it('no TE recorded: times and lengths, TE null', () => {
    const old = leg({
      startTime: T0,
      endTime: T0 + 10 * H,
      shifts: [
        { at: T0 + H, egg: 'integrity', fromEgg: 'curiosity' },
        { at: T0 + 5 * H, egg: 'curiosity' },
      ],
    });
    expect(shiftSteps(old).map(x => [x.label, x.seconds, x.te])).toEqual([
      ['C1', H, null],
      ['I1', 4 * H, null],
      ['C2', 5 * H, null],
    ]);
  });

  it('the opener unknown (older legs): no labels, never a count that could be one short', () => {
    const older = leg({ endTime: T0 + 10 * H, shifts: [{ at: T0 + H, egg: 'integrity', te: 5 }] });
    expect(shiftSteps(older)).toEqual([
      { label: null, egg: 'integrity', start: T0 + H, seconds: 9 * H, te: null, noLaying: false },
    ]);
  });

  it('a leg that never shifts: one stretch on its end egg; replayed legs: none', () => {
    const still = leg({ startTime: T0, endTime: T0 + 10 * H, shifts: [], endEgg: { egg: 'humility', te: 7 } });
    expect(shiftSteps(still)).toEqual([
      { label: 'H1', egg: 'humility', start: T0, seconds: 10 * H, te: 7, noLaying: false },
    ]);
    expect(shiftSteps(legs[1])).toEqual([]);
  });

  it('stepLength: s / min / h / d', () => {
    expect(stepLength(0)).toBe('0 s');
    expect(stepLength(0.4)).toBe('0 s');
    expect(stepLength(125)).toBe('2 min 5 s');
    expect(stepLength(29 * 60 + 40)).toBe('29 min');
    expect(stepLength(3 * H + 300)).toBe('3 h 5 min');
    expect(stepLength(14 * 24 * H + 23 * H + 59)).toBe('14 d 23 h');
    expect(stepLength(null)).toBe('—');
  });
});
