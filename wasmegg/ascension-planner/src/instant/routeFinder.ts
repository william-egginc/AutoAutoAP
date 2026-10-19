/**
 * The fastest route to the target from a precomputed table (precomputedLeg.ts): every route, every
 * checkpoint at every TE, any number of ascensions, in a fraction of the time one simulated route takes.
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
 * an estimate. A later start never ends sooner, so the simulator's own immediate start can only match
 * or beat these times. The one exception is inside the weekly sale, where a start can also be priced
 * late from its own hour's cell when that is exact (`startInSale`), so a route does not wait a week
 * for want of an hour.
 *
 * EGGS CARRIED FORWARD. Where each egg's count stands matters (about one TE's wait an ascension), so
 * each arrival keeps the counts its route really reached, and the next build is moved onto them
 * (`rebase`, exact): the times of a route found here are the simulator's.
 *
 * Ported from the AutoAutoAP fork (search/routeFinder.ts). Left out: hours ("works inside my hours"),
 * waiting hours, and the build-up first leg. The first ascension is a fresh build from the table on
 * the save's own egg counts, or finishing the one in progress (continue), whichever is sooner
 * (`firstLegOptions`).
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
  /** How it is played, as Joo's planner names the build variants: '2-sale', '1-sale-tier13'. */
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

/** A first ascension worked out outside the table (`firstLegOptions`): where it ends and when. */
export interface FirstLeg {
  to: number;
  endTE: number;
  end: number;
  /** Eggs delivered per egg when it ends (EGG_ORDER). */
  delivered: number[];
  /** 'continue', or the fresh build's variant ('2-sale', ...). */
  label: string;
}

export interface FindOptions {
  table: BuildLookup;
  /** The TE the plan starts from and the unix second it starts. */
  startTE: number;
  start: number;
  final: number;
  /** Most ascensions to consider. */
  maxAscensions?: number;
  /** Eggs delivered per egg at the start (EGG_ORDER); the table's canonical share of `startTE` if
   *  left out. Each route carries its own counts forward from here. */
  startDelivered?: number[];
  /** Instead of a fresh build at `startTE`, these first ascensions (one per checkpoint). */
  firstLegs?: FirstLeg[];
  /** Scale the peak delivery rate (a player's delivery against the table's, deliveryScale.ts). */
  deliveryScale?: number;
  /** Arrivals kept per TE and number of ascensions (`DEFAULT_KEEP`). */
  keep?: number;
  /** No route continues from a checkpoint above this (default USEFUL_STOP_MAX; Infinity: no limit). */
  usefulStopMax?: number;
  /** Also find the highest TE reachable by this unix second (By a date), from the same pass: the
   *  highest TE whose earliest arrival is no later. */
  deadline?: number;
  /** Told after each number of ascensions is done (k of `maxAscensions`), for a progress line. */
  onProgress?: (done: number, of: number) => void;
  /** Awaited before each number of ascensions; it may throw to stop the search (a newer request
   *  came, latestOnly.ts), so a superseded run stops mid-search rather than at its end. */
  pause?: () => Promise<void>;
  /** Filled in with what the search did, for tuning. */
  stats?: { expanded: number; sweeps: number; cached: number };
  /** False: start the moment the last one ends and shift the sale by the minutes past the hour
   *  (`lateBy`), an approximation, kept for comparing. Default: on the next whole hour. */
  onTheHour?: boolean;
}

/** The next whole hour at or after `t` (unix seconds). Pacific hours begin on UTC hour boundaries. */
export function nextHour(t: number): number {
  return Math.ceil(t / 3600) * 3600;
}

/** Purchases must end this long before the sale does to count as inside it (events.ts treats
 *  instants within a few seconds of a boundary as on it). */
const SALE_MARGIN = 60;

/**
 * THE SALE'S LAST HOURS. Ascending on the next whole hour costs nothing most of the week, but inside
 * the weekly Research Sale an hour can decide whether a build's purchases finish before the sale ends
 * or it waits a week for the next one. So a start inside the sale is also priced from its own hour's
 * cell, moved the seconds it is late (`lateBy`), for each build whose purchases still finish before
 * this sale ends. That is exact: such a build lies wholly inside one sale window, where nothing the
 * simulator does depends on the clock but the sale's end, and the sale's end is what `lateBy` moves.
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
 * cell, or from this hour's when the start is inside the sale (`startInSale`), whichever ends sooner.
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
 * seconds at peak delivery. Without a little slack near-copies of one route each "beat" another on
 * one egg, nothing is ever discarded, and the search does many times the work for answers that
 * differ by seconds. The routes reported keep their own exact times.
 */
const TIME_SLACK = 60;
const EGG_SLACK = 1e14;

/** No later, and at least as many eggs on every egg (within the slack): then `a` can do anything `b`
 *  can, as soon or sooner. */
