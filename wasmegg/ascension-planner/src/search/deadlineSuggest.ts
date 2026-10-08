/**
 * "Suggest a space" for Highest TE by a date (DeadlinePanel.vue): the early stops of one chain, sized
 * to a number of sets the player picks on a slider, as the Full sweep's Suggest a space is (the user,
 * 1 Oct: "add the bar to the suggest a space here as well? perhaps it can expand the numbers a bit out
 * and keep it step 1 for the lower ones").
 *
 * WHAT THE RUNS SAY. The 13 by-date answers on the board (Egg Day 2027, 1 Oct) put the first stop
 * anywhere from 1 to 38 TE above the player's TE: 137 -> 148, 168 -> 172 and 206, 184 -> 194 and
 * 215, 199 -> 201, 231 and 234. The old suggestion tried a few TE either side of the player's route
 * (its first stop to 4 above it, then +-8 at every 2nd TE), so an answer 30 TE up was outside the box
 * and the run could only prove the best of a box that missed it. So the first stop here always
 * starts just above your TE, at every TE, and is the first thing to grow; the later stops start at
 * every 5th TE around the centre and get finer, lowest first, then wider, while the sets still fit.
 *
 * Centres come from the caller: the last answer at that many ascensions, else the player's route,
 * else evenly spaced.
 */
import { countBandShapes } from './deadline';

/** The slider's sizes, in sets of early stops (each set is about log2(span) + 2 routes). */
export const STOP_SET_SIZES = [250, 500, 1000, 2500, 5000, 10_000];
/** Its starting point: about what the old suggestion filled in, so about as long a run (a few hours
 *  on a typical machine), but with the first stop's whole reach in it. */
export const DEFAULT_STOP_SETS = 500;

export interface StopSuggestion {
  bands: number[][];
  text: string;
  sets: number;
}

interface Band {
  lo: number;
  hi: number;
  step: number;
}

/** How far the first stop's band may reach above your TE (the board's answers reach +38). */
const FIRST_REACH = 40;
/** How far above its centre the first band may reach when its centre is near your TE. */
const FIRST_ABOVE = 24;
/** Later bands: starting half-width, the widest they grow to, and their steps, coarse to fine. They
 *  start narrow so the first stop gets its share first; the rounds below widen them. */
const LATER_START = 5;
const LATER_MAX_HALF = 30;
const STEPS = [5, 3, 2, 1];

function values(b: Band): number[] {
  const out: number[] = [];
  for (let v = b.lo; v <= b.hi; v += b.step) out.push(v);
  return out;
}

/**
 * Bands for a chain whose early stops are centred on `early` (one per ascension before the last),
 * from `currentTE`, with last stops up to `lastHi`, holding at most `maxSets` sets of early stops
 * where it can. Null when there is no room for the stops between your TE and the last stop.
 */
