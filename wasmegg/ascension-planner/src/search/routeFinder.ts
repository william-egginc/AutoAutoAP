/**
 * The fastest route to the target from a precomputed table (search/precomputedLeg.ts): every route,
 * every checkpoint at every TE, any number of ascensions, in a fraction of the time one simulated
 * route takes.
 *
 * HOW. A route is a run of ascensions, and what an ascension does depends only on the TE it starts
 * at and when it starts (the table's two keys); so the state between ascensions is (TE, time). An
 * ascension that starts later never ends sooner -- its build waits for the same weekly sale or a
 * later one, and the rest is waiting at a fixed rate -- so the earliest arrival at a TE is the only
 * one worth carrying on from. That makes the search a single pass upward through the TEs, keeping
 * the earliest arrival at each one, per number of ascensions so far: the fastest route of every
 * length comes out of the same pass.
 *
 * WHAT IT ASSUMES, and what scripts/precompute.ts measures it against: every ascension starts from
 * the canonical share of its TE across the eggs (the table's), and a start partway through an hour
 * meets the sale at its fixed time (`lateBy`). The first ascension is the player's own (finishing
 * the one in progress, from the real save), so callers can supply it rather than take a fresh build.
 */
import { bestTailTo, pacificHourOfWeek, rebase, tailTo, type BuildParams } from './precomputedLeg';

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
  /** Scale the peak delivery rate (a player's delivery score against the table's). */
  deliveryScale?: number;
  /** Map a start TE to the table row whose earning power matches (a player's Clothed TE bonus
   *  against the table's): the build is read from that row. */
  rowFor?: (te: number) => number;
}

interface Label {
  time: number;
  /** Where this arrival came from, for reading the route back. */
  prevTE: number;
  leg: RouteLeg | null;
}

function scaled(builds: BuildParams[], scale: number): BuildParams[] {
  return scale === 1 ? builds : builds.map(b => ({ ...b, peakELR: b.peakELR * scale }));
}

/**
 * The fastest route to `final` with each number of ascensions (index = ascensions; empty where none
 * reaches it), plus the fastest overall.
 */
export function findRoutes(o: FindOptions): { best: Route | null; byAscensions: (Route | null)[] } {
  const K = o.maxAscensions ?? 10;
  const scale = o.deliveryScale ?? 1;
  const top = o.final;
  // arrivals[k].get(te) = earliest arrival at TE `te` having made k ascensions.
  const arrivals: Map<number, Label>[] = Array.from({ length: K + 1 }, () => new Map());
  arrivals[0].set(o.startTE, { time: o.start, prevTE: -1, leg: null });

  const relax = (k: number, te: number, label: Label) => {
    const cur = arrivals[k].get(te);
    if (!cur || label.time < cur.time) arrivals[k].set(te, label);
  };

  for (let k = 0; k < K; k++) {
    // Upward through the TEs: every arrival at k ascensions spreads to k + 1.
    const states = [...arrivals[k].entries()].filter(([te]) => te < top).sort((a, b) => a[0] - b[0]);
    for (const [te, label] of states) {
      if (k === 0 && o.firstLegs) {
        for (const f of o.firstLegs) {
          relax(1, Math.min(f.endTE, top), {
            time: f.end,
            prevTE: te,
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
      const hour = pacificHourOfWeek(label.time);
      // Seconds into that hour: the table was built at the hour's first second. Pacific hours begin
      // on UTC hour boundaries (whole-hour offsets), so the remainder is the same in either.
      const lateBy = ((label.time % 3600) + 3600) % 3600;
      const row = o.rowFor ? o.rowFor(te) : te;
      const raw = o.table(row, hour);
      if (!raw?.length) continue;
      const builds = scaled(raw, scale);
      for (let target = te + 1; target <= top; target++) {
        const t = bestTailTo(builds, target, lateBy);
        if (!t) continue;
        const end = label.time + t.seconds;
        relax(k + 1, Math.min(t.endTE, top), {
          time: end,
          prevTE: te,
          leg: {
            from: te,
            to: target,
            endTE: t.endTE,
            start: label.time,
            end,
            sales: t.build.sales,
            tier13: t.build.tier13,
            label: `${t.build.sales}-sale${t.build.tier13 ? '-tier13' : ''}`,
          },
        });
      }
    }
  }

  const readBack = (k: number): Route | null => {
    const last = arrivals[k].get(top);
    if (!last) return null;
    const legs: RouteLeg[] = [];
    let te = top;
    for (let j = k; j > 0; j--) {
      const l = arrivals[j].get(te)!;
      legs.unshift(l.leg!);
      te = l.prevTE;
    }
    return { chain: legs.map(l => l.to), legs, end: last.time, seconds: last.time - o.start };
  };

  const byAscensions = Array.from({ length: K + 1 }, (_, k) => (k ? readBack(k) : null));
  const best = byAscensions.reduce<Route | null>((a, r) => (r && (!a || r.end < a.end) ? r : a), null);
  return { best, byAscensions };
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
  const hour = pacificHourOfWeek(o.start);
  const lateBy = ((o.start % 3600) + 3600) % 3600;
  const row = o.rowFor ? o.rowFor(o.startTE) : o.startTE;
  const raw = o.table(row, hour) ?? [];
  const fresh = scaled(raw, o.deliveryScale ?? 1).map(b => rebase(b, row, o.delivered));
  const out: FirstLeg[] = [];
  for (let target = Math.floor(o.startTE) + 1; target <= o.final; target++) {
    const f = fresh.length ? bestTailTo(fresh, target, lateBy) : null;
    let c = o.cont ? tailTo(o.cont, target) : null;
    if (c && !(c.seconds <= o.maxContinueSeconds)) c = null;
    let pick: { seconds: number; endTE: number; label: string } | null = null;
    if (c && o.forceContinue && c.seconds <= o.pinSeconds) pick = { ...c, label: 'continue' };
    else if (c && f) {
      // Forced: continue holds unless a fresh start is strictly faster. Not forced: the faster, ties
      // to the fresh start (pickVariant meets the fresh variants first).
      const contWins = o.forceContinue ? c.seconds <= f.seconds : c.seconds < f.seconds;
      pick = contWins ? { ...c, label: 'continue' } : { ...f, label: `${f.build.sales}-sale` };
    } else if (c) pick = { ...c, label: 'continue' };
    else if (f) pick = { ...f, label: `${f.build.sales}-sale` };
    if (pick) out.push({ to: target, endTE: pick.endTE, end: o.start + pick.seconds, label: pick.label });
  }
  return out;
}
