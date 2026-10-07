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
 * never ends sooner, so the simulator's own immediate start can only match or beat these times. The
 * one exception is inside the weekly sale, where a start can also be priced late from its own hour's
 * cell when that is exact (`startInSale`), so a route does not wait a week for want of an hour.
 *
 * EGGS CARRIED FORWARD. Where each egg's count stands matters (about one TE's wait an ascension), so
 * each arrival keeps the counts its route really reached, and the next build is moved onto them
 * (`rebase`, exact): the times of a route found here are the simulator's. The first ascension is the
 * player's own (finishing the one in progress, from the real save), so callers can supply it.
 */
import {
  bestTailTo,
  canonicalDelivered,
  pacificHourOfWeek,
  rebase,
  sweepTails,
  type BuildParams,
  type TailSweep,
} from './precomputedLeg';
import { getNextSaleEnd, isResearchSaleActive } from '@/lib/events';
import { isAvailable, type Availability } from './availability';

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
  /** ExpandSettings.waitHours. */
  waitHours?: number;
  /** Instead of a fresh build at `startTE`, these first ascensions (one per checkpoint). */
  firstLegs?: FirstLeg[];
  /** Eggs delivered per egg at the start (EGG_ORDER); the table's canonical share of `startTE` if
   *  left out. Each route carries its own counts forward from here. */
  startDelivered?: number[];
  /** Scale the peak delivery rate (a player's delivery score against the table's). */
  deliveryScale?: number;
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
  /** "Works inside my hours": only routes whose every prestige (each fresh ascension after the
   *  first, at the time the table starts it) falls inside these hours and days (`prestigesInHours`).
   *  An arrival whose prestige falls outside is dropped as it is made, so the arrivals kept are all
   *  inside and every count has its best chance of an answer. Counts left without one, once hours
   *  have dropped something, are listed in `outOfHours`. */
  hours?: Availability;
}

/** Whether every prestige of `route` falls inside `hours`: the start of each ascension after the
 *  first, as the table prices it (on the hour, or at once inside the sale). The first starts now,
 *  and reaching the final target needs no prestige (search/availability.ts). */
export function prestigesInHours(route: { legs: { start: number }[] }, hours: Availability): boolean {
  return route.legs.every((l, i) => i === 0 || isAvailable(l.start, hours));
}

/** The next whole hour at or after `t` (unix seconds). Pacific hours begin on UTC hour boundaries. */
export function nextHour(t: number): number {
  return Math.ceil(t / 3600) * 3600;
}

/** Purchases must end this long before the sale does to count as inside it (events.ts treats
 *  instants within a few seconds of a boundary as on it). */
const SALE_MARGIN = 60;

/**
 * THE SALE'S LAST HOURS (the collector analyst's B1, 1 Oct). Ascending on the next whole hour costs
 * nothing most of the week, but inside the weekly Research Sale an hour can decide whether a build's
 * purchases finish before the sale ends or it waits a week for the next one (LA-166, 487->490 from
 * Sat 08:03 PT: 8.96 d on the board, a week more from the 09:00 cell). So a start inside the sale is
 * also priced from its own hour's cell, moved the seconds it is late (`lateBy`), for each build whose
 * purchases still finish before this sale ends.
 *
 * That is exact, not an estimate: such a build lies wholly inside one sale window (Fri 09:00 to Sat
 * 09:00 PT; the earnings boost is Mon-Tue), where nothing the simulator does depends on the clock but
 * the sale's end, and the sale's end is what `lateBy` moves. Outside the sale nothing changes: a start
 * on the next whole hour can always be made, so those times stay what the simulator gives.
 */