export function suggestStops(
  currentTE: number,
  early: number[],
  lastHi: number,
  maxSets: number
): StopSuggestion | null {
  const te = Math.floor(currentTE);
  const top = Math.floor(lastHi) - 1;
  if (!early.length || top <= te) return null;
  const budget = Math.max(1, Math.floor(maxSets));

  const c0 = early[0];
  const near = c0 - te <= FIRST_REACH;
  // The first band never runs into the second stop's centre.
  const firstCap = Math.min(
    top,
    (early[1] ?? top + 1) - 1,
    near ? Math.max(c0 + FIRST_ABOVE, te + FIRST_REACH) : c0 + FIRST_ABOVE
  );
  const firstFloor = near ? te + 1 : Math.max(te + 1, c0 - FIRST_ABOVE);
  const bands: Band[] = [
    near
      ? { lo: te + 1, hi: Math.min(firstCap, Math.max(te + 6, c0 + 4)), step: 1 }
      : { lo: Math.max(firstFloor, c0 - 4), hi: Math.min(firstCap, c0 + 4), step: 1 },
    ...early.slice(1).map(c => ({
      lo: Math.max(te + 1, c - LATER_START),
      hi: Math.min(top, c + LATER_START),
      step: STEPS[0],
    })),
  ];
  if (bands.some(b => b.hi < b.lo)) return null;

  const count = (bs: Band[]) => countBandShapes(bs.map(values), te, Math.floor(lastHi));
  /** Apply `change` to a copy and keep it when the sets still fit. */
  const tryMove = (change: (bs: Band[]) => boolean): boolean => {
    const next = bands.map(b => ({ ...b }));
    if (!change(next) || count(next) > budget || count(next) <= count(bands)) return false;
    bands.splice(0, bands.length, ...next);
    return true;
  };

  /** The first stop reaches further, up to `cap`: up from your TE, and down too when its centre is far. */
  const growFirst = (cap: number) =>
    tryMove(bs => {
      const b = bs[0];
      const hi = Math.min(cap, b.hi + 2);
      const lo = near ? b.lo : Math.max(firstFloor, b.lo - 2);
      if (hi === b.hi && lo === b.lo) return false;
      b.hi = hi;
      b.lo = lo;
      return true;
    });

  // The first stop first, to its full reach, since that is where the board's answers spread most,
  // before any later stop gets finer or wider.
  while (growFirst(firstCap));

  // Then round by round, so every later band gets some of the budget, lower bands before higher.
  for (let guard = 0; guard < 200; guard++) {
    let moved = false;
    // 1. The lowest later band that can get finer, does.
    for (let i = 1; i < bands.length; i++) {
      if (
        tryMove(bs => {
          const k = STEPS.indexOf(bs[i].step);
          if (k < 0 || k === STEPS.length - 1) return false;
          bs[i].step = STEPS[k + 1];
          return true;
        })
      ) {
        moved = true;
        break;
      }
    }
    // 2. The lowest later band that can get wider, does.
    for (let i = 1; i < bands.length; i++) {
      if (
        tryMove(bs => {
          const b = bs[i];
          const c = early[i];
          const lo = Math.max(te + 1, Math.max(c - LATER_MAX_HALF, b.lo - 5));
          const hi = Math.min(top, Math.min(c + LATER_MAX_HALF, b.hi + 5));
          if (lo === b.lo && hi === b.hi) return false;
          b.lo = lo;
          b.hi = hi;
          return true;
        })
      ) {
        moved = true;
        break;
      }
    }
    if (!moved) break;
  }

  const text = bands.map(b => (b.lo === b.hi ? `${b.lo}` : `${b.lo}-${b.hi}:${b.step}`)).join('; ');
  return { bands: bands.map(values), text, sets: count(bands) };
}

/** "How far around each stop" (TE either side), the first of Suggest a space's two sliders (the
 *  user, 4 Oct: one slider for the width checked, one for the step). */
export const SPACE_WIDTHS = [3, 5, 8, 10, 15, 20, 30];
/** "Step between the TEs tried" for every stop after the first, the second slider. The first stop
 *  is always tried at every TE, since that is where the board's answers spread most. */
export const SPACE_STEPS = [1, 2, 3, 5, 10];
export const DEFAULT_WIDTH_IX = 3;
export const DEFAULT_STEP_IX = 1;

/**
 * Bands for a chain from the two sliders: each early stop tried `halfWidth` TE either side of its
 * centre, the first at every TE (from just above your TE when its centre is near it), the rest every
 * `step` TE, lined up so the centre itself is always tried. Null when the stops don't fit between
 * your TE and the last stop.
 */
