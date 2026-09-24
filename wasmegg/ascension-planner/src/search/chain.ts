/**
 * Chain evaluator: walks a chain leg by leg and returns the total time from the plan start to the
 * end of the last leg.
 *
 * The one non-obvious thing here is the PREFIX MEMO, and it is the single biggest saving in the
 * whole search. Chains form a trie: every chain beginning `195, 219, 248` shares the A1, A2 and A3
 * simulations, and a coordinate-descent sweep varies ONE checkpoint while holding the rest fixed,
 * so a 17-value sweep of the third checkpoint re-uses the same two leading legs seventeen times. The
 * memo is keyed on the prefix (`'195,219,248'`), not the whole chain, which is what makes that
 * sharing happen. fastsearch.ts does exactly this and reports the saving as "prefix sharing saved N
 * leg sims"; the CLI's own sharding is deliberately cut on whole prefix subtrees for the same
 * reason, and so is this search's batch splitting (see search/batch.ts).
 *
 * A memo entry is one leg's `AscensionSummary` plus the `EngineState` the next leg starts from — a
 * few kilobytes each — so the map is capped and evicted oldest-first rather than left to grow for
 * the whole multi-hour run.
 *
 * An availability schedule does not break any of that: a leg's start time is a deterministic
 * function of its prefix with or without one, so the prefix is still the whole cache key.
 */
import { runLeg, LAST_DATEABLE_SECONDS, type LegResult } from './leg';
import { countUnavailable, isConstrained, nextAvailable } from './availability';
import { meetsAll, usableMilestones } from './milestones';
import type { EngineState } from '@/engine/types';
import type { ChainResult, SearchInputs } from './types';

/** Entries to hold before evicting the oldest. Roughly a few tens of MB at the high end; a full
 *  descent pass over a 6-checkpoint chain touches well under this, so evictions are rare in
 *  practice and only bite on very long runs. */
const MEMO_CAPACITY = 3000;

export interface ChainEvaluator {
  /** Simulate `chain` (last entry must be the final target). Null when some leg was unevaluable. */
  evaluate(chain: number[]): ChainResult | null;
  /** Distinct legs actually simulated so far — the honest cost counter, cache hits excluded. */
  readonly legSims: number;
}

/** One simulated ascension inside a chain step. A step is usually one; time off splits it in two. */
type Segment = LegResult & { timeOff?: 'stopped' | 'restarted' };

