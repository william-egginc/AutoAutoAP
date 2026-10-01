/**
 * The fastest route to the target from a precomputed table (search/precomputedLeg.ts): every route,
 * every checkpoint at every TE, any number of ascensions, in a fraction of the time one simulated
 * route takes.
 *
 * HOW. A route is a run of ascensions, and what an ascension does depends on the TE it starts at,
 * when it starts (the table's two keys) and where each egg's count stands; so the state between
 * ascensions is (TE, time, counts). An ascension that starts later never ends sooner -- its build
 * waits for the same weekly sale or a later one, and the rest is waiting at a fixed rate -- and more
 * eggs never make it slower, so an arrival that is earlier with at least the counts of another
 * beats it outright. The search is one pass upward through the TEs, keeping at each TE, per number
 * of ascensions so far, the arrivals nothing beats: the fastest route of every length comes out of
 * the same pass.
 *
 * ON THE HOUR. Each fresh ascension starts at the next whole hour (a player can always ascend a few
 * minutes later), where the table was simulated, so its time is the simulator's exactly rather than
 * an estimate. Shifting a start within the hour instead (`lateBy`) is right to a few hundredths of a
 * percent most of the time, but near a sale an hour's difference can mean catching it or waiting a
 * week (scripts/precompute.ts --grid-error), so the route keeps to what was simulated. A later start
 * never ends sooner, so the simulator's own immediate start can only match or beat these times.
 *
 * EGGS CARRIED FORWARD. Where each egg's count stands matters (about one TE's wait an ascension), so
 * each arrival keeps the counts its route really reached, and the next build is moved onto them
 * (`rebase`, exact): the times of a route found here are the simulator's. The first ascension is the
 * player's own (finishing the one in progress, from the real save), so callers can supply it.
 */
import {
  canonicalDelivered,
  pacificHourOfWeek,
  rebase,
  sweepTails,
  type BuildParams,
  type TailSweep,
} from './precomputedLeg';

/** The table as the finder reads it: the builds for a start TE at a Pacific hour of the week. */
export type BuildLookup = (te: number, hour: number) => BuildParams[] | null;

export interface RouteLeg {
  /** TE the ascension starts at, and the checkpoint it ascends at. */
  from: number;
  to: number;
  /** TE it actually ends at (above `to` when the build's sale wait overshoots). */
  endTE: number;
  /** Unix seconds. */
  start: number;
  end: number;
  sales: number;
  tier13: boolean;
  /** How it is played: 'continue', '2-sale', '1-sale-tier13'. */
  label: string;
}

export interface Route {
  /** Checkpoints, ending at the target. */
  chain: number[];
  legs: RouteLeg[];
  /** Unix seconds the target is reached. */
  end: number;
  seconds: number;
}

/** A first ascension worked out elsewhere (the player's own, from their save): where it ends and when. */
export interface FirstLeg {
  to: number;
  endTE: number;
  end: number;
  /** Eggs delivered per egg when it ends (EGG_ORDER). */
  delivered: number[];
  /** Shown in place of the sale count, e.g. 'continue'. */
  label?: string;
}

export interface FindOptions {
  table: BuildLookup;
  /** The TE the plan starts from and the unix second it starts. */
  startTE: number;
  start: number;
  final: number;
  /** Most ascensions to consider. */
  maxAscensions?: number;
  /** Instead of a fresh build at `startTE`, these first ascensions (one per checkpoint). */
  firstLegs?: FirstLeg[];
  /** Eggs delivered per egg at the start (EGG_ORDER); the table's canonical share of `startTE` if
   *  left out. Each route carries its own counts forward from here. */
  startDelivered?: number[];
  /** Scale the peak delivery rate (a player's delivery score against the table's). */
  deliveryScale?: number;
  /** Map a start TE to the table row whose earning power matches (a player's Clothed TE bonus
   *  against the table's): the build is read from that row. */
  rowFor?: (te: number) => number;
  /** Arrivals kept per TE and number of ascensions (`DEFAULT_KEEP`). */
  keep?: number;
  /** Also find the highest TE reachable by this unix second (Highest TE by a date), from the same
   *  pass: the highest TE whose earliest arrival is no later. */
  deadline?: number;
  /** Told after each number of ascensions is done (k of `maxAscensions`), for a progress bar. */
  onProgress?: (done: number, of: number) => void;
  /** Filled in with what the search did, for tuning (scripts/precompute.ts --route-bin). */
  stats?: { expanded: number; sweeps: number; cached: number };
  /** False: start the moment the last one ends and shift the sale by the minutes past the hour
   *  (`lateBy`), the approximation, kept for comparing. Default: on the next whole hour. */
  onTheHour?: boolean;
}