export function stopsByWidth(
  currentTE: number,
  early: number[],
  lastHi: number,
  halfWidth: number,
  step: number
): StopSuggestion | null {
  const te = Math.floor(currentTE);
  const top = Math.floor(lastHi) - 1;
  if (!early.length || top <= te) return null;
  const w = Math.max(0, Math.floor(halfWidth));
  const s = Math.max(1, Math.floor(step));
  const c0 = early[0];
  const firstCap = Math.min(top, (early[1] ?? top + 1) - 1, c0 + w);
  const bands: Band[] = [{ lo: Math.max(te + 1, c0 - w), hi: Math.max(Math.max(te + 1, c0 - w), firstCap), step: 1 }];
  for (const c of early.slice(1)) {
    let lo = Math.max(te + 1, c - w);
    lo = c - Math.floor((c - lo) / s) * s;
    const hi = Math.min(top, c + Math.floor(w / s) * s);
    bands.push({ lo, hi: Math.max(lo, hi), step: s });
  }
  if (bands.some(b => b.hi < b.lo)) return null;
  const text = bands.map(b => (b.lo === b.hi ? `${b.lo}` : `${b.lo}-${b.hi}:${b.step}`)).join('; ');
  return {
    bands: bands.map(values),
    text,
    sets: countBandShapes(bands.map(values), te, Math.floor(lastHi)),
  };
}

/** Where a chain's suggested space is centred, and how to say so. */
export interface SuggestBase {
  /** The early stops (one per ascension before the last) and the last stop guessed. */
  early: number[];
  last: number;
  from: 'instant' | 'answer' | 'route' | 'even';
  /** The route the space is around, for the "suggested around …" line (empty when spaced evenly). */
  around: number[];
}

/**
 * What Suggest a space centres an `n`-ascension chain on, best first: the instant answer's route for
 * that many ascensions (worked out for this save and plan start just now), then the last By a date
 * answer (which can be from an older save or start), then the player's own route, then even spacing
 * up to a last stop guessed from the TE.
 */
export function suggestBase(
  n: number,
  te: number,
  sources: { instant?: number[] | null; answer?: number[] | null; anyAnswer?: number[] | null; route: number[] }
): SuggestBase {
  const fits = (c: number[] | null | undefined): c is number[] => !!c && c.length === n && c[0] > te;
  if (fits(sources.instant)) {
    return {
      early: sources.instant.slice(0, -1),
      last: sources.instant[n - 1],
      from: 'instant',
      around: sources.instant,
    };
  }
  if (fits(sources.answer)) {
    return { early: sources.answer.slice(0, -1), last: sources.answer[n - 1], from: 'answer', around: sources.answer };
  }
  const anyLast = sources.anyAnswer?.length ? sources.anyAnswer[sources.anyAnswer.length - 1] : 0;
  const last = anyLast > te ? anyLast : Math.min(490, te + 110);
  const route = sources.route.filter(v => v > te && v < last);
  if (route.length >= n - 1)
    return { early: route.slice(0, n - 1), last, from: 'route', around: route.slice(0, n - 1) };
  const early = Array.from({ length: n - 1 }, (_, i) => Math.round(te + ((i + 1) * (last - te)) / n));
  return { early, last, from: 'even', around: [] };
}

/**
 * The Full sweep's Suggest a space around a route (precompute: the instant answer's, for that many
 * ascensions): bands centred on its early stops, as wide as fit `maxChains` playable sets. Resolution
 * first: every TE (step 1) if that still leaves at least 5 TE either side, else the finest step that
 * does, else the widest found. Null when the route has no early stops or nothing fits.
 */
export function routeSpace(
  currentTE: number,
  route: number[],
  maxChains: number
): (StopSuggestion & { halfWidth: number; step: number }) | null {
  const early = route.slice(0, -1);
  const last = route[route.length - 1];
  if (!early.length || !(last > currentTE)) return null;
  let fallback: (StopSuggestion & { halfWidth: number; step: number }) | null = null;
  for (const step of [1, 2, 3, 5]) {
    for (let w = 30; w >= step; w--) {
      const s = stopsByWidth(currentTE, early, last, w, step);
      if (!s || s.sets > maxChains) continue;
      const found = { ...s, halfWidth: w, step };
      if (w >= 5) return found;
      if (!fallback || w > fallback.halfWidth) fallback = found;
      break;
    }
  }
  return fallback;
}

