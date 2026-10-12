/**
 * PRESTIGE BY (experimental, off for players: composables/usePrestigeBy.ts). The instant answer says
 * where the next prestige is (now, or when the first stop is reached); this works out how long that
 * prestige can wait before the answer gets worse, as one line under the answer:
 *
 *   Prestige by Fri Nov 27, 2 pm to keep 248 TE (3 pm at the latest, on the hour).
 *   After that: 247 (until about Sun Nov 29, 3 pm), then 246.
 *
 * HOW (the design in aaap-tools/prestige-by-timeline-alt.md, checked on the alt's timeline).
 *   1. The estimate: the prestige moved h whole hours later, for every h up to a horizon, with the
 *      eggs the farm lays while it waits (`Laying`, capped at what its silos hold, so a player who is
 *      away is not credited more) and the TE those eggs carry. At each hour the routes the instant
 *      answer already found are priced again on the table from there (`estimateProfile`): arithmetic,
 *      a fraction of a second for the whole profile.
 *   2. The confirmation: the first hour the estimate drops is looked up with the route finder itself
 *      (findRoutes and its polish), and the hour before it too (`findCutoff`): 2 to 4 lookups. Any
 *      route priced on the table that keeps the TE proves the hour keeps it, so an hour only counts as
 *      a drop when the estimate and the finder both say so; a finder route that keeps it where the
 *      estimate did not is added to the estimate's routes and the walk goes on.
 *   3. What is shown: the first drop. The answer does not fall steadily (on the alt, one-hour 248s
 *      came back after the drop, and 246 hours sat inside a 247 stretch), so the hours after the first
 *      drop are never offered as a window, and the stretch after it ends at the first drop that lasts
 *      two hours or more (one-hour flukes skipped). The "by" time is a whole hour, one before the last
 *      start that keeps it, so a few minutes late still keeps it.
 *
 * Every start is on the whole hour, as the instant answer prices its ascensions (inside the weekly
 * research sale a start right away is also priced late from its own hour, routeFinder.ts
 * `startInSale`); minutes-late pricing outside the sale is not exact (routeFinder.ts ON THE HOUR), so
 * the line says "on the hour" instead.
 */
import { countTEThresholdsPassed } from '@/lib/truthEggs';
import { pacificHourOfWeek, rebase, sweepTails, type BuildParams } from './precomputedLeg';
import {
  nextHour,
  priceChain,
  startInSale,
  type BuildLookup,
  type FirstLeg,
  type FoundRoutes,
  type PolishOptions,
  type PricedPrefix,
  type Route,
} from './routeFinder';

export type PrestigeMode = 'date' | 'fastest';

/** Hours ahead the estimate looks (8 days): past the ~7 days the line is shown for. */
export const HORIZON_HOURS = 192;
/** Route-finder lookups at most (the design's 2-4). */
export const MAX_LOOKUPS = 4;
/** Fastest route: a later prestige "keeps" the answer while it reaches the target at most this much
 *  later (a minute's rounding on the hour, not a slip). */
export const FASTEST_SLACK_SECONDS = 3600;
/** Shown when the next prestige is this close... */
export const SHOW_WITHIN_SECONDS = 7 * 86400;
/** ...or the window to keep the answer is this short. */
export const SHOW_WINDOW_SECONDS = 48 * 3600;
/** Less spare than this at the last start that keeps the TE: "tight". */
export const TIGHT_SPARE_SECONDS = 12 * 3600;

/** The farm laying while the prestige waits: `rate` eggs a second on egg `egg` (EGG_ORDER), for at most
 *  `capSeconds` (what the silos hold while the player is away; Infinity for a farm played all along). */
export interface Laying {
  egg: number;
  rate: number;
  capSeconds: number;
}

/** The eggs after waiting `seconds` from `delivered`. */
export function eggsAfter(delivered: number[], laying: Laying | null, seconds: number): number[] {
  const out = [...delivered];
  if (laying && laying.rate > 0 && seconds > 0 && laying.egg >= 0 && laying.egg < out.length)
    out[laying.egg] += laying.rate * Math.min(seconds, laying.capSeconds);
  return out;
}

/** The TE a set of egg counts carries. */
export function teOfEggs(eggs: number[]): number {
  return eggs.reduce((a, x) => a + countTEThresholdsPassed(x || 0), 0);
}

