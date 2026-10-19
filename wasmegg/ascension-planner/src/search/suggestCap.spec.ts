import { describe, expect, it } from 'vitest';
import { countBandShapes, parseChainText } from './deadline';
import {
  COARSE_SUGGESTION_NOTE,
  MAX_SUGGESTED_SETS,
  SPACE_STEPS,
  SPACE_WIDTHS,
  cappedStopsByWidth,
  spaceBySliders,
  stopsByWidth,
  suggestBase,
} from './deadlineSuggest';

/** What the panel shows as the box's "sets of early stops" (DeadlinePanel.vue `shapesOf`): the box's
 *  text read back and counted, so the cap is checked on what Find would run, not on a side count. */
const panelSets = (text: string, te: number, lastHi: number) => countBandShapes(parseChainText(text), te, lastHi);

/** DeadlinePanel.vue `suggestion(k)` with no instant answer, no answer and no route: spaced evenly. */
function evenBox(te: number, n: number, w: number, s: number, lastHi?: number, anyAnswer?: number[]) {
  const base = suggestBase(n, te, { route: [], anyAnswer: anyAnswer ?? null });
  expect(base.from).toBe('even');
  const hi = lastHi ?? Math.min(490, base.last + 20);
  return { sug: cappedStopsByWidth(te, base.early, hi, w, s), base, hi };
}

describe('cappedStopsByWidth (By a date Exhaustive suggestion, never over MAX_SUGGESTED_SETS)', () => {
  it('is 20,000 sets', () => {
    expect(MAX_SUGGESTED_SETS).toBe(20_000);
  });

  it("the beta test's box: 57,650,850 sets uncapped, under the cap and coarse now", () => {
    // TE 93, no instant answer, 6 ascensions spaced evenly up to the quick scan's last stop (182),
    // ±30 at every TE, last stop up to 202.
    const te = 93;
    const base = suggestBase(6, te, { route: [], anyAnswer: [120, 182] });
    expect(base.from).toBe('even');
    const raw = stopsByWidth(te, base.early, 202, 30, 1)!;
    expect(raw.sets).toBe(57_650_850);
    const sug = cappedStopsByWidth(te, base.early, 202, 30, 1)!;
    expect(sug.coarse).toBe(true);
    expect(sug.step).toBeGreaterThan(1);
    expect(panelSets(sug.text, te, 202)).toBe(sug.sets);
    expect(sug.sets).toBeLessThanOrEqual(MAX_SUGGESTED_SETS);
    expect(sug.sets).toBeGreaterThan(0);
  });

  it('the default ±10 every 2 TE at 8 ascensions (21.6 million sets uncapped) fits', () => {
    const base = suggestBase(8, 93, { route: [] });
    expect(stopsByWidth(93, base.early, base.last + 20, 10, 2)!.sets).toBeGreaterThan(20_000_000);
    const sug = cappedStopsByWidth(93, base.early, base.last + 20, 10, 2)!;
    expect(sug.coarse).toBe(true);
    expect(panelSets(sug.text, 93, base.last + 20)).toBeLessThanOrEqual(MAX_SUGGESTED_SETS);
  });

  // Every slider position, 2 to 8 ascensions, the last stop the panel guesses and the widest (490).
  for (const te of [75, 93, 100, 119, 200]) {
    it(`never over the cap at TE ${te} with no answer, at every slider position`, () => {
      let checked = 0;
      for (let n = 2; n <= 8; n++)
        for (const w of SPACE_WIDTHS)
          for (const s of SPACE_STEPS)
            for (const lastHi of [undefined, 490]) {
              const { sug, hi } = evenBox(te, n, w, s, lastHi);
              if (!sug) continue;
              const sets = panelSets(sug.text, te, hi);
              expect(sets).toBe(sug.sets);
              expect(sets).toBeLessThanOrEqual(MAX_SUGGESTED_SETS);
              expect(sets).toBeGreaterThan(0);
              checked++;
            }
      expect(checked).toBeGreaterThan(100);
    });
  }

  it('leaves a box under the cap exactly as asked, not coarse', () => {
    // TE 93, the default box: 4 ascensions, ±10 every 2 TE, 2,541 sets.
    const base = suggestBase(4, 93, { route: [] });
    const asked = stopsByWidth(93, base.early, base.last + 20, 10, 2)!;
    const sug = cappedStopsByWidth(93, base.early, base.last + 20, 10, 2)!;
    expect(asked.sets).toBe(2541);
    expect(sug.coarse).toBe(false);
    expect(sug.text).toBe(asked.text);
    expect(sug.step).toBe(2);
    expect(sug.halfWidth).toBe(10);
  });

  it("centres on the quick scan's best route when it has one for that count, and keeps it in the box", () => {
    const te = 93;
    const best = [104, 118, 133, 149, 166, 182];
    const base = suggestBase(6, te, { route: [], answer: best, anyAnswer: best });
    expect(base.from).toBe('answer');
    expect(base.early).toEqual(best.slice(0, -1));
    const sug = cappedStopsByWidth(te, base.early, 202, 30, 1)!;
    expect(sug.sets).toBeLessThanOrEqual(MAX_SUGGESTED_SETS);
    expect(panelSets(sug.text, te, 202)).toBe(sug.sets);
    // Every early stop of the best route is still on the grid.
    sug.bands.forEach((b, i) => expect(b).toContain(best[i]));
  });

  it('says why the grid is coarse in the words the box shows', () => {
    expect(COARSE_SUGGESTION_NOTE).toBe('Coarse steps so this stays small; narrow them where you want to look closer.');
  });

  it('a smaller cap is held too (the Full sweep passes its own budget)', () => {
    const base = suggestBase(8, 93, { route: [] });
    const sug = cappedStopsByWidth(93, base.early, 490, 30, 1, 50)!;
    expect(sug.sets).toBeLessThanOrEqual(50);
    expect(sug.coarse).toBe(true);
  });
});

describe("spaceBySliders (Fastest's Full sweep): moved sliders held to the same budget", () => {
  it('8 ascensions at ±30 every TE stays within maxChains', () => {
    const route = [100, 112, 125, 140, 158, 180, 210, 490];
    const raw = stopsByWidth(93, route.slice(0, -1), 490, 30, 1)!;
    expect(raw.sets).toBeGreaterThan(75_000);
    const s = spaceBySliders(93, route, { widthIx: SPACE_WIDTHS.indexOf(30), stepIx: SPACE_STEPS.indexOf(1) }, 75_000)!;
    expect(s.moved).toBe(true);
    expect(s.coarse).toBe(true);
    expect(s.sets).toBeLessThanOrEqual(75_000);
  });
});