export function startInSale(
  table: BuildLookup,
  te: number,
  t: number
): { lateBy: number; builds: BuildParams[] } | null {
  const cell = Math.floor(t / 3600) * 3600;
  const lateBy = t - cell;
  if (!(lateBy > 0) || !isResearchSaleActive(cell) || !isResearchSaleActive(t)) return null;
  const left = getNextSaleEnd(t) - t;
  // A sale lasts a day; anything longer means the end found was the next week's.
  if (!(left > 0 && left <= 86400)) return null;
  const builds = (table(te, pacificHourOfWeek(cell)) ?? []).filter(b => b.waitStart <= left - SALE_MARGIN);
  return builds.length ? { lateBy, builds } : null;
}

/**
 * One ascension from `te` at `t` to `target`, as the finder prices it: from the next whole hour's
 * cell, or from this hour's when the start is inside the sale (`startInSale`), whichever ends
 * sooner. For checks (scripts/precompute.ts); the finder itself does the same on whole sweeps.
 */
export function priceLeg(
  table: BuildLookup,
  te: number,
  t: number,
  delivered: number[],
  target: number,
  deliveryScale = 1
): { start: number; end: number; endTE: number; delivered: number[]; build: BuildParams } | null {
  const options: { start: number; lateBy: number; builds: BuildParams[] }[] = [];
  const at = nextHour(t);
  const raw = table(te, pacificHourOfWeek(at));
  if (raw?.length) options.push({ start: at, lateBy: 0, builds: raw });
  const late = at !== t ? startInSale(table, te, t) : null;
  if (late) options.push({ start: t, ...late });
  let best: ReturnType<typeof priceLeg> = null;
  for (const o of options) {
    const moved = scaled(o.builds, deliveryScale).map(b => rebase(b, te, delivered));
    const tail = bestTailTo(moved, target, o.lateBy);
    if (tail && (!best || o.start + tail.seconds < best.end))
      best = {
        start: o.start,
        end: o.start + tail.seconds,
        endTE: tail.endTE,
        delivered: tail.delivered,
        build: tail.build,
      };
  }
  return best;
}