/**
 * The farm left laying at the end of a first ascension that continues the farm or builds it up: the egg
 * it ends on at its peak rate (FirstLeg `egg`, `peakELR`). Without those, the eggs it delivers on its
 * way to the next checkpoint of the same kind, over that time, on the egg that gets the most of them.
 * Null when neither can be read (frozen then).
 */
export function layingAfterFirstLeg(firstLegs: FirstLeg[], to: number, capSeconds: number): Laying | null {
  const a = firstLegs.find(f => f.to === to);
  if (!a) return null;
  // The first ascension's own farm when it says (the egg it ends on, its peak rate).
  if (a.egg !== undefined && a.peakELR !== undefined && a.peakELR > 0)
    return { egg: a.egg, rate: a.peakELR, capSeconds };
  const b = firstLegs.find(f => f.to > to && f.label === a.label && f.end > a.end);
  if (!b) return null;
  let egg = -1;
  let most = 0;
  let total = 0;
  b.delivered.forEach((x, i) => {
    const d = x - (a.delivered[i] ?? 0);
    if (d > 0) total += d;
    if (d > most) {
      most = d;
      egg = i;
    }
  });
  if (egg < 0) return null;
  return { egg, rate: total / (b.end - a.end), capSeconds };
}

/** The start a prestige `h` hours late means: right away at h = 0 (on the next whole hour, or late from
 *  its own hour inside the sale), then each whole hour after that. */
export function startOf(prestigeAt: number, h: number): number {
  return h === 0 ? prestigeAt : nextHour(prestigeAt) + h * 3600;
}
/** The whole hour that start is priced at (the hour the line names). */
export function hourOf(prestigeAt: number, h: number): number {
  return nextHour(startOf(prestigeAt, h));
}

/** What a prestige at one hour gets: By a date, the highest TE by the date and when it lands (null:
 *  no route above the start TE in time); Fastest, when the target is reached (null: never). */
export interface Outcome {
  te: number;
  end: number | null;
}

export function keeps(
  mode: PrestigeMode,
  keep: Outcome,
  o: Outcome | null | undefined,
  slack = FASTEST_SLACK_SECONDS
): boolean {
  if (!o) return false;
  if (mode === 'date') return o.te >= keep.te;
  return o.end !== null && keep.end !== null && o.end <= keep.end + slack;
}

/** The better of two outcomes (higher TE then sooner; Fastest: sooner). */
export function better(
  mode: PrestigeMode,
  a: Outcome | null | undefined,
  b: Outcome | null | undefined
): Outcome | null {
  if (!a) return b ?? null;
  if (!b) return a;
  if (mode === 'date') {
    if (a.te !== b.te) return a.te > b.te ? a : b;
    if (a.end === null) return b;
    if (b.end === null) return a;
    return a.end <= b.end ? a : b;
  }
  if (a.end === null) return b;
  if (b.end === null) return a;
  return a.end <= b.end ? a : b;
}

/** What the estimate is asked (plain data: it runs on a route worker). */
export interface EstimateRequest {
  mode: PrestigeMode;
  /** Unix second of the prestige right away: the plan start (a fresh first ascension) or when the
   *  first stop is reached. */
  prestigeAt: number;
  /** TE and eggs (EGG_ORDER) at that moment. */
  startTE: number;
  delivered: number[];
  laying: Laying | null;
  final: number;
  deadline?: number;
  deliveryScale: number;
  /** The routes to price again from each hour: their checkpoints after the prestige. */
  candidates: number[][];
  /** The profile covers h = from..hours (from: 0 when left out). */
  hours: number;
  from?: number;
}

/** Where a prestige `h` hours late starts: the time, the TE and the eggs. */
export function startStateAt(
  req: Pick<EstimateRequest, 'prestigeAt' | 'startTE' | 'delivered' | 'laying'>,
  h: number
): { start: number; startTE: number; delivered: number[] } {
  const start = startOf(req.prestigeAt, h);
  const delivered = eggsAfter(req.delivered, req.laying, start - req.prestigeAt);
  return { start, startTE: Math.max(Math.floor(req.startTE), teOfEggs(delivered)), delivered };
}

/**
 * The last ascension from (te, t, eggs) to the highest TE it reaches by the deadline, priced as the
 * finder prices one (on the next whole hour, or late from its own hour inside the sale): one sweep of
 * every checkpoint up to `top` per build.
 */
