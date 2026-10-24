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
 * few kilobytes each — so the map is capped and evicted least-recently-used first rather than left
 * to grow for the whole multi-hour run. The cap is the caller's to set (`MemoSettings`): a By a date
 * run sizes it to the sets each worker comes back to (deadlineEstimate.ts `deadlineMemoCapacity`),
 * and leaves out each route's own last leg, which nothing comes back to (`keepLast`).
 *
 * An availability schedule does not break any of that: a leg's start time is a deterministic
 * function of its prefix with or without one, so the prefix is still the whole cache key.
 */
import { runLeg, LAST_DATEABLE_SECONDS, farmLaying, saveSiloSeconds, type LegResult } from './leg';
import { countUnavailable, isConstrained, nextAvailable } from './availability';
import { creditedWaitSeconds, nextPrestigeAt, noPrestigeAt, usableNoPrestige } from './noPrestige';
import { EGG_ORDER } from './precomputedLeg';
import { meetsAll, usableMilestones } from './milestones';
import { computeTEEarned } from '@/auto/te-thresholds';
import { countTEThresholdsPassed } from '@/lib/truthEggs';
import { isResearchSaleActive } from '@/lib/events';
import { VIRTUE_EGGS } from '@/types';
import type { EngineState } from '@/engine/types';
import type { ChainResult, SearchInputs } from './types';
import { readFirstAscension } from './firstAscension';

/** Entries to hold before evicting the oldest, unless the caller sets its own (`MemoSettings`). A
 *  full descent pass over a 6-checkpoint chain touches well under this, so for Smart search and the
 *  Full sweep evictions are rare in practice and only bite on very long runs. */
export const DEFAULT_MEMO_CAPACITY = 3000;

/**
 * How the prefix memo is kept. Unset fields keep the defaults, which are what every search except
 * By a date has always had.
 */
export interface MemoSettings {
  /** Entries held before the least recently used are dropped. Default `DEFAULT_MEMO_CAPACITY`. */
  capacity?: number;
  /**
   * Keep the chain's own LAST step too (default true). A By a date run never prices the same route
   * twice and every route's last stop is its own, so that entry is never read again -- and on a big
   * run (~1,700 sets a worker) a round wrote as many of them as it read early legs, which pushed each
   * set's early legs out of the memo just before the next round came back for them: about 2.07 legs
   * a route instead of 1. Leaving them out keeps the memo for the legs that are shared.
   */
  keepLast?: boolean;
}

/**
 * When a fresh ascension starts after the one before ends (or after the player's hours let them
 * prestige):
 * - 'now': at once. Every search, By a date and the board's rechecks.
 * - 'hour': on the next whole hour, as the precomputed table was simulated, except inside the
 *   weekly research sale, where both are tried and the sooner end kept (the table's own rule,
 *   routeFinder.ts `startInSale`). The instant answer's exact check, so it prices the times it shows.
 * - 'sooner': both, at every handoff, keeping whichever ends that ascension sooner.
 * Continuing the ascension already in progress always starts at once (there is nothing to start).
 * The few minutes waited for the hour are not credited: the table does not credit them either.
 */
export type HandoffChoice = 'now' | 'hour' | 'sooner';

/** How `evaluate` prices a chain beyond its stops. */
export interface EvaluateChainOptions {
  handoff?: HandoffChoice;
  keepLast?: boolean;
  /**
   * A planned wait before each prestige, seconds (search/delays.ts, "Try waiting before each
   * prestige"): entry i is how long the player waits after reaching stop i before prestiging into
   * the next ascension. The farm keeps laying meanwhile, credited as for the player's hours below
   * (the same model as the simulator laying on: aaap-tools/partial-te-2026-10.md). The player's
   * hours then apply from the end of the wait. Absent, or all zero, prices exactly as before.
   */
  delays?: number[];
}

export interface ChainEvaluator {
  /** Simulate `chain` (last entry must be the final target). Null when some leg was unevaluable.
   *  `keepLast` overrides the memo setting of the same name for this chain. */
  evaluate(chain: number[], opts?: EvaluateChainOptions): ChainResult | null;
  /** Change how the memo is kept from now on. A smaller capacity drops the least recently used at
   *  once; nothing else is lost. */
  setMemo(settings: MemoSettings): void;
  /** Distinct legs actually simulated so far — the honest cost counter, cache hits excluded. */
  readonly legSims: number;
  /** Prefixes held in the memo right now (at most its capacity): the black box's stand-in for the
   *  worker's memory, which browsers do not report from a worker. */
  readonly memoSize: number;
  /** The memo's capacity now. */
  readonly memoCapacity: number;
}