interface Label {
  id: number;
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

function eggsOf(sweep: TailSweep, i: number): number[] {
  const out = [0, 0, 0, 0, 0];
  sweep.deliveredInto(i, out);
  return out;
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
function dominates(a: { time: number; delivered: number[] }, b: { time: number; delivered: number[] }): boolean {
  if (a.time > b.time + TIME_SLACK) return false;
  for (let i = 0; i < a.delivered.length; i++) if (a.delivered[i] < b.delivered[i] - EGG_SLACK) return false;
  return true;
}

/** Arrivals kept per (TE, ascensions) by default. */
export const DEFAULT_KEEP = 6;

/** One arrival handed out to be carried one ascension further (`expandArrivals`). */
export interface ArrivalItem {
  id: number;
  te: number;
  time: number;
  delivered: number[];
}

/** Where an arrival can get with one more ascension, and which arrival it came from. */
export interface Candidate {
  from: number;
  te: number;
  time: number;
  delivered: number[];
  leg: RouteLeg;
}

/** What `expandArrivals` needs besides the table; plain data, so it can go to a worker. */
export interface ExpandSettings {
  top: number;
  deliveryScale: number;
  onTheHour: boolean;
  keep: number;
  /** Also let each fresh ascension wait 1..waitHours whole hours before it starts (a test of whether
   *  a later start hour ever pays; scripts/precompute.ts --wait-hours). Default 0. */
  waitHours?: number;
}

type Kept<T> = T & { time: number; delivered: number[] };

/** Add to an earliest-first list of arrivals, keeping only the unbeaten and at most `keep`. */
function keepUnbeaten<T>(list: Kept<T>[] | undefined, item: Kept<T>, keep: number): Kept<T>[] {
  if (!list) return [item];
  if (list.some(l => dominates(l, item))) return list;
  const kept = list.filter(l => !dominates(item, l));
  let at = kept.findIndex(l => l.time > item.time);
  if (at < 0) at = kept.length;
  kept.splice(at, 0, item);
  if (kept.length > keep) kept.length = keep;
  return kept;
}

/**
 * Carry each arrival one ascension further: every checkpoint above it, from the table's builds for
 * its TE and start hour moved onto its egg counts, keeping per end TE only what nothing beats. The
 * step the route search repeats once per number of ascensions; it needs nothing but the table and
 * plain data, so the page can split one step's arrivals across workers and merge what comes back.
 */
export function expandArrivals(
  table: BuildLookup,
  s: ExpandSettings,
  items: ArrivalItem[],
  stats?: { expanded: number; sweeps: number; cached: number },
  /** Sweeps kept from earlier steps of the same search: the same counts at the same TE and hour come
   *  back at other numbers of ascensions. Its owner keeps it to one table and one `s`. */
  sweepCache: Map<string, TailSweep> = new Map()
): Candidate[] {
  const top = s.top;
  const lists = new Map<number, Candidate[]>();
  const beaten = (te: number, time: number, eggs: number[]): boolean => {
    const list = lists.get(te);
    if (!list) return false;
    for (const l of list) {
      if (l.time > time + TIME_SLACK) continue;
      let all = true;
      for (let e = 0; e < 5; e++) {
        if (l.delivered[e] < eggs[e] - EGG_SLACK) {
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
  const sweepOf = (b: BuildParams, key: string, lateBy: number, lowest: number): TailSweep => {
    let sw = sweepCache.get(key);
    if (!sw) {
      sw = sweepTails(b, top, lateBy, lowest);
      sweepCache.set(key, sw);
      if (stats) stats.sweeps++;
    } else if (stats) stats.cached++;
    return sw;
  };
  // Reused for each checkpoint's end counts; copied only when the arrival is kept.
  const scratch = [0, 0, 0, 0, 0];

  // Waiting: the same arrival again, ready at each of the next waitHours whole hours.
  if (s.waitHours) {
    const more: ArrivalItem[] = [];
    for (const item of items)
      for (let w = 1; w <= s.waitHours; w++) more.push({ ...item, time: nextHour(item.time) + w * 3600 });
    items = [...items, ...more];
  }
  for (const item of items) {
    const te = item.te;
    const startAt = s.onTheHour ? nextHour(item.time) : item.time;
    const hour = pacificHourOfWeek(startAt);
    // Seconds into the hour (0 on the hour): the table was built at the hour's first second.
    const lateBy = ((startAt % 3600) + 3600) % 3600;
    const raw = table(te, hour) ?? [];
    // Inside the sale, this hour's own cell started late too (`startInSale`); whichever ends sooner.
    const late = s.onTheHour && startAt !== item.time ? startInSale(table, te, item.time) : null;
    if (!raw.length && !late) continue;
    if (stats) stats.expanded++;
    // The table's builds, moved onto the eggs this route really arrived with, each priced to every
    // checkpoint at once (sweepTails, the same numbers as tailTo).
    const builds = scaled(raw, s.deliveryScale).map(b => rebase(b, te, item.delivered));
    const countsKey = `${te}|${startAt}|${item.delivered.join(',')}|`;
    const sweeps = builds.map((b, j) => sweepOf(b, countsKey + j, lateBy, te + 1));
    const lateBuilds = late ? scaled(late.builds, s.deliveryScale).map(b => rebase(b, te, item.delivered)) : [];
    const lateKey = `${te}|${item.time}|${item.delivered.join(',')}|late|`;
    const lateSweeps = lateBuilds.map((b, j) => sweepOf(b, lateKey + j, late!.lateBy, te + 1));
    for (let target = te + 1; target <= top; target++) {
      const onHour = fastest(sweeps, builds, target);
      const early = late ? fastest(lateSweeps, lateBuilds, target) : null;
      const takeEarly =
        !!early && (!onHour || item.time + early.sweep.seconds[early.i] < startAt + onHour.sweep.seconds[onHour.i]);
      const pick = takeEarly ? early : onHour;
      if (!pick) continue;
      const { sweep, build, i } = pick;
      const legStart = takeEarly ? item.time : startAt;
      const end = legStart + sweep.seconds[i];
      const endTE = sweep.endTE[i];
      const at = Math.min(endTE, top);
      sweep.deliveredInto(i, scratch);
      if (beaten(at, end, scratch)) continue;
      lists.set(
        at,
        keepUnbeaten(
          lists.get(at),
          {
            from: item.id,
            te: at,
            time: end,
            delivered: scratch.slice(),
            leg: {
              from: te,
              to: target,
              endTE,
              start: legStart,
              end,
              sales: build.sales,
              tier13: build.tier13,
              label: `${build.sales}-sale${build.tier13 ? '-tier13' : ''}`,
            },
          },
          s.keep
        )
      );
    }
  }
  return [...lists.keys()].sort((a, b) => a - b).flatMap(te => lists.get(te)!);
}

/**
 * The fastest route to `final` with each number of ascensions (index = ascensions; empty where none
 * reaches it), plus the fastest overall.
 *
 * At each TE and number of ascensions it keeps every arrival no other one beats on both time and egg
 * counts (`dominates`), the earliest `keep` of them: losing a beaten arrival loses nothing, so with
 * room for them all the result is the best route under the table's model. Each ascension takes the
 * fastest sale strategy for its own checkpoint, as the simulator does.
 *
 * Each number of ascensions is one `expandArrivals` step over all the arrivals so far. By default it
 * runs here; `expand` lets a caller run it elsewhere (the page splits it across workers) and merge.
 */
export async function findRoutes(
  o: FindOptions & {
    /** Run one step somewhere else and give back its candidates (default: here, on `o.table`). */
    expand?: (items: ArrivalItem[], settings: ExpandSettings) => Promise<Candidate[]> | Candidate[];
  }
): Promise<{
  best: Route | null;
  byAscensions: (Route | null)[];
  /** With `deadline`: the route to the highest TE reached by then, or null when none is. */
  byDate: Route | null;
  /** With `deadline`: the same for each number of ascensions (index = ascensions). */
  byDateByAscensions: (Route | null)[];
  /** With `hours`: the numbers of ascensions left without a route (in time, with a deadline) once
   *  the hours have dropped an arrival at that count or before. */
  outOfHours?: number[];
  /** Each count's other kept routes (FoundRoutes). */
  alternatives: Route[][];
  dateAlternatives: Route[][];
}> {
  const K = o.maxAscensions ?? 10;
  const keep = o.keep ?? DEFAULT_KEEP;
  const top = o.final;
  const settings: ExpandSettings = {
    top,
    deliveryScale: o.deliveryScale ?? 1,
    onTheHour: o.onTheHour ?? true,
    keep,
    ...(o.waitHours ? { waitHours: o.waitHours } : {}),
  };
  const cache = new Map<string, TailSweep>();
  const expand =
    o.expand ?? ((items: ArrivalItem[], st: ExpandSettings) => expandArrivals(o.table, st, items, o.stats, cache));
  let nextId = 0;
  const byId = new Map<number, Label>();
  const label = (l: Omit<Label, 'id'>): Label => {
    const made = { ...l, id: nextId++ };
    byId.set(made.id, made);
    return made;
  };
  // arrivals[k].get(te): the arrivals at TE `te` after k ascensions, earliest first.
  const arrivals: Map<number, Label[]>[] = Array.from({ length: K + 1 }, () => new Map());
  arrivals[0].set(o.startTE, [
    label({ time: o.start, delivered: o.startDelivered ?? canonicalDelivered(o.startTE), prev: null, leg: null }),
  ]);
  // With hours: the step at which hours first dropped an arrival (none: Infinity).
  const hours = o.hours;
  let firstDrop = Infinity;
  const relax = (k: number, te: number, l: Omit<Label, 'id'>) => {
    // An ascension after the first starts with a prestige: outside the hours, this route is out.
    if (hours && l.prev?.leg && l.leg && !isAvailable(l.leg.start, hours)) {
      firstDrop = Math.min(firstDrop, k);
      return;
    }
    const list = arrivals[k].get(te);
    if (list?.some(x => dominates(x, l))) return;
    arrivals[k].set(te, keepUnbeaten(list, label(l), keep));
  };

  for (let k = 0; k < K; k++) {
    o.onProgress?.(k, K);
    // Upward through the TEs: every arrival at k ascensions spreads to k + 1.
    const tes = [...arrivals[k].keys()].filter(te => te < top).sort((a, b) => a - b);
    if (k === 0 && o.firstLegs) {
      const start = arrivals[0].get(o.startTE)![0];
      for (const f of o.firstLegs) {
        relax(1, Math.min(f.endTE, top), {
          time: f.end,
          delivered: f.delivered,
          prev: start,
          leg: {
            from: o.startTE,
            to: f.to,
            endTE: f.endTE,
            start: start.time,
            end: f.end,
            sales: 0,
            tier13: false,
            label: f.label ?? 'first',
          },
        });
      }
      continue;
    }
    const items: ArrivalItem[] = [];
    for (const te of tes)
      for (const l of arrivals[k].get(te)!) items.push({ id: l.id, te, time: l.time, delivered: l.delivered });
    if (!items.length) break;
    for (const c of await expand(items, settings)) {
      relax(k + 1, c.te, { time: c.time, delivered: c.delivered, prev: byId.get(c.from) ?? null, leg: c.leg });
    }
  }

  const routeTo = (last: Label): Route => {
    const legs: RouteLeg[] = [];
    for (let l: Label | null = last; l?.leg; l = l.prev) legs.unshift(l.leg);
    return { chain: legs.map(l => l.to), legs, end: last.time, seconds: last.time - o.start };
  };
  // A count with no answer once hours have dropped an arrival at it or before.
  const outOfHours = new Set<number>();
  const alternatives: Route[][] = Array.from({ length: K + 1 }, () => []);
  const dateAlternatives: Route[][] = Array.from({ length: K + 1 }, () => []);
  const readBack = (k: number): Route | null => {
    const last = arrivals[k].get(top)?.[0];
    alternatives[k] = (arrivals[k].get(top) ?? []).slice(1).map(routeTo);
    if (o.deadline === undefined && !last && k >= firstDrop) outOfHours.add(k);
    return last ? routeTo(last) : null;
  };

  const byAscensions = Array.from({ length: K + 1 }, (_, k) => (k ? readBack(k) : null));
  const best = byAscensions.reduce<Route | null>((a, r) => (r && (!a || r.end < a.end) ? r : a), null);

  // Highest TE by the date: the highest TE any route reaches in time, and of those the earliest; for
  // each number of ascensions and over all of them.
  let byDate: Route | null = null;
  const byDateByAscensions: (Route | null)[] = Array.from({ length: K + 1 }, () => null);
  if (o.deadline !== undefined) {
    let overall: { te: number; label: Label } | null = null;
    for (let k = 1; k <= K; k++) {
      let mine: { te: number; label: Label } | null = null;
      for (const [te, list] of arrivals[k]) {
        const l = list[0];
        if (l.time > o.deadline) continue;
        if (!mine || te > mine.te || (te === mine.te && l.time < mine.label.time)) mine = { te, label: l };
      }
      if (!mine && k >= firstDrop) outOfHours.add(k);
      if (!mine) continue;
      byDateByAscensions[k] = routeTo(mine.label);
      dateAlternatives[k] = arrivals[k]
        .get(mine.te)!
        .filter(l => l !== mine!.label && l.time <= o.deadline!)
        .map(routeTo);
      if (!overall || mine.te > overall.te || (mine.te === overall.te && mine.label.time < overall.label.time))
        overall = mine;
    }
    byDate = overall ? routeTo(overall.label) : null;
  }
  return {
    best,
    byAscensions,
    byDate,
    byDateByAscensions,
    ...(hours ? { outOfHours: [...outOfHours].sort((a, b) => a - b) } : {}),
    alternatives,
    dateAlternatives,
  };
}

export interface FirstLegOptions {
  table: BuildLookup;
  startTE: number;
  start: number;
  final: number;
  /** As FindOptions: the player's delivery against the table's. */
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
  const row = o.startTE;
  const raw = o.table(row, hour) ?? [];
  const fresh = scaled(raw, o.deliveryScale ?? 1).map(b => rebase(b, row, o.delivered));
  const freshSweeps = fresh.map(b => sweepTails(b, o.final, 0, Math.floor(o.startTE) + 1));
  // Inside the sale, ascending right away from this hour's cell can catch what the next hour misses.
  const late = freshAt !== o.start ? startInSale(o.table, row, o.start) : null;
  const lateFresh = late ? scaled(late.builds, o.deliveryScale ?? 1).map(b => rebase(b, row, o.delivered)) : [];
  const lateSweeps = lateFresh.map(b => sweepTails(b, o.final, late!.lateBy, Math.floor(o.startTE) + 1));
  const contSweep = o.cont ? sweepTails(o.cont, o.final, 0, Math.floor(o.startTE) + 1) : null;
  const out: FirstLeg[] = [];
  for (let target = Math.floor(o.startTE) + 1; target <= o.final; target++) {
    const fp = fastest(freshSweeps, fresh, target);
    const lp = late ? fastest(lateSweeps, lateFresh, target) : null;
    // Measured from the plan start, so it compares with continue on the same clock.
    const onHour = fp
      ? {
          seconds: fp.sweep.seconds[fp.i] + (freshAt - o.start),
          endTE: fp.sweep.endTE[fp.i],
          delivered: eggsOf(fp.sweep, fp.i),
          build: fp.build,
        }
      : null;
    const now = lp
      ? {
          seconds: lp.sweep.seconds[lp.i],
          endTE: lp.sweep.endTE[lp.i],
          delivered: eggsOf(lp.sweep, lp.i),
          build: lp.build,
        }
      : null;
    const f = now && (!onHour || now.seconds < onHour.seconds) ? now : onHour;
    const ci = contSweep ? target - contSweep.from : -1;
    let c =
      contSweep && ci >= 0 && ci < contSweep.seconds.length && !Number.isNaN(contSweep.seconds[ci])
        ? {
            seconds: contSweep.seconds[ci],
            endTE: contSweep.endTE[ci],
            delivered: eggsOf(contSweep, ci),
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

/** What `polishFound` needs to price a route as `findRoutes` did (plain data, so it can go to a worker). */
export interface PolishOptions {
  startTE: number;
  start: number;
  /** As FindOptions: the player's own first ascensions, else a fresh one from `startDelivered`. */
  firstLegs?: FirstLeg[];
  startDelivered?: number[];
  deliveryScale?: number;
  deadline?: number;
  /** How far one stop moves (default 2); neighbouring pairs move by one each unless `pairs` is false. */
  reach?: number;
  pairs?: boolean;
  /** As FindOptions: only moves that keep every prestige inside these hours. */
  hours?: Availability;
  /** The stronger polish (the user, 6 Oct): the first two stops searched together, each moved by up
   *  to this many TE, before the local search (default 0: off). */
  wide?: number;
  /** With `wide`: every pair of neighbouring stops searched that way in turn, not only the first two. */
  wideAll?: boolean;
  /** Polish this many of the finder's kept routes for each count, not only its best (default 1). */
  candidates?: number;
}

export interface FoundRoutes {
  best: Route | null;
  byAscensions: (Route | null)[];
  byDate: Route | null;
  byDateByAscensions: (Route | null)[];
  outOfHours?: number[];
  /** The finder's other kept routes for each count, earliest first: to the target, and with a
   *  deadline at the TE of that count's date route, in time. For the stronger polish. */
  alternatives?: Route[][];
  dateAlternatives?: Route[][];
}

/** `chain` priced the way `findRoutes` prices a route: its first leg from `firstLegs` (or a fresh one),
 *  then each checkpoint on the hour (or late inside the sale). Null when a stop is not above the TE
 *  reached by then. */
export function priceChain(
  table: BuildLookup,
  o: PolishOptions,
  chain: number[],
  /** Prefixes already priced, by `chain.slice(0, i).join(',')` (each is priced once per memo). */
  memo?: Map<string, PricedPrefix | null>
): Route | null {
  const scale = o.deliveryScale ?? 1;
  let legs: RouteLeg[] = [];
  let t = o.start;
  let te = o.startTE;
  let eggs = o.startDelivered ?? canonicalDelivered(o.startTE);
  let from = 0;
  if (memo)
    for (let i = chain.length; i > 0; i--) {
      const m = memo.get(chain.slice(0, i).join(','));
      if (m === null) return null;
      if (m) {
        ({ t, te, eggs } = m);
        legs = [...m.legs];
        from = i;
        break;
      }
    }
  const remember = (i: number, ok: boolean) =>
    memo?.set(chain.slice(0, i + 1).join(','), ok ? { t, te, eggs, legs: [...legs] } : null);
  for (let i = from; i < chain.length; i++) {
    const target = chain[i];
    if (target <= te) return (remember(i, false), null);
    if (i === 0 && o.firstLegs) {
      const f = o.firstLegs.find(x => x.to === target);
      if (!f) return (remember(i, false), null);
      legs.push({
        from: o.startTE,
        to: target,
        endTE: f.endTE,
        start: o.start,
        end: f.end,
        sales: 0,
        tier13: false,
        label: f.label ?? 'first',
      });
      t = f.end;
      te = f.endTE;
      eggs = f.delivered;
      remember(i, true);
      continue;
    }
    const p = priceLeg(table, te, t, eggs, target, scale);
    if (!p) return (remember(i, false), null);
    legs.push({
      from: te,
      to: target,
      endTE: p.endTE,
      start: p.start,
      end: p.end,
      sales: p.build.sales,
      tier13: p.build.tier13,
      label: `${p.build.sales}-sale${p.build.tier13 ? '-tier13' : ''}`,
    });
    t = p.end;
    te = p.endTE;
    eggs = p.delivered;
    remember(i, true);
  }
  return { chain: [...chain], legs, end: t, seconds: t - o.start };
}

/** Where a priced prefix of a route leaves off (`priceChain`'s memo). */
export interface PricedPrefix {
  t: number;
  te: number;
  eggs: number[];
  legs: RouteLeg[];
}

/**
 * The stronger polish's first step: the first two stops (the first alone on a two-stop route) moved
 * together by up to `o.wide` TE each, every combination priced, keeping the soonest that `ok`
 * accepts. The finder's misses on the bench were mostly early stops several TE off (LA-166 178->267:
 * 199 218 237 against 191 196 231), out of the local search's reach.
 */
function widenRoute(
  table: BuildLookup,
  o: PolishOptions,
  route: Route,
  ok: (r: Route) => boolean,
  memo: Map<string, PricedPrefix | null>
): Route {
  const w = o.wide ?? 0;
  const movable = route.chain.length - 1;
  if (!w || movable < 1) return route;
  let best = route;
  // The pairs searched: the first two stops (the first alone on a two-stop route), or with `wideAll`
  // each neighbouring pair in turn, from the best so far.
  const firsts = o.wideAll ? Array.from({ length: Math.max(1, movable - 1) }, (_, i) => i) : [0];
  for (const i of firsts) {
    const two = i + 1 < movable;
    const base = best.chain;
    for (let a = -w; a <= w; a++)
      for (let b = two ? -w : 0; b <= (two ? w : 0); b++) {
        if (!a && !b) continue;
        const c = [...base];
        c[i] += a;
        if (two) c[i + 1] += b;
        const r = priceChain(table, o, c, memo);
        if (r && ok(r) && r.end < best.end - 60) best = r;
      }
  }
  return best;
}

/**
 * A local search around one route: each stop before the last moved by up to `reach` TE, then each
 * pair of neighbouring stops by one together, keeping any route that `ok` accepts and ends sooner,
 * until nothing improves. The finder can prune a route that a later, better-aligned start makes
 * faster (a board player, 6 Oct: 164 199 223 256 lost to 165 199 223 256 mid-search and ends 12 h sooner);
 * this finds such a neighbour on the table in milliseconds, and never returns anything slower.
 */
function polishRoute(
  table: BuildLookup,
  o: PolishOptions,
  route: Route,
  ok: (r: Route) => boolean,
  memo?: Map<string, PricedPrefix | null>
): Route {
  const reach = o.reach ?? 2;
  let best = route;
  const tryChain = (c: number[]): boolean => {
    const r = priceChain(table, o, c, memo);
    if (!r || !ok(r) || !(r.end < best.end - 60)) return false;
    best = r;
    return true;
  };
  for (let round = 0; round < 20; round++) {
    let improved = false;
    for (let i = 0; i < best.chain.length - 1; i++) {
      for (let d = -reach; d <= reach; d++) {
        if (!d) continue;
        const c = [...best.chain];
        c[i] += d;
        if (tryChain(c)) improved = true;
      }
    }
    if (o.pairs !== false) {
      for (let i = 0; i + 1 < best.chain.length - 1; i++) {
        for (const [a, b] of [
          [1, 1],
          [-1, -1],
          [1, -1],
          [-1, 1],
        ]) {
          const c = [...best.chain];
          c[i] += a;
          c[i + 1] += b;
          if (tryChain(c)) improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return best;
}

/**
 * `findRoutes`' answer, each route polished (`polishRoute`): the fastest for each number of
 * ascensions, and with a deadline each count's highest-TE route (the same TE or higher, still in time,
 * more to spare). The overall best and By a date answer are picked again from the polished ones.
 */
export function polishFound(table: BuildLookup, o: PolishOptions, found: FoundRoutes): FoundRoutes {
  const lastTE = (r: Route) => r.legs[r.legs.length - 1]?.endTE ?? 0;
  const inHours = (c: Route) => !o.hours || prestigesInHours(c, o.hours);
  // Each count: its route and up to `candidates` - 1 of the finder's other kept ones, each widened
  // (`widenRoute`, with `wide`) and then polished; the soonest wins. One memo per count.
  const polishFrom = (r: Route, others: Route[] | undefined, ok: (c: Route) => boolean): Route => {
    const memo = new Map<string, PricedPrefix | null>();
    const starts = [r, ...(others ?? []).filter(c => c.chain.join() !== r.chain.join() && ok(c))].slice(
      0,
      Math.max(1, o.candidates ?? 1)
    );
    let best: Route = r;
    for (const c of starts) {
      const p = polishRoute(table, o, widenRoute(table, o, c, ok, memo), ok, memo);
      if (p.end < best.end - 60) best = p;
    }
    return best;
  };
  const byAscensions = found.byAscensions.map((r, k) => (r ? polishFrom(r, found.alternatives?.[k], inHours) : r));
  const best = byAscensions.reduce<Route | null>((a, r) => (r && (!a || r.end < a.end) ? r : a), null);
  const byDateByAscensions = found.byDateByAscensions.map((r, k) =>
    r && o.deadline !== undefined
      ? polishFrom(r, found.dateAlternatives?.[k], c => c.end <= o.deadline! && lastTE(c) >= lastTE(r) && inHours(c))
      : r
  );
  const byDate =
    o.deadline === undefined
      ? found.byDate
      : byDateByAscensions.reduce<Route | null>(
          (a, r) => (r && (!a || lastTE(r) > lastTE(a) || (lastTE(r) === lastTE(a) && r.end < a.end)) ? r : a),
          null
        );
  return {
    best,
    byAscensions,
    byDate,
    byDateByAscensions,
    ...(found.outOfHours ? { outOfHours: found.outOfHours } : {}),
  };
}
