/**
 * Two short extras under an answer (RouteExtras.vue; the user, 12 Oct 2026):
 *
 *  - THE FIRST ASCENSION'S SHIFTS: when the farm switches egg during the first ascension, from the
 *    simulation of the route's first leg (`LegSummary.shifts`, which every priced leg carries). Nothing
 *    extra is simulated.
 *  - ONE MORE TE: what one TE above the last stop would cost. A run that measured it says so
 *    (By a date's `lastTECost`, from the last stops it bracketed); otherwise the last leg's end state
 *    (search/endEggs.ts) gives when the next TE would arrive if the farm keeps laying at the final rate.
 *    Not at 490, the top.
 */
import type { LegSummary } from './types';
import { endEggsOf } from './endEggs';

export interface FirstShift {
  at: number;
  egg: string;
}

/** The first leg's shifts in order (each with the egg it switches TO); [] when not recorded. */
export function firstLegShifts(legs: readonly LegSummary[] | null | undefined): FirstShift[] {
  const s = legs?.[0]?.shifts;
  if (!Array.isArray(s)) return [];
  return s.filter(x => x && Number.isFinite(x.at) && x.at > 0 && typeof x.egg === 'string').map(x => ({ at: x.at, egg: x.egg }));
}

export interface OneMoreTE {
  te: number;
  /** Seconds after the last stop. */
  seconds: number;
  /** Unix second the route would reach one TE more. */
  at: number;
  /** 'run': measured by the run's own pricing; 'rate': the last leg's final laying rate. */
  how: 'run' | 'rate';
}

export function oneMoreTE(o: {
  chain: readonly number[];
  legs?: readonly LegSummary[] | null;
  /** Unix second the last stop is reached. */
  reachAt: number;
  /** A run's measured cost of one more TE, seconds (By a date `lastTECost`). */
  runCost?: number | null;
  /** Only a run's measured cost (By a date's card already says when the next TE comes at the final rate). */
  noRate?: boolean;
}): OneMoreTE | null {
  const last = o.chain[o.chain.length - 1];
  if (!(last > 0) || last >= 490 || !Number.isFinite(o.reachAt) || o.reachAt <= 0) return null;
  if (o.runCost && o.runCost > 0) return { te: last + 1, seconds: o.runCost, at: o.reachAt + o.runCost, how: 'run' };
  if (o.noRate) return null;
  const eggs = endEggsOf({ chain: [...o.chain], legs: o.legs ? [...o.legs] : [] });
  if (!eggs?.next) return null;
  const end = o.legs?.[o.legs.length - 1]?.endTime ?? o.reachAt;
  return { te: last + 1, seconds: eggs.next.at - end, at: eggs.next.at, how: 'rate' };
}