/** The next whole hour at or after `t` (unix seconds). Pacific hours begin on UTC hour boundaries. */
export function nextHour(t: number): number {
  return Math.ceil(t / 3600) * 3600;
}

interface Label {
  time: number;
  /** Eggs delivered per egg on arrival: each ascension's build is moved onto these (`rebase`). */
  delivered: number[];
  /** The arrival this one came from, for reading the route back. */
  prev: Label | null;
  leg: RouteLeg | null;
}

function scaled(builds: BuildParams[], scale: number): BuildParams[] {
  return scale === 1 ? builds : builds.map(b => ({ ...b, peakELR: b.peakELR * scale }));
}

/** The build that reaches `target` soonest, as `bestTailTo` picks (least time, the first of equals). */
function fastest(
  sweeps: TailSweep[],
  builds: BuildParams[],
  target: number
): { sweep: TailSweep; build: BuildParams; i: number } | null {
  let best: { sweep: TailSweep; build: BuildParams; i: number } | null = null;
  for (let j = 0; j < sweeps.length; j++) {
    const sw = sweeps[j];
    const i = target - sw.from;
    if (i < 0 || i >= sw.seconds.length) continue;
    const sec = sw.seconds[i];
    if (Number.isNaN(sec)) continue;
    if (!best || sec < best.sweep.seconds[best.i]) best = { sweep: sw, build: builds[j], i };
  }
  return best;
}

/**
 * Differences too small to matter between two arrivals: a minute, and the eggs of a few tens of
 * seconds at peak delivery. Every wait ends a millisecond past its threshold (`timeToEarnTE`'s
 * buffer), so routes that meet at a TE differ by a few billion eggs; without a little slack each of
 * those near-copies "beats" another on one egg, nothing is ever discarded, and the search does many
 * times the work for answers that differ by seconds. The routes reported keep their own exact times.
 */
const TIME_SLACK = 60;
const EGG_SLACK = 1e14;

/** No later, and at least as many eggs on every egg (within the slack): then `a` can do anything `b`
 *  can, as soon or sooner (an ascension started later never ends sooner, and more eggs never make a
 *  wait longer). */
function dominates(a: Label, b: Label): boolean {
  if (a.time > b.time + TIME_SLACK) return false;
  for (let i = 0; i < a.delivered.length; i++) if (a.delivered[i] < b.delivered[i] - EGG_SLACK) return false;
  return true;
}

/** Arrivals kept per (TE, ascensions) by default. */
export const DEFAULT_KEEP = 6;

/**
 * The fastest route to `final` with each number of ascensions (index = ascensions; empty where none
 * reaches it), plus the fastest overall.
 *
 * At each TE and number of ascensions it keeps every arrival no other one beats on both time and egg
 * counts (`dominates`), the earliest `keep` of them: losing a beaten arrival loses nothing, so with
 * room for them all the result is the best route under the table's model. Each ascension takes the
 * fastest sale strategy for its own checkpoint, as the simulator does.
 */
