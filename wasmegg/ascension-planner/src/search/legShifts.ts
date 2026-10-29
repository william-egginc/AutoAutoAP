/**
 * EACH ASCENSION'S SHIFTS FROM THE INSTANT ANSWER (26 Oct 2026, Jordan: My runs' Right now said "the instant answer
 * only keeps when each ascension ends" and All planned shifts said "Can't tell"). A version 2 table build already
 * gives every shift AFTER the build-up: H1's and K3's are stored (tableV2.ts `BuildExtras`), and each later one (C4,
 * I2, R2, H2) comes out of the tail's replay, held for the player's hours (tableV2.ts `replayTail`). The finder prices
 * a leg with the same replay (routeFinder.ts `sweepOne`, `sweepReplay` with `only`: the same numbers to the bit), so
 * the shifts here belong to the leg it priced. What is missing are the opening's shifts (from the fresh start to C3):
 * the table does not store them until its next rebuild.
 *
 * Pure: the table's arithmetic only, no simulator.
 */
import { EGG_ORDER } from './precomputedLeg';
import { replayTail, type BuildWithExtras } from './tableV2';

/** One shift: when (unix seconds) and the egg the farm switches TO. */
export interface LegShift {
  at: number;
  egg: string;
}

export interface LegShiftsOptions {
  /** Unix seconds the ascension starts. */
  start: number;
  /** Seconds into the table's hour it really starts (priceLeg's `lateBy`). */
  lateBy?: number;
  /** When the player is next around (the held shifts); absent: not held. */
  holdUntil?: (t: number) => number;
  /** The tail's order, as the finder priced it: 'simulator' unless the options say 'table'. */
  order?: 'table' | 'simulator';
}

/**
 * The shifts of one priced leg (its build moved onto the counts, as priceLeg priced it) to `target` TE, and the
 * seconds the replay says the leg takes (to check it is the same leg). Null when the build has no version 2 numbers
 * or cannot reach `target`.
 */
export function legShifts(
  build: BuildWithExtras,
  target: number,
  o: LegShiftsOptions
): { seconds: number; shifts: LegShift[] } | null {
  if (!build.extras) return null;
  const r = replayTail(build, build.extras, target, {
    start: o.start,
    lateBy: o.lateBy ?? 0,
    ...(o.holdUntil ? { holdUntil: o.holdUntil } : {}),
    order: o.order === 'table' ? 'table' : 'simulator',
  });
  if (!r) return null;
  return {
    seconds: r.seconds,
    shifts: r.shifts.map(s => ({ at: o.start + s.at, egg: EGG_ORDER[s.egg] })),
  };
}