function dominates(a: { time: number; delivered: number[] }, b: { time: number; delivered: number[] }): boolean {
  if (a.time > b.time + TIME_SLACK) return false;
  for (let i = 0; i < a.delivered.length; i++) if (a.delivered[i] < b.delivered[i] - EGG_SLACK) return false;
  return true;
}

/** Arrivals kept per (TE, ascensions) by default. */
export const DEFAULT_KEEP = 6;

/**
 * The highest checkpoint worth ascending at on the way to a later target. Past about TE 340 a build
 * already reaches the full laying rate, so one more ascension there only adds a prestige and its
 * rebuild: over 650 routes on four tables no fastest route had a stop above 338. So a route never
 * continues from a stop above this, with margin. A route can still END above it.
 */
export const USEFUL_STOP_MAX = 360;

/** One arrival handed out to be carried one ascension further (`expandArrivals`). */
export interface ArrivalItem {
  id: number;
  te: number;
  time: number;
  delivered: number[];
  /** The checkpoint the arrival ascended at (absent at the start). */
  stop?: number;
}

/** Where an arrival can get with one more ascension, and which arrival it came from. */
export interface Candidate {
  from: number;
  te: number;
  time: number;
  delivered: number[];
  leg: RouteLeg;
}

/** What `expandArrivals` needs besides the table. */
export interface ExpandSettings {
  top: number;
  deliveryScale: number;
  onTheHour: boolean;
  keep: number;
  /** No route continues from a checkpoint above this (USEFUL_STOP_MAX; absent: no limit). */
  usefulStopMax?: number;
  /** Keep arrivals at checkpoints above `usefulStopMax` that are not the target: a by-date search
   *  ends there. */
  keepHighEnds?: boolean;
}

/** What `expandArrivals` needs of a sweep cache: a plain Map works too. */
export interface SweepStore {
  get(key: string): TailSweep | undefined;
  set(key: string, sweep: TailSweep): unknown;
}

/**
 * Sweeps kept across a search's steps, held to a memory budget (each is ~21 KB; the oldest unused
 * goes first). A sweep dropped is only worked out again when asked for: the answer is the same.
 * The fork sizes this per device; one budget that fits a phone is used here.
 */