export function createChainEvaluator(inputs: SearchInputs): ChainEvaluator {
  // Insertion-ordered by construction (Map iterates in insertion order), which is all the eviction
  // below needs. `null` is a real memoised value: "this prefix is unevaluable", worth remembering.
  // A value is the step's SEGMENTS: one leg normally, more when time off cut it (see `priceStep`).
  const memo = new Map<string, Segment[] | null>();
  let legSims = 0;
  // Validated once, not per leg. A schedule that excludes nothing becomes null so the hot path is
  // a single null check — and so a run with no schedule is byte-for-byte the same computation it
  // was before availability existed.
  const schedule = isConstrained(inputs.availability) ? inputs.availability : null;
  // Filtered once, for the same reason: an empty list must cost nothing per chain.
  const milestones = usableMilestones(inputs.milestones, inputs.final);
  const deferShifts = !!inputs.deferShifts;
  // Sorted once; empty costs nothing per leg, like the schedule.
  const timeOff = [...(inputs.timeOff ?? [])].filter(w => w.to > w.from).sort((x, y) => x.from - y.from);

  function remember(key: string, segs: Segment[] | null): void {
    if (memo.size >= MEMO_CAPACITY) {
      // Drop the oldest quarter in one pass rather than one entry per insert — evicting singly
      // turns a full map into a churn machine where every new prefix costs a delete.
      let toDrop = Math.floor(MEMO_CAPACITY / 4);
      for (const k of memo.keys()) {
        if (toDrop-- <= 0) break;
        memo.delete(k);
      }
    }
    memo.set(key, segs);
  }

  /** One leg, or null. A leg that throws is a chain that cannot be evaluated, not a run that should
   *  die (the CLI counts them as `failed`); a leg that never ends is no result either -- kept, it
   *  priced as Infinity, and the finished run had no best chain, no Save, no Submit and a CSV
   *  download that threw on its date. `!(x < limit)` catches NaN too. */
  function safeLeg(
    state: EngineState,
    start: number,
    target: number,
    allowContinue: boolean,
    te: number,
    idx: number,
    endOverride?: number
  ): LegResult | null {
    legSims++;
    let leg: LegResult | null;
    try {
      leg = runLeg(inputs, state, start, target, allowContinue, te, idx, endOverride);
    } catch {
      leg = null;
    }
    return leg && leg.summary.endTime < LAST_DATEABLE_SECONDS ? leg : null;
  }

  /**
   * One chain step: from `start` to `target` TE, as one leg -- or, when time off begins before the
   * leg would end, as the leg cut short at the start of the time off (keeping the TE it reached)
   * followed by a complete rebuild from the end of it toward the same target. A leg that cannot
   * finish its build before the time off gains nothing, and the rebuild simply starts after it.
   *
   * Time off is the player leaving virtue entirely, so there is no "continue" after it: the farm
   * they left is gone. Deterministic in the prefix, so the memo is still keyed on the prefix alone.
   */
  function priceStep(state0: EngineState, start: number, target: number, first: boolean, te0: number, idx: number): Segment[] | null {
    const segs: Segment[] = [];
    let state = state0;
    let t = start;
    let te = te0;
    let restarted = false;
    for (let guard = 0; guard <= timeOff.length + 1; guard++) {
      const away = timeOff.find(w => w.from <= t && t < w.to);
      if (away) {
        t = schedule ? nextAvailable(away.to, schedule) : away.to;
        restarted = true;
      }
      const allowContinue = first && !restarted;
      const whole = safeLeg(state, t, target, allowContinue, te, idx);
      if (!whole) return null;
      const cutBy = timeOff.find(w => w.from > t && w.from < whole.summary.endTime);
      if (!cutBy) {
        segs.push(restarted ? { ...whole, timeOff: 'restarted' } : whole);
        return segs;
      }
      const cut = safeLeg(state, t, target, allowContinue, te, idx, cutBy.from);
      if (cut && cut.summary.endTE > te) {
        segs.push({ ...cut, timeOff: 'stopped' });
        state = cut.nextState;
        te = cut.summary.endTE;
        if (te >= target) return segs;
      }
      t = cutBy.from; // the next pass finds itself inside the time off and moves to its end
      restarted = true;
    }
    return null;
  }

  return {
    get legSims() {
      return legSims;
    },

    evaluate(chain: number[]): ChainResult | null {
      let state: EngineState | null = null;
      let time = inputs.planStart;
      let te = inputs.currentTE;
      const legs: ChainResult['legs'] = [];

      for (let i = 0; i < chain.length; i++) {
        const key = chain.slice(0, i + 1).join(',');
        let segs = memo.get(key);

        if (segs === undefined) {
          if (i === 0) {
            // The first leg starts from a blank farm on curiosity, not from the backup's farm —
            // the "continue current ascension" variant is the one that reads the live farm, and it
            // builds its own state in leg.ts. Same four overrides fastsearch.ts applies.
            const b = JSON.parse(JSON.stringify(inputs.baseState)) as EngineState;
            b.currentEgg = 'curiosity';
            b.population = 1;
            b.bankValue = 0;
            b.researchLevels = {};
            state = b;
          }
          segs = priceStep(state as EngineState, time, chain[i], i === 0, te, i);
          remember(key, segs);
        }

        if (!segs) return null;

        for (let s = 0; s < segs.length; s++) {
          const leg = segs[s];
          const stopped = leg.timeOff === 'stopped';
          // Availability. The leg ends when its target TE is reached, and the plan's very next
          // instruction is a prestige — so if that instant falls outside the player's schedule, the
          // next leg cannot start until they are back. Only INTER-leg handoffs are pushed: reaching
          // the final target is not an action, so being away for it costs nothing. See
          // search/availability.ts for what this does and does not model.
          // Shifts, when the player asked for them to be held too.
          //
          // A DELAY MODEL, NOT A RE-SIMULATION, and the distinction is worth being precise about.
          // Each shift is pushed to the next available instant, carrying the accumulated delay
          // forward, and the leg's end moves by the total — because everything after a held shift
          // happens that much later, including reaching the target TE. That is right to first order:
          // delaying a shift delays the next TE threshold by the same amount, since the threshold is
          // on the egg you have not switched to yet.
          //
          // It errs in ONE direction, the safe one. While you wait, the farm keeps laying the egg you
          // have not switched away from, so in real life you arrive at the next threshold slightly
          // ahead of this model. Uncredited, exactly as the prestige delay is. An exact answer would
          // need `auto/shifts/te-wait.ts` to schedule around availability itself, which would change
          // the manual planner too.
          let shiftDelay = 0;
          let shifts = leg.shifts;
          if (schedule && deferShifts && shifts.length) {
            shifts = shifts.map(sh => {
              const at = sh.at + shiftDelay;
              const moved = nextAvailable(at, schedule);
              shiftDelay += moved - at;
              return { at: moved, egg: sh.egg, fromEgg: sh.fromEgg };
            });
          }
          // A leg stopped by time off ends when the time off starts, whatever was held: the player
          // is leaving, and the rebuild after it was already timed from the end of the time off.
          if (stopped) shiftDelay = 0;

          const rawEnd = leg.summary.endTime + shiftDelay;
          const isFinalLeg = i === chain.length - 1 && s === segs.length - 1;
          const handoff = schedule && !isFinalLeg && !stopped ? nextAvailable(rawEnd, schedule) : rawEnd;

          legs.push({
            key: leg.key,
            endTE: leg.summary.endTE,
            durationSeconds: leg.summary.totalDurationSeconds + shiftDelay,
            maxELR: leg.summary.maxELR,
            endTime: rawEnd,
            tier13Unlocked: leg.summary.tier13Unlocked,
            startTime: leg.summary.startTime,
            buildPhaseEndTime: leg.summary.buildPhaseEndTime,
            buildPhaseSaleCount: leg.summary.buildPhaseSaleCount,
            // Counted on the ADJUSTED instants: with `deferShifts` on this is zero by
            // construction, which is the point — the cost has moved into the duration instead.
            nightShifts: countUnavailable(
              shifts.map(x => x.at),
              schedule
            ),
            shifts,
            sleepDelaySeconds: handoff - rawEnd,
            shiftDelaySeconds: shiftDelay,
            ...(leg.timeOff ? { timeOff: leg.timeOff } : {}),
          });

          state = leg.nextState;
          time = handoff;
          te = leg.summary.endTE;
        }
      }

      // A chain that misses a dated milestone is not a candidate. Returning null puts it down the
      // same path as a chain whose simulation failed, which the driver already handles as "not a
      // candidate" rather than as an error — which is why dated milestones need no driver change.
      if (milestones.length && !meetsAll(legs, milestones)) return null;

      return { chain: [...chain], seconds: time - inputs.planStart, legs };
    },
  };
}

/** Depth-first ordering over the trie, so sibling chains are adjacent and the memo actually hits.
 *  Sorting is what makes prefix sharing pay off; an unsorted batch thrashes the memo. */
export function sortChainsDepthFirst(chains: number[][]): number[][] {
  return [...chains].sort((a, b) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = (a[i] ?? -1) - (b[i] ?? -1);
      if (d) return d;
    }
    return 0;
  });
}