function highestByDeadline(
  table: BuildLookup,
  te: number,
  t: number,
  eggs: number[],
  deadline: number,
  top: number,
  scale: number
): Outcome | null {
  const options: { start: number; lateBy: number; builds: BuildParams[] }[] = [];
  const at = nextHour(t);
  const raw = table(te, pacificHourOfWeek(at));
  if (raw?.length) options.push({ start: at, lateBy: 0, builds: raw });
  const late = at !== t ? startInSale(table, te, t) : null;
  if (late) options.push({ start: t, ...late });
  let best: Outcome | null = null;
  for (const o of options)
    for (const b of o.builds) {
      const moved = rebase(scale === 1 ? b : { ...b, peakELR: b.peakELR * scale }, te, eggs);
      const sw = sweepTails(moved, top, o.lateBy, te + 1);
      for (let i = sw.seconds.length - 1; i >= 0; i--) {
        const s = sw.seconds[i];
        if (Number.isNaN(s)) continue;
        const end = o.start + s;
        if (end > deadline) continue;
        // The finder keys an arrival at the target when a sale wait overshoots it.
        best = better('date', best, { te: Math.min(sw.endTE[i], top), end });
        break;
      }
    }
  return best;
}

/**
 * The estimate at one hour: every candidate route priced again on the table from the prestige `h`
 * hours late. By a date: each route's every prefix (the stops at or below the start TE dropped), then
 * a last ascension to as high as it gets by the date; the best of all. Fastest: each route to the
 * target, the soonest.
 */
export function estimateAt(table: BuildLookup, req: EstimateRequest, h: number): Outcome {
  const s = startStateAt(req, h);
  const o: PolishOptions = {
    startTE: s.startTE,
    start: s.start,
    startDelivered: s.delivered,
    deliveryScale: req.deliveryScale,
  };
  const memo = new Map<string, PricedPrefix | null>();
  const chains = dedupe(req.candidates.map(c => c.filter(x => x > s.startTE)));
  if (req.mode === 'fastest') {
    let best: Outcome = { te: 0, end: null };
    for (const c of chains) {
      if (!c.length || c[c.length - 1] !== req.final) continue;
      const r = priceChain(table, o, c, memo);
      if (r) best = better('fastest', best, { te: req.final, end: r.end })!;
    }
    return best;
  }
  const deadline = req.deadline ?? Infinity;
  let best: Outcome = { te: s.startTE, end: null };
  const tried = new Set<string>();
  for (const c of chains)
    for (let j = c.length - 1; j >= 0; j--) {
      const prefix = c.slice(0, j);
      const k = prefix.join(',');
      if (tried.has(k)) continue;
      tried.add(k);
      let at = { t: s.start, te: s.startTE, eggs: s.delivered };
      if (prefix.length) {
        const r = priceChain(table, o, prefix, memo);
        if (!r || r.end > deadline) continue;
        const te = Math.min(r.legs[r.legs.length - 1].endTE, req.final);
        best = better('date', best, { te, end: r.end })!;
        const m = memo.get(k);
        if (!m) continue;
        at = { t: m.t, te: m.te, eggs: m.eggs };
      }
      const last = highestByDeadline(table, at.te, at.t, at.eggs, deadline, req.final, req.deliveryScale);
      best = better('date', best, last)!;
    }
  return best;
}