export function findRoutes(o: FindOptions): {
  best: Route | null;
  byAscensions: (Route | null)[];
  /** With `deadline`: the route to the highest TE reached by then, or null when none is. */
  byDate: Route | null;
} {
  const K = o.maxAscensions ?? 10;
  const scale = o.deliveryScale ?? 1;
  const keep = o.keep ?? DEFAULT_KEEP;
  const top = o.final;
  const onTheHour = o.onTheHour ?? true;
  // arrivals[k].get(te): the arrivals at TE `te` after k ascensions, earliest first.
  const arrivals: Map<number, Label[]>[] = Array.from({ length: K + 1 }, () => new Map());
  arrivals[0].set(o.startTE, [
    { time: o.start, delivered: o.startDelivered ?? canonicalDelivered(o.startTE), prev: null, leg: null },
  ]);

  const relax = (k: number, te: number, label: Label) => {
    const list = arrivals[k].get(te);
    if (!list) {
      arrivals[k].set(te, [label]);
      return;
    }
    if (list.some(l => dominates(l, label))) return;
    const kept = list.filter(l => !dominates(label, l));
    let at = kept.findIndex(l => l.time > label.time);
    if (at < 0) at = kept.length;
    kept.splice(at, 0, label);
    if (kept.length > keep) kept.length = keep;
    arrivals[k].set(te, kept);
  };

  /** Would an arrival at (k, te) with this time and these counts be beaten by one already kept?
   *  Asked before anything is made for it: most candidates are. */
  const beaten = (k: number, te: number, time: number, eggs: Float64Array, at: number): boolean => {
    const list = arrivals[k].get(te);
    if (!list) return false;
    for (const l of list) {
      if (l.time > time + TIME_SLACK) continue;
      let all = true;
      for (let e = 0; e < 5; e++) {
        if (l.delivered[e] < eggs[at + e] - EGG_SLACK) {
          all = false;
          break;
        }
      }
      if (all) return true;
    }
    return false;
  };

  // A build moved onto the same counts at the same hour prices the same; arrivals at one TE often
  // share counts (several routes ending on thresholds), so each such sweep is worked out once.
  const sweepCache = new Map<string, TailSweep>();
  const sweepOf = (b: BuildParams, key: string, lateBy: number, lowest: number): TailSweep => {
    let sw = sweepCache.get(key);
    if (!sw) {
      sw = sweepTails(b, top, lateBy, lowest);
      sweepCache.set(key, sw);
      if (o.stats) o.stats.sweeps++;
    } else if (o.stats) o.stats.cached++;
    return sw;
  };

  for (let k = 0; k < K; k++) {
    o.onProgress?.(k, K);
    // Upward through the TEs: every arrival at k ascensions spreads to k + 1.
    const tes = [...arrivals[k].keys()].filter(te => te < top).sort((a, b) => a - b);
    for (const te of tes) {
      for (const label of arrivals[k].get(te)!) {
        if (k === 0 && o.firstLegs) {
          for (const f of o.firstLegs) {
            relax(1, Math.min(f.endTE, top), {
              time: f.end,
              delivered: f.delivered,
              prev: label,
              leg: {
                from: te,
                to: f.to,
                endTE: f.endTE,
                start: label.time,
                end: f.end,
                sales: 0,
                tier13: false,
                label: f.label ?? 'first',
              },
            });
          }
          continue;
        }
        const startAt = onTheHour ? nextHour(label.time) : label.time;
        const hour = pacificHourOfWeek(startAt);
        // Seconds into the hour (0 on the hour): the table was built at the hour's first second.
        const lateBy = ((startAt % 3600) + 3600) % 3600;
        const row = o.rowFor ? o.rowFor(te) : te;
        const raw = o.table(row, hour);
        if (!raw?.length) continue;
        // The table's builds, moved onto the eggs this route really arrived with, each priced to
        // every checkpoint at once (sweepTails, the same numbers as tailTo).
        if (o.stats) o.stats.expanded++;
        const builds = scaled(raw, scale).map(b => rebase(b, row, label.delivered));
        const countsKey = `${row}|${startAt}|${label.delivered.join(',')}|`;
        const sweeps = builds.map((b, j) => sweepOf(b, countsKey + j, lateBy, te + 1));
        for (let target = te + 1; target <= top; target++) {
          const pick = fastest(sweeps, builds, target);
          if (!pick) continue;
          const { sweep, build, i } = pick;
          const end = startAt + sweep.seconds[i];
          const endTE = sweep.endTE[i];
          const at = Math.min(endTE, top);
          if (beaten(k + 1, at, end, sweep.delivered, i * 5)) continue;
          relax(k + 1, at, {
            time: end,
            delivered: Array.from(sweep.delivered.subarray(i * 5, i * 5 + 5)),
            prev: label,
            leg: {
              from: te,
              to: target,
              endTE,
              start: startAt,
              end,
              sales: build.sales,
              tier13: build.tier13,
              label: `${build.sales}-sale${build.tier13 ? '-tier13' : ''}`,
            },
          });
        }
      }
    }
  }

  const routeTo = (last: Label): Route => {
    const legs: RouteLeg[] = [];
    for (let l: Label | null = last; l?.leg; l = l.prev) legs.unshift(l.leg);
    return { chain: legs.map(l => l.to), legs, end: last.time, seconds: last.time - o.start };
  };
  const readBack = (k: number): Route | null => {
    const last = arrivals[k].get(top)?.[0];
    return last ? routeTo(last) : null;
  };

  const byAscensions = Array.from({ length: K + 1 }, (_, k) => (k ? readBack(k) : null));
  const best = byAscensions.reduce<Route | null>((a, r) => (r && (!a || r.end < a.end) ? r : a), null);

  // Highest TE by the date: the highest TE any route reaches in time, and of those the earliest.
  let byDate: Route | null = null;
  if (o.deadline !== undefined) {
    let bestTE = -1;
    let bestLabel: Label | null = null;
    for (let k = 1; k <= K; k++) {
      for (const [te, list] of arrivals[k]) {
        const l = list[0];
        if (l.time > o.deadline) continue;
        if (te > bestTE || (te === bestTE && bestLabel && l.time < bestLabel.time)) {
          bestTE = te;
          bestLabel = l;
        }
      }
    }
    byDate = bestLabel ? routeTo(bestLabel) : null;
  }
  return { best, byAscensions, byDate };
}

