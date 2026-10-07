import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STOP_SETS,
  STOP_SET_SIZES,
  routeSpace,
  stopsByWidth,
  suggestBase,
  suggestStops,
} from './deadlineSuggest';

describe('suggestStops', () => {
  it('stays within the size picked, and grows with it', () => {
    let last = 0;
    for (const size of STOP_SET_SIZES) {
      const s = suggestStops(137, [145, 177, 216], 267, size)!;
      expect(s.sets).toBeLessThanOrEqual(size);
      expect(s.sets).toBeGreaterThanOrEqual(last);
      last = s.sets;
    }
    expect(last).toBeGreaterThan(2000);
  });

  it('tries the first stop at every TE from just above your TE', () => {
    const s = suggestStops(137, [145, 177, 216], 267, DEFAULT_STOP_SETS)!;
    expect(s.bands[0][0]).toBe(138);
    expect(s.bands[0][1] - s.bands[0][0]).toBe(1);
  });

  // The board's by-date answers (Egg Day 2027) put the first stop up to 38 TE above the player's TE.
  it('reaches the first stops the board found, from a route that started lower', () => {
    const cases: [number, number[], number[]][] = [
      [137, [145, 190], [148, 192]],
      [168, [180, 210, 250], [172, 195, 238, 293]],
      [184, [195, 225], [215, 297]],
      [199, [205, 260], [231, 273]],
    ];
    for (const [te, route, answer] of cases) {
      const s = suggestStops(te, route, answer[answer.length - 1] + 30, DEFAULT_STOP_SETS)!;
      expect(s.bands[0]).toContain(answer[0]);
    }
  });

  it('centres a first stop far above your TE on itself', () => {
    const s = suggestStops(120, [200, 260], 330, 500)!;
    expect(s.bands[0][0]).toBeGreaterThan(170);
    expect(s.bands[0]).toContain(200);
  });

  it('has no suggestion when there is no room below the last stop', () => {
    expect(suggestStops(300, [301], 300, 1000)).toBeNull();
  });
});

describe('stopsByWidth', () => {
  it('tries the first stop at every TE and the rest at the step, centres included', () => {
    const s = stopsByWidth(137, [145, 177, 216], 267, 5, 2)!;
    expect(s.text).toBe('140-150:1; 173-181:2; 212-220:2');
    expect(s.bands[1]).toContain(177);
    expect(s.bands[2]).toContain(216);
  });
  it('starts the first stop just above your TE when its centre is close', () => {
    const s = stopsByWidth(140, [142, 170], 230, 10, 5)!;
    expect(s.bands[0][0]).toBe(141);
    expect(s.bands[0].at(-1)).toBe(152);
  });
  it('gets bigger as the width grows and smaller as the step grows', () => {
    const a = stopsByWidth(137, [150, 180, 215], 267, 5, 5)!.sets;
    const b = stopsByWidth(137, [150, 180, 215], 267, 15, 5)!.sets;
    const c = stopsByWidth(137, [150, 180, 215], 267, 15, 1)!.sets;
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
});

describe('suggestBase: what a chain is suggested around', () => {
  const route = [160, 190, 230, 270, 330];
  it('prefers the instant answer for that many ascensions', () => {
    const b = suggestBase(4, 146, { instant: [164, 199, 223, 256], answer: [170, 200, 225, 250], route });
    expect(b).toEqual({ early: [164, 199, 223], last: 256, from: 'instant', around: [164, 199, 223, 256] });
  });
  it('then the last answer, then the route, then even spacing', () => {
    expect(suggestBase(4, 146, { instant: null, answer: [170, 200, 225, 250], route }).from).toBe('answer');
    expect(
      suggestBase(3, 146, { instant: [164, 199, 223, 256], answer: null, anyAnswer: [170, 250], route })
    ).toMatchObject({
      from: 'route',
      early: [160, 190],
      last: 250,
    });
    expect(suggestBase(3, 146, { route: [] })).toMatchObject({ from: 'even', last: 256, early: [183, 219] });
  });
  it('skips a route that starts at or below the TE (an older save or another account)', () => {
    expect(suggestBase(4, 187, { instant: [164, 199, 223, 256], route: [] }).from).toBe('even');
  });
});

describe('routeSpace (the Full sweep around the instant route)', () => {
  const route = [169, 198, 225, 253, 287, 323, 490];
  it('centres every band on the route and stays inside the budget', () => {
    const s = routeSpace(141, route, 200_000)!;
    expect(s.sets).toBeLessThanOrEqual(200_000);
    expect(s.bands).toHaveLength(6);
    s.bands.forEach((b, i) => expect(b).toContain(route[i]));
    expect(s.halfWidth).toBeGreaterThanOrEqual(5);
  });

  it('goes coarser before going narrower than 5 either side', () => {
    const fine = routeSpace(141, route, 200_000)!;
    const small = routeSpace(141, route, 3_000)!;
    expect(small.sets).toBeLessThanOrEqual(3_000);
    expect(small.step > fine.step || small.halfWidth < fine.halfWidth).toBe(true);
  });

  it('is null for a one-ascension route', () => {
    expect(routeSpace(141, [490], 1000)).toBeNull();
  });
});