function dedupe(chains: number[][]): number[][] {
  const seen = new Set<string>();
  return chains.filter(c => {
    const k = c.join(',');
    if (!c.length || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** The estimate for h = from..hours (index 0 is hour `from`). */
export function estimateProfile(table: BuildLookup, req: EstimateRequest): Outcome[] {
  const from = req.from ?? 0;
  return Array.from({ length: Math.max(0, req.hours - from + 1) }, (_, i) => estimateAt(table, req, from + i));
}

/** Split hours from..to into up to `n` runs of about the same size, for the route workers. */
export function splitHours(from: number, to: number, n: number): [number, number][] {
  const total = to - from + 1;
  const parts = Math.max(1, Math.min(n, total));
  const out: [number, number][] = [];
  let a = from;
  for (let i = 0; i < parts; i++) {
    const size = Math.floor(total / parts) + (i < total % parts ? 1 : 0);
    if (size <= 0) continue;
    out.push([a, a + size - 1]);
    a += size;
  }
  return out;
}

/** The candidate routes in a finder's answer, as the checkpoints after the prestige: each count's
 *  route and (`others`) the other routes it kept, without the first stop when the first ascension is
 *  the player's own (continue or build-up) rather than a fresh one. */
export function candidatesOf(found: FoundRoutes, mode: PrestigeMode, freshFirst: boolean, others = true): number[][] {
  const routes: (Route | null)[] =
    mode === 'date'
      ? [found.byDate, ...found.byDateByAscensions, ...(others ? (found.dateAlternatives ?? []).flat() : [])]
      : [found.best, ...found.byAscensions, ...(others ? (found.alternatives ?? []).flat() : [])];
  return dedupe(routes.filter((r): r is Route => !!r).map(r => (freshFirst ? [...r.chain] : r.chain.slice(1))));
}

/** A finder's answer as an outcome (`startTE`: where it started, the TE By a date when nothing gets
 *  above it). By a date the TE is the finder's own (at most `final`, as it keys an arrival). */
export function outcomeOf(
  found: Pick<FoundRoutes, 'best' | 'byDate'>,
  mode: PrestigeMode,
  startTE: number,
  final = 490
): Outcome {
  if (mode === 'date') {
    const r = found.byDate;
    return r
      ? { te: Math.min(r.legs[r.legs.length - 1].endTE, final), end: r.end }
      : { te: Math.floor(startTE), end: null };
  }
  return { te: found.best ? found.best.chain[found.best.chain.length - 1] : 0, end: found.best?.end ?? null };
}

export interface CutoffOptions {
  mode: PrestigeMode;
  /** What prestiging right away gets (the instant answer's own route). */
  keep: Outcome;
  hours: number;
  /** The estimate for h = from..hours (index 0 is hour `from`), with these routes added to the
   *  candidates. */
  profile: (extra: number[][], from: number) => Promise<Outcome[]> | Outcome[];
  /** The route finder's answer at hour h, and its routes (checkpoints after the prestige; each
   *  count's is enough, as every hour's estimate prices them all again). */
  exact: (h: number) => Promise<{ outcome: Outcome; chains: number[][] }>;
  maxLookups?: number;
  /** Lookups at most in all, the stretch after the drop included (default `maxLookups` + 3). */
  maxTotalLookups?: number;
  slack?: number;
}

export interface Cutoff {
  /** 'drop': the first drop found and confirmed; 'none': kept through the horizon; 'unsure': the
   *  lookups ran out before a drop was confirmed (the last start known to keep it is still right). */
  kind: 'drop' | 'none' | 'unsure';
  keep: Outcome;
  /** The last delay (hours) known to keep the answer, and the best outcome known there. */
  lastKeep: number;
  lastKeepOutcome: Outcome | null;
  /** The first delay that does not (lastKeep + 1), and what it gets; null without a confirmed drop. */
  drop: number | null;
  dropOutcome: Outcome | null;
  /** By a date, after the drop: the last hour the dropped TE holds (two-hour drops only; the hour it
   *  ends looked up with the finder while lookups remain), and what comes after it; null when it holds
   *  through the horizon. */
  next: { until: number; then: Outcome } | null;
  /** The first drop the estimate alone saw (null: none), for checking it later. */
  estimateDrop: number | null;
  lookups: number;
  /** The hours the route finder looked up, and what it found. */
  looked: { h: number; outcome: Outcome }[];
}

/** The first h >= from where `at(h)` does not keep the answer, or -1. */
function firstDrop(n: number, from: number, ok: (h: number) => boolean): number {
  for (let h = from; h < n; h++) if (!ok(h)) return h;
  return -1;
}

/**
 * The first lasting change after `from` in a stretch at `level`: the first hour that falls below it
 * for two hours running (a single hour below, or a single hour back above, is a fluke and skipped).
 */
export function stretchEnd(
  mode: PrestigeMode,
  level: Outcome,
  at: (h: number) => Outcome | null,
  from: number,
  n: number,
  slack = FASTEST_SLACK_SECONDS
): { until: number; then: Outcome } | null {
  for (let g = from; g + 1 < n; g++) {
    const a = at(g);
    const b = at(g + 1);
    if (!keeps(mode, level, a, slack) && !keeps(mode, level, b, slack)) {
      // What comes after: the better of the two hours (both below the stretch).
      const then = better(mode, a, b);
      return then ? { until: g - 1, then } : null;
    }
  }
  return null;
}

/**
 * THE CUTOFF: the first hour a later prestige gets less than prestiging right away, the estimate
 * walked forward and each drop it shows confirmed by the route finder (`CutoffOptions.exact`).
 */
export async function findCutoff(opts: CutoffOptions): Promise<Cutoff> {
  const { mode, keep } = opts;
  const slack = opts.slack ?? FASTEST_SLACK_SECONDS;
  const max = opts.maxLookups ?? MAX_LOOKUPS;
  const maxTotal = opts.maxTotalLookups ?? max + 3;
  const n = opts.hours + 1;
  const extra: number[][] = [];
  const prof: Outcome[] = [];
  /** The estimate again from hour `from` on, with the routes found so far. */
  const reprofile = async (from: number) => {
    const p = await opts.profile(extra, from);
    p.forEach((o, i) => (prof[from + i] = o));
  };
  await reprofile(0);
  const known = new Map<number, Outcome>();
  const looked: { h: number; outcome: Outcome }[] = [];
  // The best known at each hour: any route priced on the table is one the player can take.
  const at = (h: number): Outcome | null =>
    h === 0 ? better(mode, keep, prof[0]) : better(mode, prof[h], known.get(h));
  const ok = (h: number) => keeps(mode, keep, at(h), slack);
  const estFirst = firstDrop(n, 1, h => keeps(mode, keep, prof[h], slack));
  const estimateDrop = estFirst < 0 ? null : estFirst;
  const look = async (h: number) => {
    const r = await opts.exact(h);
    known.set(h, r.outcome);
    looked.push({ h, outcome: r.outcome });
    return r;
  };
  const result = (
    kind: Cutoff['kind'],
    lastKeep: number,
    drop: number | null,
    next: Cutoff['next'] = null
  ): Cutoff => ({
    kind,
    keep,
    lastKeep,
    lastKeepOutcome: at(lastKeep),
    drop,
    dropOutcome: drop === null ? null : at(drop),
    next,
    estimateDrop,
    lookups: looked.length,
    looked,
  });
  let from = 1;
  for (;;) {
    const d = firstDrop(n, from, ok);
    if (d < 0) return result('none', n - 1, null);
    if (looked.length >= max) return result('unsure', d - 1, null);
    const r = await look(d);
    if (keeps(mode, keep, r.outcome, slack)) {
      // The estimate missed a route that keeps it: price that one from the later hours too.
      extra.push(...r.chains);
      if (d + 1 < n) await reprofile(d + 1);
      from = d + 1;
      continue;
    }
    // A drop, by both. The hour before it keeps it already (a priced route does); it is looked up
    // too while lookups remain, for the finder's spare there.
    if (d - 1 >= 1 && !known.has(d - 1) && looked.length < max) await look(d - 1);
    // After the drop, By a date: its TE's stretch, the drop's own routes priced from the later hours
    // too, and the hour the estimate says it ends looked up while lookups remain.
    let next: Cutoff['next'] = null;
    const level = at(d);
    if (mode === 'date' && level) {
      extra.push(...r.chains);
      if (d + 1 < n) await reprofile(d + 1);
      for (;;) {
        next = stretchEnd(mode, level, at, d + 1, n, slack);
        if (!next || looked.length >= maxTotal) break;
        const g = next.until + 1;
        if (known.has(g)) break;
        const r2 = await look(g);
        if (!keeps(mode, level, r2.outcome, slack)) {
          // The hour after too, while lookups remain: a single hour below is a fluke.
          if (g + 1 < n && !known.has(g + 1) && looked.length < maxTotal) {
            const r3 = await look(g + 1);
            if (keeps(mode, level, r3.outcome, slack)) {
              extra.push(...r3.chains);
              if (g + 2 < n) await reprofile(g + 2);
              continue;
            }
          }
          next = stretchEnd(mode, level, at, d + 1, n, slack);
          break;
        }
        extra.push(...r2.chains);
        if (g + 1 < n) await reprofile(g + 1);
      }
    }
    return result('drop', d - 1, d, next);
  }
}

/** Where the next prestige is and what it starts from, for an instant answer's route. */
export interface PrestigePlan {
  mode: PrestigeMode;
  /** A fresh first ascension (the prestige is now) or the player's own (continue, build-up: the
   *  prestige is when its first stop is reached). */
  fresh: boolean;
  prestigeAt: number;
  firstStop: number;
  startTE: number;
  delivered: number[];
  laying: Laying | null;
  keep: Outcome;
  candidates: number[][];
}

/**
 * The prestige the line is about, read off the instant answer: its route's first ascension, the eggs
 * there (the save's for a fresh one, the first ascension's end for continue or build-up), how the farm
 * lays while it waits (`farm`: the save's farm, for a fresh prestige; continue and build-up lay at the
 * rate they end on, capped at `siloSeconds`), what prestiging right away gets, and the routes to price
 * again. Null without a route.
 */
export function prestigePlan(o: {
  mode: PrestigeMode;
  found: FoundRoutes;
  firstLegs: FirstLeg[] | null;
  planStart: number;
  startTE: number;
  saveDelivered: number[];
  farm: Laying | null;
  siloSeconds: number;
  /** 'frozen': the farm adds nothing while it waits (the cautious model). */
  eggs?: 'frozen' | 'silo' | 'laying';
}): PrestigePlan | null {
  const route = o.mode === 'date' ? o.found.byDate : o.found.best;
  if (!route?.legs.length) return null;
  const first = route.legs[0];
  const own = first.label === 'continue' || first.label === 'buildup';
  const f = own ? o.firstLegs?.find(x => x.to === first.to) : null;
  if (own && !f) return null;
  const eggs = o.eggs ?? 'silo';
  let laying: Laying | null =
    eggs === 'frozen' ? null : own ? layingAfterFirstLeg(o.firstLegs ?? [], first.to, o.siloSeconds) : o.farm;
  if (laying && eggs === 'laying') laying = { ...laying, capSeconds: Infinity };
  return {
    mode: o.mode,
    fresh: !own,
    prestigeAt: own ? first.end : o.planStart,
    firstStop: first.to,
    startTE: own ? first.endTE : Math.floor(o.startTE),
    delivered: own ? [...f!.delivered] : [...o.saveDelivered],
    laying,
    keep: outcomeOf(o.found, o.mode, o.startTE),
    candidates: candidatesOf(o.found, o.mode, !own),
  };
}

/** How the line reads, worked out from the cutoff (`describeCutoff`). */
export interface LineContext {
  mode: PrestigeMode;
  /** The prestige right away (unix second), and whether it is a fresh first ascension (prestige now)
   *  or the end of continuing/building up (prestige when the first stop is reached). */
  prestigeAt: number;
  fresh: boolean;
  /** The TE of the first stop (not fresh). */
  firstStop: number;
  now: number;
  deadline?: number;
  final: number;
  show: (unix: number) => string;
}

export interface PrestigeLine {
  /** False: not shown (too far off with a wide window, or nothing changes within the horizon). */
  show: boolean;
  text: string;
  tight: boolean;
  /** The hour named, and the last whole-hour start that keeps the answer. */
  byHour: number;
  latestHour: number;
  /** Spare at the latest start (By a date). */
  spareSeconds: number | null;
  /** Hidden only because the next prestige is more than ~7 days away with a wide window: the hour it
   *  would name, written out, so the beta site can say the line is there and waiting. */
  farOff?: string;
}

function span(seconds: number): string {
  const h = Math.round(seconds / 3600);
  if (h < 48) return `${h} h`;
  return `${(seconds / 86400).toFixed(1)} days`;
}

/**
 * THE DISPLAY RULES. Shown only when the next prestige is within ~7 days or the window to keep the
 * answer is under ~48 h (a far-off prestige with days of room has nothing to say yet), and only for a
 * confirmed drop or a lookup that ran out (then "to be sure of"). "Tight" under 12 h of spare at the
 * latest start that keeps it.
 */
export function describeCutoff(c: Cutoff, ctx: LineContext): PrestigeLine {
  const latestHour = hourOf(ctx.prestigeAt, Math.max(0, c.lastKeep));
  const byHour = latestHour - 3600;
  const spareSeconds =
    ctx.mode === 'date' && ctx.deadline !== undefined && c.lastKeepOutcome?.end != null
      ? ctx.deadline - c.lastKeepOutcome.end
      : null;
  const tight = spareSeconds !== null && spareSeconds < TIGHT_SPARE_SECONDS;
  const none: PrestigeLine = { show: false, text: '', tight, byHour, latestHour, spareSeconds };
  if (c.kind === 'none' || c.lastKeep < 0) return none;
  const soon = ctx.prestigeAt - ctx.now <= SHOW_WITHIN_SECONDS;
  const narrow = latestHour - ctx.prestigeAt < SHOW_WINDOW_SECONDS;
  if (!soon && !narrow) return { ...none, farOff: ctx.show(byHour) };
  const right = byHour < ctx.prestigeAt;
  const lead = right
    ? ctx.fresh
      ? 'Prestige now'
      : `Prestige as soon as you reach ${ctx.firstStop} TE`
    : `Prestige by ${ctx.show(byHour)}`;
  const latest = `${ctx.show(latestHour)} at the latest, on the hour`;
  let text: string;
  if (ctx.mode === 'date') {
    text = `${lead} to ${c.kind === 'unsure' ? 'be sure of' : 'keep'} ${c.keep.te} TE (${latest}).`;
    const d = c.dropOutcome;
    if (c.kind === 'drop' && d) {
      text += ` After that: ${d.te}`;
      if (c.next && c.next.until > (c.drop ?? 0))
        text += ` (until about ${ctx.show(hourOf(ctx.prestigeAt, c.next.until))}), then ${c.next.then.te}`;
      else if (c.next) text += `, then ${c.next.then.te}`;
      text += '.';
    }
  } else {
    const on = c.keep.end !== null ? ` on ${ctx.show(c.keep.end)}` : '';
    text = `${lead} to ${c.kind === 'unsure' ? 'be sure to reach' : 'still reach'} ${ctx.final} TE${on} (${latest}).`;
    const d = c.dropOutcome;
    if (c.kind === 'drop' && d?.end != null && c.keep.end !== null)
      text += ` After that: ${ctx.show(d.end)} (${span(d.end - c.keep.end)} later).`;
    else if (c.kind === 'drop' && d && d.end === null) text += ` After that it doesn't reach ${ctx.final}.`;
  }
  return { show: true, text, tight, byHour, latestHour, spareSeconds };
}

/** The prediction kept in an opt-in instant record (search/instantRecord.ts), to check later against
 *  what players' next saves and checks show. */
export interface PrestigeByRecord {
  v: 1;
  mode: PrestigeMode;
  /** How the waiting farm was counted. */
  eggs: 'frozen' | 'silo' | 'laying';
  prestigeAt: number;
  fresh: boolean;
  keepTE: number;
  keepEnd: number | null;
  kind: Cutoff['kind'];
  /** Unix seconds: the last whole-hour start that keeps it, and the first that does not. */
  latest: number;
  drop: number | null;
  dropTE: number | null;
  dropEnd: number | null;
  /** By a date, the dropped TE's stretch (estimate). */
  until: number | null;
  thenTE: number | null;
  spareHours: number | null;
  tight: boolean;
  shown: boolean;
  estimateDropHours: number | null;
  lookups: number;
}

export function recordOfCutoff(
  c: Cutoff,
  line: PrestigeLine,
  ctx: Pick<LineContext, 'mode' | 'prestigeAt' | 'fresh'>,
  eggs: PrestigeByRecord['eggs']
): PrestigeByRecord {
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return {
    v: 1,
    mode: ctx.mode,
    eggs,
    prestigeAt: Math.round(ctx.prestigeAt),
    fresh: ctx.fresh,
    keepTE: c.keep.te,
    keepEnd: c.keep.end === null ? null : Math.round(c.keep.end),
    kind: c.kind,
    latest: line.latestHour,
    drop: c.drop === null ? null : hourOf(ctx.prestigeAt, c.drop),
    dropTE: c.dropOutcome ? c.dropOutcome.te : null,
    dropEnd: c.dropOutcome?.end != null ? Math.round(c.dropOutcome.end) : null,
    until: c.next ? hourOf(ctx.prestigeAt, c.next.until) : null,
    thenTE: c.next ? c.next.then.te : null,
    spareHours: line.spareSeconds === null ? null : r2(line.spareSeconds / 3600),
    tight: line.tight,
    shown: line.show,
    estimateDropHours: c.estimateDrop,
    lookups: c.lookups,
  };
}