export interface FirstLegOptions {
  table: BuildLookup;
  startTE: number;
  start: number;
  final: number;
  /** As FindOptions: the row with the player's earning power, and their delivery against the table's. */
  rowFor?: (te: number) => number;
  deliveryScale?: number;
  /** The player's eggs delivered on each egg at the plan start (EGG_ORDER): a fresh first build starts
   *  from these, not the table's canonical share. */
  delivered: number[];
  /** Continue current ascension through the tail (search/leg.ts `continueTailParams`), or null. */
  cont: BuildParams | null;
  forceContinue: boolean;
  /** The continue rule's two lines (search/rules.ts): taken outright under the first, never past the second. */
  pinSeconds: number;
  maxContinueSeconds: number;
}

/**
 * The first ascension to every checkpoint, as the search's own first leg would be (search/leg.ts
 * `runLeg` with continue allowed): continue current ascension when the rule takes it, otherwise the
 * fastest fresh build from the table, moved onto the player's real egg counts.
 */
export function firstLegOptions(o: FirstLegOptions): FirstLeg[] {
  // A fresh first ascension starts on the next whole hour, as every later one does; continuing the
  // one in progress needs no ascension and runs from the plan start itself.
  const freshAt = nextHour(o.start);
  const hour = pacificHourOfWeek(freshAt);
  const row = o.rowFor ? o.rowFor(o.startTE) : o.startTE;
  const raw = o.table(row, hour) ?? [];
  const fresh = scaled(raw, o.deliveryScale ?? 1).map(b => rebase(b, row, o.delivered));
  const freshSweeps = fresh.map(b => sweepTails(b, o.final, 0, Math.floor(o.startTE) + 1));
  const contSweep = o.cont ? sweepTails(o.cont, o.final, 0, Math.floor(o.startTE) + 1) : null;
  const out: FirstLeg[] = [];
  for (let target = Math.floor(o.startTE) + 1; target <= o.final; target++) {
    const fp = fastest(freshSweeps, fresh, target);
    const f0 = fp
      ? {
          seconds: fp.sweep.seconds[fp.i],
          endTE: fp.sweep.endTE[fp.i],
          delivered: Array.from(fp.sweep.delivered.subarray(fp.i * 5, fp.i * 5 + 5)),
          build: fp.build,
        }
      : null;
    // Measured from the plan start, so it compares with continue on the same clock.
    const f = f0 ? { ...f0, seconds: f0.seconds + (freshAt - o.start) } : null;
    const ci = contSweep ? target - contSweep.from : -1;
    let c =
      contSweep && ci >= 0 && ci < contSweep.seconds.length && !Number.isNaN(contSweep.seconds[ci])
        ? {
            seconds: contSweep.seconds[ci],
            endTE: contSweep.endTE[ci],
            delivered: Array.from(contSweep.delivered.subarray(ci * 5, ci * 5 + 5)),
          }
        : null;
    if (c && !(c.seconds <= o.maxContinueSeconds)) c = null;
    let pick: { seconds: number; endTE: number; delivered: number[]; label: string } | null = null;
    if (c && o.forceContinue && c.seconds <= o.pinSeconds) pick = { ...c, label: 'continue' };
    else if (c && f) {
      // Forced: continue holds unless a fresh start is strictly faster. Not forced: the faster, ties
      // to the fresh start (pickVariant meets the fresh variants first).
      const contWins = o.forceContinue ? c.seconds <= f.seconds : c.seconds < f.seconds;
      pick = contWins ? { ...c, label: 'continue' } : { ...f, label: `${f.build.sales}-sale` };
    } else if (c) pick = { ...c, label: 'continue' };
    else if (f) pick = { ...f, label: `${f.build.sales}-sale` };
    if (pick)
      out.push({
        to: target,
        endTE: pick.endTE,
        end: o.start + pick.seconds,
        delivered: pick.delivered,
        label: pick.label,
      });
  }
  return out;
}