export class SweepCache implements SweepStore {
  private map = new Map<string, TailSweep>();
  bytes = 0;
  constructor(readonly maxBytes: number = 384 * 1024 * 1024) {}
  get(key: string): TailSweep | undefined {
    const sw = this.map.get(key);
    if (sw) {
      this.map.delete(key);
      this.map.set(key, sw);
    }
    return sw;
  }
  set(key: string, sweep: TailSweep): this {
    const old = this.map.get(key);
    if (old) {
      this.bytes -= old.bytes;
      this.map.delete(key);
    }
    this.map.set(key, sweep);
    this.bytes += sweep.bytes;
    for (const [k, sw] of this.map) {
      if (this.bytes <= this.maxBytes || k === key) break;
      this.map.delete(k);
      this.bytes -= sw.bytes;
    }
    return this;
  }
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
 * its TE and start hour moved onto its egg counts, keeping per end TE only what nothing beats.
 */
export function expandArrivals(
  table: BuildLookup,
  s: ExpandSettings,
  items: ArrivalItem[],
  stats?: { expanded: number; sweeps: number; cached: number },
  sweepCache: SweepStore = new Map<string, TailSweep>()
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
  // A build moved onto the same counts at the same hour prices the same: each such sweep once.
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
  const cap = s.usefulStopMax ?? Infinity;
  for (const item of items) {
    // A route that ascended above the useful stops goes no further (USEFUL_STOP_MAX).
    if (item.stop !== undefined && item.stop > cap) continue;
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
    const builds = scaled(raw, s.deliveryScale).map(b => rebase(b, te, item.delivered));
    const countsKey = `${te}|${startAt}|${item.delivered.join(',')}|`;
    const sweeps = builds.map((b, j) => sweepOf(b, countsKey + j, lateBy, te + 1));
    const lateBuilds = late ? scaled(late.builds, s.deliveryScale).map(b => rebase(b, te, item.delivered)) : [];
    const lateKey = `${te}|${item.time}|${item.delivered.join(',')}|late|`;
    const lateSweeps = lateBuilds.map((b, j) => sweepOf(b, lateKey + j, late!.lateBy, te + 1));
    for (let target = te + 1; target <= top; target++) {
      // A stop above the cap that is not the target leads nowhere (it is never continued from).
      if (target > cap && target < top && !s.keepHighEnds) continue;
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

export interface FoundRoutes {
  best: Route | null;
  /** The fastest route to the target with each number of ascensions (index = ascensions). */
  byAscensions: (Route | null)[];
  /** With `deadline`: the route to the highest TE reached by then, or null when none is. */
  byDate: Route | null;
  /** With `deadline`: the same for each number of ascensions (index = ascensions). */
  byDateByAscensions: (Route | null)[];
  /** The finder's other kept routes for each count, earliest first: to the target, and with a
   *  deadline at the TE of that count's date route, in time. For the stronger polish. */
  alternatives?: Route[][];
  dateAlternatives?: Route[][];
}

/**
 * The fastest route to `final` with each number of ascensions (empty where none reaches it), plus
 * the fastest overall; with a deadline, the highest TE reached by then for each count too.
 *
 * At each TE and number of ascensions it keeps every arrival no other one beats on both time and egg
 * counts (`dominates`), the earliest `keep` of them. Each ascension takes the fastest sale strategy
 * for its own checkpoint, as the simulator does.
 */
export async function findRoutes(o: FindOptions): Promise<FoundRoutes & { alternatives: Route[][]; dateAlternatives: Route[][] }> {
  const K = o.maxAscensions ?? 10;
  const keep = o.keep ?? DEFAULT_KEEP;
  const top = o.final;
  const settings: ExpandSettings = {
    top,
    deliveryScale: o.deliveryScale ?? 1,
    onTheHour: o.onTheHour ?? true,
    keep,
    usefulStopMax: o.usefulStopMax ?? USEFUL_STOP_MAX,
    ...(o.deadline !== undefined ? { keepHighEnds: true } : {}),
  };
  const cache = new SweepCache();
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
  const relax = (k: number, te: number, l: Omit<Label, 'id'>) => {
    const list = arrivals[k].get(te);
    if (list?.some(x => dominates(x, l))) return;
    arrivals[k].set(te, keepUnbeaten(list, label(l), keep));
  };

  for (let k = 0; k < K; k++) {
    o.onProgress?.(k, K);
    if (k && o.pause) await o.pause();
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
            label: f.label,
          },
        });
      }
      continue;
    }
    const items: ArrivalItem[] = [];
    for (const te of tes)
      for (const l of arrivals[k].get(te)!)
        items.push({ id: l.id, te, time: l.time, delivered: l.delivered, ...(l.leg ? { stop: l.leg.to } : {}) });
    if (!items.length) break;
    for (const c of expandArrivals(o.table, settings, items, o.stats, cache)) {
      relax(k + 1, c.te, { time: c.time, delivered: c.delivered, prev: byId.get(c.from) ?? null, leg: c.leg });
    }
  }

  const routeTo = (last: Label): Route => {
    const legs: RouteLeg[] = [];
    for (let l: Label | null = last; l?.leg; l = l.prev) legs.unshift(l.leg);
    return { chain: legs.map(l => l.to), legs, end: last.time, seconds: last.time - o.start };
  };
  const alternatives: Route[][] = Array.from({ length: K + 1 }, () => []);
  const dateAlternatives: Route[][] = Array.from({ length: K + 1 }, () => []);
  const readBack = (k: number): Route | null => {
    const last = arrivals[k].get(top)?.[0];
    alternatives[k] = (arrivals[k].get(top) ?? []).slice(1).map(routeTo);
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
  return { best, byAscensions, byDate, byDateByAscensions, alternatives, dateAlternatives };
}

/** What `polishFound` needs to price a route as `findRoutes` did. */
export interface PolishOptions {
  startTE: number;
  start: number;
  /** As FindOptions: the first ascensions, else a fresh one from `startDelivered`. */
  firstLegs?: FirstLeg[];
  startDelivered?: number[];
  deliveryScale?: number;
  deadline?: number;
  /** How far one stop moves (default 2); neighbouring pairs move by one each unless `pairs` is false. */
  reach?: number;
  pairs?: boolean;
  /** The stronger polish: the first two stops searched together, each moved by up to this many TE,
   *  before the local search (default 0: off). */
  wide?: number;
  /** With `wide`: every pair of neighbouring stops searched that way in turn, not only the first two. */
  wideAll?: boolean;
  /** Polish this many of the finder's kept routes for each count, not only its best (default 1). */
  candidates?: number;
}

/** Where a priced prefix of a route leaves off (`priceChain`'s memo). */
export interface PricedPrefix {
  t: number;
  te: number;
  eggs: number[];
  legs: RouteLeg[];
}

/** `chain` priced the way `findRoutes` prices a route: each checkpoint on the hour (or late inside
 *  the sale). Null when a stop is not above the TE reached by then. */