/** A chain's two Suggest a space sliders as positions in SPACE_WIDTHS / SPACE_STEPS. Null on both is
 *  "not moved": the space is sized to a chain budget (`routeSpace`). Moving either pins both. */
export interface SpaceSliderPos {
  widthIx: number | null;
  stepIx: number | null;
}
export type SlidSpace = StopSuggestion & { halfWidth: number; step: number; moved: boolean };

/** What the sliders show before they are moved: 5 TE either side, every 2 TE (what `routeSpace` finds
 *  at the Full sweep's default size). */
export const NOMINAL_WIDTH_IX = SPACE_WIDTHS.indexOf(5);
export const NOMINAL_STEP_IX = SPACE_STEPS.indexOf(2);

/** The position in `list` nearest `v`. */
export function nearestIx(list: number[], v: number): number {
  let best = 0;
  list.forEach((x, i) => {
    if (Math.abs(x - v) < Math.abs(list[best] - v)) best = i;
  });
  return best;
}

/** A route to centre on when there is no instant answer: the middle value of each band, then the target. */
export function routeFromBands(bands: number[][], finalTE: number): number[] {
  return [...bands.map(b => b[Math.floor((b.length - 1) / 2)]), finalTE];
}

/**
 * The Full sweep's Suggest a space around `route`, sized by the two sliders (the same `stopsByWidth` as
 * By a date, so the first stop is tried at every TE from just above your TE). Unmoved sliders give
 * `routeSpace(maxChains)`, which is what Suggest filled in before the sliders existed.
 */
export function spaceBySliders(
  currentTE: number,
  route: number[],
  sliders: SpaceSliderPos,
  maxChains: number
): SlidSpace | null {
  const auto = routeSpace(currentTE, route, maxChains);
  if (sliders.widthIx == null && sliders.stepIx == null) return auto && { ...auto, moved: false };
  const wi = sliders.widthIx ?? (auto ? nearestIx(SPACE_WIDTHS, auto.halfWidth) : NOMINAL_WIDTH_IX);
  const si = sliders.stepIx ?? (auto ? nearestIx(SPACE_STEPS, auto.step) : NOMINAL_STEP_IX);
  const halfWidth = SPACE_WIDTHS[wi] ?? SPACE_WIDTHS[NOMINAL_WIDTH_IX];
  const step = SPACE_STEPS[si] ?? SPACE_STEPS[NOMINAL_STEP_IX];
  const early = route.slice(0, -1);
  const last = route[route.length - 1];
  if (!early.length || !(last > currentTE)) return null;
  const s = stopsByWidth(currentTE, early, last, halfWidth, step);
  return s && { ...s, halfWidth, step, moved: true };
}

/** One chain's own Suggest-a-space slider positions (By a date's rows). */
export interface SliderRow {
  widthIx?: number;
  stepIx?: number;
  pm?: number;
  /** `pm` is the width Simple's boxes were built with ("Open in Advanced"), not a Science card's. */
  simple?: boolean;
}

/**
 * Move a Suggest-a-space slider on chain `k`. Chains are independent unless `linked` (the "move every
 * chain's sliders together" box): then every chain takes the value, from whichever row was moved.
 * Unlinked, ONLY chain k changes -- the shared fallback that chains without a setting of their own
 * read is left alone, or moving one slider would drag every untouched chain with it.
 * Returns the indexes of the rows that changed, so the caller can re-fill their boxes.
 */
export function moveSlider(rows: SliderRow[], k: number, key: 'widthIx' | 'stepIx', value: number, linked: boolean): number[] {
  const moved: number[] = [];
  rows.forEach((row, i) => {
    if (i !== k && !linked) return;
    row[key] = value;
    // Moving the width slider ends a Science card's (or Simple's) own width.
    if (key === 'widthIx') {
      delete row.pm;
      delete row.simple;
    }
    moved.push(i);
  });
  return moved;
}