/** One simulated ascension inside a chain step. A step is usually one; time off splits it in two. */
type Segment = LegResult & { timeOff?: 'stopped' | 'restarted'; afterTimeOff?: true };

/** A capacity as a whole number of at least 1; anything unusable is the default. */
function usableCapacity(n: number | undefined): number {
  return n !== undefined && Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_MEMO_CAPACITY;
}

export function createChainEvaluator(inputs: SearchInputs, memoSettings: MemoSettings = {}): ChainEvaluator {
  // Insertion-ordered by construction (Map iterates in insertion order), which is all the eviction
  // below needs. `null` is a real memoised value: "this prefix is unevaluable", worth remembering.
  // A value is the step's SEGMENTS: one leg normally, more when time off cut it (see `priceStep`).
  const memo = new Map<string, Segment[] | null>();
  let capacity = usableCapacity(memoSettings.capacity);
  let keepLastDefault = memoSettings.keepLast !== false;
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
  // No prestige on these days (search/noPrestige.ts): empty costs nothing, and without them every prestige instant
  // below is the hours' own (`nextAvailable`), exactly as before.
  const noPrestige = usableNoPrestige(inputs.noPrestige);
  // What the save's silos hold: the cap on the farm's laying while a no-prestige day holds a prestige.
  const silo = noPrestige.length ? saveSiloSeconds(inputs) : Infinity;
  /** The first moment at or after `t` a prestige may happen: inside the hours, not on a no-prestige day. */
  const allowed = (t: number): number =>
    noPrestige.length ? nextPrestigeAt(t, schedule, noPrestige) : schedule ? nextAvailable(t, schedule) : t;
  // The first leg with continue pinned off-and-on: continuing the ascension in progress needs no prestige, so on a
  // no-prestige day leg 1 compares that with a fresh start held to the next allowed time (`priceStep`).
  const continueOnly: SearchInputs | null =
    noPrestige.length && readFirstAscension(inputs) !== 'fresh' ? { ...inputs, firstAscension: 'buildup' } : null;

  /** Drop the least recently used until at most `keep` are left. */
  function shrinkTo(keep: number): void {
    let toDrop = memo.size - keep;
    for (const k of memo.keys()) {
      if (toDrop-- <= 0) break;
      memo.delete(k);
    }
  }

  function remember(key: string, segs: Segment[] | null): void {
    // Drop the oldest quarter in one pass rather than one entry per insert — evicting singly
    // turns a full map into a churn machine where every new prefix costs a delete.
    if (memo.size >= capacity) shrinkTo(capacity - Math.max(1, Math.floor(capacity / 4)));
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
    endOverride?: number,
    legInputs: SearchInputs = inputs
  ): LegResult | null {
    legSims++;
    let leg: LegResult | null;
    try {
      leg = runLeg(legInputs, state, start, target, allowContinue, te, idx, endOverride);
    } catch {
      leg = null;
    }
    return leg && leg.summary.endTime < LAST_DATEABLE_SECONDS ? leg : null;
  }

  /**
   * The save's farm laying while a fresh first ascension waits out a no-prestige day (`priceStep`): its own rate on
   * the egg it is on (leg.ts `farmLaying`), for at most what its silos hold. The state unchanged without a farm.
   */
  function layWhileHeld(state: EngineState, te: number, from: number, to: number): { state: EngineState; te: number } {
    const lay = to > from ? farmLaying(inputs, from) : null;
    if (!lay || !(lay.rate > 0)) return { state, te };
    const egg = EGG_ORDER[lay.egg] as keyof EngineState['eggsDelivered'];
    const before = state.eggsDelivered[egg] || 0;
    const after = before + lay.rate * Math.min(to - from, lay.capSeconds);
    const eggsDelivered = { ...state.eggsDelivered, [egg]: after };
    const teEarned = { ...state.teEarned, [egg]: Math.max(state.teEarned[egg] || 0, countTEThresholdsPassed(after)) };
    const total = Object.values(teEarned).reduce((n, x) => n + (x || 0), 0);
    return { state: { ...state, eggsDelivered, teEarned, te: total }, te: Math.max(te, total) };
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
  function priceStep(
    state0: EngineState,
    start: number,
    target: number,
    first: boolean,
    te0: number,
    idx: number,
    legInputs: SearchInputs = inputs,
    /** Priced as asked, without the no-prestige hold at the start (the hold's own calls). */
    asAsked = false
  ): Segment[] | null {
    // NO PRESTIGE AT THE START (search/noPrestige.ts). A plan starting on a no-prestige day may still continue the
    // ascension in progress (no prestige in that), but a fresh first ascension is a prestige: it waits for the next
    // allowed time, the save's farm laying meanwhile (up to its silos), and the sooner of the two is leg 1.
    if (first && !asAsked && noPrestige.length && noPrestigeAt(start, noPrestige)) {
      const asked = priceStep(state0, start, target, true, te0, idx, inputs, true);
      if (!asked || asked[0].key === 'continue' || asked[0].key === 'buildup') return asked;
      const cont = continueOnly ? priceStep(state0, start, target, true, te0, idx, continueOnly, true) : null;
      const contOk = cont && (cont[0].key === 'continue' || cont[0].key === 'buildup') ? cont : null;
      const at = allowed(start);
      const laid = layWhileHeld(state0, te0, start, at);
      const held = at > start ? priceStep(laid.state, at, target, false, laid.te, idx, inputs, true) : null;
      const end = (x: Segment[] | null) => (x ? x[x.length - 1].summary.endTime : Infinity);
      const pick = end(contOk) <= end(held) ? contOk : held;
      if (!pick) return null;
      // Leg 1's record of the other kinds stays the one the plan start priced (`rival`, `firstLegEnds`).
      const r = asked[0];
      return [
        { ...pick[0], ...(r.rival && !pick[0].rival ? { rival: r.rival } : {}), ...(r.firstLegEnds ? { firstLegEnds: r.firstLegEnds } : {}) },
        ...pick.slice(1),
      ];
    }
    const segs: Segment[] = [];
    let state = state0;
    let t = start;
    let te = te0;
    let restarted = false;
    for (let guard = 0; guard <= timeOff.length + 1; guard++) {
      // Back on virtue: the rebuild starts with a prestige, so inside the hours and not on a no-prestige day. Past
      // every stretch that time falls in: overlapping or back-to-back stretches (as given, not merged) are one.
      for (let away = timeOff.find(w => w.from <= t && t < w.to); away; away = timeOff.find(w => w.from <= t && t < w.to)) {
        t = allowed(away.to);
        restarted = true;
      }
      const allowContinue = first && !restarted;
      const whole = safeLeg(state, t, target, allowContinue, te, idx, undefined, legInputs);
      if (!whole) return null;
      const cutBy = timeOff.find(w => w.from > t && w.from < whole.summary.endTime);
      if (!cutBy) {
        segs.push(restarted ? { ...whole, timeOff: 'restarted' } : whole);
        return segs;
      }
      const cut = safeLeg(state, t, target, allowContinue, te, idx, cutBy.from, legInputs);
      if (cut && cut.summary.endTE > te) {
        // Between two stretches of time off a leg is both: started after one, cut by the next.
        segs.push({ ...cut, timeOff: 'stopped', ...(restarted ? { afterTimeOff: true as const } : {}) });
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
    get memoSize() {
      return memo.size;
    },
    get memoCapacity() {
      return capacity;
    },

    setMemo(settings: MemoSettings): void {
      if (settings.capacity !== undefined) {
        capacity = usableCapacity(settings.capacity);
        if (memo.size > capacity) shrinkTo(capacity);
      }
      if (settings.keepLast !== undefined) keepLastDefault = settings.keepLast;
    },

    evaluate(chain: number[], opts?: EvaluateChainOptions): ChainResult | null {
      let state: EngineState | null = null;
      let time = inputs.planStart;
      let te = inputs.currentTE;
      const legs: ChainResult['legs'] = [];
      const handoff = opts?.handoff ?? 'now';
      const keepLast = opts?.keepLast ?? keepLastDefault;
      // Planned waits before each prestige (whole seconds, never negative); none on the last stop.
      const delays = (opts?.delays ?? []).map(d => (Number.isFinite(d) && d > 0 ? Math.round(d) : 0));
      const delayAt = (i: number) => (i < chain.length - 1 ? delays[i] ?? 0 : 0);
      // The waits before step i's start are part of what it is priced from, so of its memo key.
      const waitsKey = (i: number) => {
        const before = delays.slice(0, i);
        return before.some(d => d > 0) ? `|d${before.join(',')}` : '';
      };
      // The next whole hour, still inside the player's hours (and not on a no-prestige day).
      const onTheHour = (t: number) => allowed(Math.ceil(t / 3600) * 3600);
      // Of two ways to price this step, the one whose last segment ends sooner (null loses).
      const sooner = (a: Segment[] | null, b: Segment[] | null) => {
        if (!a) return b;
        if (!b) return a;
        return b[b.length - 1].summary.endTime < a[a.length - 1].summary.endTime ? b : a;
      };

      for (let i = 0; i < chain.length; i++) {
        // 'now' keeps the plain prefix as its key, so it shares the memo exactly as before.
        const key = (handoff === 'now' ? '' : `${handoff}|`) + chain.slice(0, i + 1).join(',') + waitsKey(i);
        let segs = memo.get(key);
        // Least recently USED goes first, not least recently added: a By a date run comes back to a
        // set's early legs round after round while every route's own last leg is used once, and with
        // eviction by age alone those early legs were the first thrown out (and simulated again).
        // Moving a hit to the back keeps them. The answer is the same either way: the memo only
        // caches a deterministic simulation.
        if (segs !== undefined) {
          memo.delete(key);
          memo.set(key, segs);
        }

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
          if (handoff === 'now') {
            segs = priceStep(state as EngineState, time, chain[i], i === 0, te, i);
          } else {
            const hour = onTheHour(time);
            // The first step may continue the ascension in progress, which starts at once; only a
            // fresh start moves to the hour.
            const atOnce = priceStep(state as EngineState, time, chain[i], i === 0, te, i);
            // Continuing the ascension in progress (as it is, or building on) needs no prestige.
            const continues = i === 0 && (atOnce?.[0]?.key === 'continue' || atOnce?.[0]?.key === 'buildup');
            if (continues || hour === time) segs = atOnce;
            else {
              const atHour = priceStep(state as EngineState, hour, chain[i], false, te, i);
              const both = handoff === 'sooner' || isResearchSaleActive(time);
              segs = both ? sooner(atHour, atOnce) : atHour;
              // The fresh start on the hour never simulates continue; the start at once did, and
              // continue lost there, so its time is still the rival leg 1 is recorded against.
              const rival = atOnce?.[0]?.rival;
              if (i === 0 && segs && segs !== atOnce && rival && !segs[0].rival)
                segs = [{ ...segs[0], rival }, ...segs.slice(1)];
              // Likewise every kind's end, the fresh one now the start on the hour.
              const ends = atOnce?.[0]?.firstLegEnds;
              if (i === 0 && segs && segs !== atOnce && ends && !segs[0].firstLegEnds)
                segs = [{ ...segs[0], firstLegEnds: { ...ends, fresh: segs[0].summary.endTime } }, ...segs.slice(1)];
            }
          }
          // The last step is still READ from the memo above (another route's early stops may be this
          // whole route), only not written when the caller says nothing comes back to it.
          if (keepLast || i < chain.length - 1) remember(key, segs);
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
          // Shifts, when the player asked for them to be held too: inside the simulation (auto/hold.ts),
          // which waits for the player before each egg shift and credits the eggs the farm lays
          // meanwhile, because they are still on the farm. The leg comes back with its real shift
          // instants and its real end, so nothing is pushed here; `heldSeconds` says how long it
          // waited. (Before 5 Oct this was a delay model added afterwards, which pushed everything
          // after a held shift by the wait and credited nothing.)
          //
          // A run saved with hours but without held shifts still counts its shifts in the night
          // (`nightShifts`) and holds nothing.
          const holdsInside = !!(schedule && deferShifts);
          let shiftDelay = holdsInside ? leg.heldSeconds : 0;
          const shifts = leg.shifts;
          // A leg stopped by time off ends when the time off starts, whatever was held: the player
          // is leaving, and the rebuild after it was already timed from the end of the time off.
          if (stopped) shiftDelay = 0;

          const rawEnd = leg.summary.endTime;
          const isFinalLeg = i === chain.length - 1 && s === segs.length - 1;
          // A planned wait (opts.delays) only after the step's last segment, and never after time off.
          const wait = s === segs.length - 1 && !stopped && !isFinalLeg ? delayAt(i) : 0;
          // Where the hours alone would let the player prestige, and where they may (a no-prestige day can hold it
          // further: search/noPrestige.ts). Without no-prestige days the two are the same instant.
          const hoursEnd =
            schedule && !isFinalLeg && !stopped ? nextAvailable(rawEnd + wait, schedule) : rawEnd + wait;
          const handoff = !isFinalLeg && !stopped ? allowed(rawEnd + wait) : rawEnd + wait;

          legs.push({
            key: leg.key,
            endTE: leg.summary.endTE,
            // The simulation's own duration, which already runs through every hold (auto/hold.ts
            // moves the leg's clock on by each wait). Adding `shiftDelay` here again, as this did
            // from 5 Oct to 9 Oct, counted every held hour twice in the leg's days while its end and
            // the next leg's start were right: leg_days no longer matched end minus start.
            durationSeconds: leg.summary.totalDurationSeconds,
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
            sleepDelaySeconds: handoff - rawEnd - wait,
            ...(wait > 0 ? { plannedWaitSeconds: wait } : {}),
            ...(handoff > hoursEnd ? { noPrestigeWaitSeconds: handoff - hoursEnd } : {}),
            shiftDelaySeconds: shiftDelay,
            ...(leg.timeOff ? { timeOff: leg.timeOff } : {}),
            ...(leg.afterTimeOff ? { afterTimeOff: true as const } : {}),
            ...(leg.rival ? { firstLegRival: { ...leg.rival } } : {}),
            ...(leg.firstLegEnds ? { firstLegEnds: { ...leg.firstLegEnds } } : {}),
            // The route's end state, for By a date's TE per egg and next TE (search/endEggs.ts).
            ...(isFinalLeg ? { endEggs: endEggsOf(leg) } : {}),
            // The egg it ends on and its TE then, every leg (search/routeTimeline.ts).
            ...(leg.endEgg ? { endEgg: { ...leg.endEgg } } : {}),
          });

          state = leg.nextState;
          te = leg.summary.endTE;
          // Waiting to prestige until the player is back: they are still on the farm, so it keeps
          // laying the egg the leg ended on, at the leg's peak rate, and those eggs and any TE they
          // pass carry into the next ascension. Not after time off (they left the farm) and not
          // after the final leg (nothing follows it). A wait a no-prestige day made longer lays only
          // until the silos are full (`creditedWaitSeconds`): the player may be away all day.
          if (handoff > rawEnd && !stopped && !isFinalLeg) {
            const egg = leg.lastEgg as keyof EngineState['eggsDelivered'];
            const before = state.eggsDelivered[egg] || 0;
            const laid = computeTEEarned(before, leg.summary.maxELR, creditedWaitSeconds(rawEnd, hoursEnd, handoff, silo));
            if (laid.finalEggsDelivered > before) {
              const eggsDelivered = { ...state.eggsDelivered, [egg]: laid.finalEggsDelivered };
              const teEarned = { ...state.teEarned, [egg]: countTEThresholdsPassed(laid.finalEggsDelivered) };
              const total = Object.values(teEarned).reduce((n, x) => n + (x || 0), 0);
              state = { ...state, eggsDelivered, teEarned, te: total };
              te = total;
            }
          }
          time = handoff;
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

/** Each virtue egg's lifetime eggs delivered and TE when a leg ends (VIRTUE_EGGS order), and the egg
 *  the farm is on: `LegSummary.endEggs`, carried on a route's last leg. */
function endEggsOf(leg: LegResult): { delivered: number[]; te: number[]; egg: string } {
  const s = leg.summary;
  return {
    delivered: VIRTUE_EGGS.map(e => s.eggsDelivered?.[e] ?? 0),
    te: VIRTUE_EGGS.map(e => s.finalTE?.[e] ?? 0),
    egg: leg.lastEgg,
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