export function priceChain(
  table: BuildLookup,
  o: PolishOptions,
  chain: number[],
  /** Prefixes already priced, by `chain.slice(0, i).join(',')`. */
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
      legs.push({ from: o.startTE, to: target, endTE: f.endTE, start: o.start, end: f.end, sales: 0, tier13: false, label: f.label });
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

/** The stronger polish's first step: the first two stops moved together by up to `o.wide` TE each,
 *  every combination priced, keeping the soonest that `ok` accepts. */
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
 * until nothing improves. Never returns anything slower.
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
  const byAscensions = found.byAscensions.map((r, k) => (r ? polishFrom(r, found.alternatives?.[k], () => true) : r));
  const best = byAscensions.reduce<Route | null>((a, r) => (r && (!a || r.end < a.end) ? r : a), null);
  const byDateByAscensions = found.byDateByAscensions.map((r, k) =>
    r && o.deadline !== undefined
      ? polishFrom(r, found.dateAlternatives?.[k], c => c.end <= o.deadline! && lastTE(c) >= lastTE(r))
      : r
  );
  const byDate =
    o.deadline === undefined
      ? found.byDate
      : byDateByAscensions.reduce<Route | null>(
          (a, r) => (r && (!a || lastTE(r) > lastTE(a) || (lastTE(r) === lastTE(a) && r.end < a.end)) ? r : a),
          null
        );
  return { best, byAscensions, byDate, byDateByAscensions };
}

/** Continue is not a candidate past this (the fork's search/rules.ts CONTINUE_MAX_SECONDS): a year on
 *  one farm is not a plan. */
export const CONTINUE_MAX_SECONDS = 183 * 86400;

export interface FirstLegOptions {
  table: BuildLookup;
  startTE: number;
  start: number;
  final: number;
  deliveryScale?: number;
  /** The save's eggs delivered on each egg at the plan start (EGG_ORDER). */
  delivered: number[];
  /** Finishing the ascension in progress (continueTail.ts), at the farm's own rate, or null. */
  cont: BuildParams | null;
}

function eggsOf(sweep: TailSweep, i: number): number[] {
  const out = [0, 0, 0, 0, 0];
  sweep.deliveredInto(i, out);
  return out;
}

/**
 * The first ascension to every checkpoint (the fork's `firstLegOptions` under its default setting,
 * without the build-up): the fresh build from the table (on the next whole hour, or at once inside
 * the sale's last hours), moved onto the save's eggs, or continuing the ascension in progress when it
 * is strictly sooner (ties go to the fresh start, as Joo's pickVariant meets those first).
 */
export function firstLegOptions(o: FirstLegOptions): FirstLeg[] {
  const freshAt = nextHour(o.start);
  const row = o.startTE;
  const fresh = scaled(o.table(row, pacificHourOfWeek(freshAt)) ?? [], o.deliveryScale ?? 1).map(b =>
    rebase(b, row, o.delivered)
  );
  const lowest = Math.floor(o.startTE) + 1;
  const freshSweeps = fresh.map(b => sweepTails(b, o.final, 0, lowest));
  const late = freshAt !== o.start ? startInSale(o.table, row, o.start) : null;
  const lateFresh = late ? scaled(late.builds, o.deliveryScale ?? 1).map(b => rebase(b, row, o.delivered)) : [];
  const lateSweeps = lateFresh.map(b => sweepTails(b, o.final, late!.lateBy, lowest));
  const contSweep = o.cont ? sweepTails(o.cont, o.final, 0, lowest) : null;
  const out: FirstLeg[] = [];
  for (let target = lowest; target <= o.final; target++) {
    const fp = fastest(freshSweeps, fresh, target);
    const lp = late ? fastest(lateSweeps, lateFresh, target) : null;
    const onHour = fp
      ? { seconds: fp.sweep.seconds[fp.i] + (freshAt - o.start), endTE: fp.sweep.endTE[fp.i], delivered: eggsOf(fp.sweep, fp.i), build: fp.build }
      : null;
    const now = lp
      ? { seconds: lp.sweep.seconds[lp.i], endTE: lp.sweep.endTE[lp.i], delivered: eggsOf(lp.sweep, lp.i), build: lp.build }
      : null;
    const f = now && (!onHour || now.seconds < onHour.seconds) ? now : onHour;
    const ci = contSweep ? target - contSweep.from : -1;
    const c =
      contSweep && ci >= 0 && ci < contSweep.seconds.length && contSweep.seconds[ci] <= CONTINUE_MAX_SECONDS
        ? { seconds: contSweep.seconds[ci], endTE: contSweep.endTE[ci], delivered: eggsOf(contSweep, ci) }
        : null;
    const pick =
      c && (!f || c.seconds < f.seconds)
        ? { ...c, label: 'continue' }
        : f
          ? { seconds: f.seconds, endTE: f.endTE, delivered: f.delivered, label: `${f.build.sales}-sale${f.build.tier13 ? '-tier13' : ''}` }
          : null;
    if (pick) out.push({ to: target, endTE: pick.endTE, end: o.start + pick.seconds, delivered: pick.delivered, label: pick.label });
  }
  return out;
}
