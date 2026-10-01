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
