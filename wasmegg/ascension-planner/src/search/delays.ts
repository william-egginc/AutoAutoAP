/**
 * "TRY WAITING BEFORE EACH PRESTIGE" (18 Oct 2026; aaap-tools/partial-te-2026-10.md).
 *
 * A route's stops stay whole TE: a build's earnings and hatch rate grow 1.1x per WHOLE TE, so stopping
 * short of one always lost (19-31 h on the main's Egg Day route). But a fresh build always ends at its
 * last sale's end however early it starts, so its first hours earn little while the old farm is at its
 * peak, and keeping the old farm laying a few hours before prestiging can win a few hours (+3.6 h and
 * +1.9 h there). It is needle-sharp: the next waits along lost 20-120 h, when a later prestige then
 * landed on the wrong side of a sale. So waits are priced on the whole route, never chosen by a rule.
 *
 * This module is the search over waits, given something that prices a route with a list of waits
 * (search/chain.ts `EvaluateChainOptions.delays`, through the pool or the CLI's workers):
 *  1. ONE PRESTIGE AT A TIME: each prestige waited 1..maxHours whole hours, the others at once.
 *     For each, the best wait, its gain, and the needle warning: the worst loss within `near` hours
 *     either side of it (waiting 0 included), "off by 2 h costs 40 h".
 *  2. TOGETHER: greedy is fooled (waiting 12 h after the first stop made the next ascension end 12 h
 *     sooner and the route 25.7 h later), so coordinate descent on the whole route: from the better of
 *     the best single wait and every winning single wait together, each prestige's wait swept 0..max
 *     with the others held, in route order, until a pass changes nothing or `passes` run out. Then the
 *     needle warning around the answer. Every route priced once (a cache), so the cost is bounded:
 *     at most (n-1) x maxHours + 1 + passes x (n-1) x (maxHours + 1) + (n-1) x 2 x near routes.
 *
 * WHEN A WAIT IS SUGGESTED (19 Oct 2026, aaap-tools/notes/delay.md): on the main's save with the
 * player's hours, the best waits gained 44 min and waiting 3 h instead of 1 h after the first stop cost
 * 92 h. So a wait is suggested only when it gains more than WAIT_MIN_GAIN_SECONDS and the worst loss
 * within WAIT_RISK_HOURS either side stays under WAIT_RISK_RATIO times the gain (`waitVerdict`);
 * otherwise the answer is "prestige as soon as you reach it". Waits priced at any hour (no hours set)
 * gained 8.9 h there and lost it all once the shifts waited for the hours: callers warn.
 *
 * Pure: no workers, no store. Times are seconds from the plan start (ChainResult.seconds), lower
 * better; a route that cannot be priced is never better than one that can.
 */
import type { ChainResult } from './types';

/** Whole hours to wait before each prestige, entry i after stop i (length = stops - 1). */
export type Waits = number[];

/** Prices a batch of the same route with different waits; one result per set, null when unpriceable. */
export type WaitPricer = (sets: Waits[]) => Promise<(ChainResult | null)[]>;

export interface WaitSearchOptions {
  /** Longest wait tried, whole hours. Default 24. */
  maxHours?: number;
  /** Hours either side of a best wait the needle warning looks at. Default 3. */
  near?: number;
  /** Most coordinate-descent passes for the combined waits. Default 2. */
  passes?: number;
  /** Skip the combined search (singles only). */
  singlesOnly?: boolean;
  /** Called after each batch: routes priced so far, and the most the search could still price. */
  onProgress?: (done: number, most: number) => void;
  /** Checked between batches; true stops the search with what it has (`stopped`). */
  shouldStop?: () => boolean;
}

/** The needle warning: within `near` hours of a chosen wait, the wait that loses most against it. */
export interface NeedleWarning {
  /** The wait (whole hours) that loses most. */
  hours: number;
  /** How much later the route ends with it than with the chosen wait, seconds (> 0). */
  lossSeconds: number;
}

export interface SingleWait {
  /** 1-based: the prestige after stop `prestige` (the route's stop index, from 1). */
  prestige: number;
  /** The stop reached before this prestige (TE). */
  stop: number;
  /** When the stop is reached ascending at once (unix seconds), from the at-once route; null if unknown. */
  reachedAt: number | null;
  /** The best wait in whole hours, 0 when no wait beats prestiging at once. */
  bestHours: number;
  /** Seconds sooner the route ends with it than with no wait (0 when none wins). */
  gainSeconds: number;
  /** The worst nearby wait, or null when none within `near` hours loses. */
  needle: NeedleWarning | null;
  /** The worst loss within WAIT_RISK_HOURS of the best wait (for `waitVerdict`). */
  risk: NeedleWarning | null;
  /** The route's seconds for each wait 0..maxHours (null: unpriceable). */
  curve: (number | null)[];
}

export interface CombinedWaits {
  waits: Waits;
  seconds: number;
  gainSeconds: number;
  /** For each prestige with its wait moved alone by up to `near` hours, the worst loss (null: none loses). */
  needles: (NeedleWarning | null)[];
  /** For each prestige, the worst loss within WAIT_RISK_HOURS of its wait (for `waitVerdict`). */
  risks: (NeedleWarning | null)[];
  /** When each stop is reached under these waits (unix seconds), then the prestige at reached + wait. */
  reachedAt: (number | null)[];
  /** Passes the descent ran, and whether the last changed nothing (a local best for single moves). */
  passes: number;
  settled: boolean;
}

export interface WaitReport {
  chain: number[];
  /** The route ascending at once (no waits): its seconds, or null when it cannot be priced. */
  baseSeconds: number | null;
  singles: SingleWait[];
  combined: CombinedWaits | null;
  /** Routes priced (distinct wait sets), and the bound the options allowed. */
  priced: number;
  bound: number;
  stopped: boolean;
}

/** The most routes `searchWaits` can price for a route with `stops` stops. */
export function waitSearchBound(stops: number, o: WaitSearchOptions = {}): number {
  const n = Math.max(0, stops - 1);
  const max = o.maxHours ?? 24;
  const near = o.near ?? 3;
  const passes = o.passes ?? 2;
  const singles = n * max + 1;
  const win = Math.max(near, WAIT_RISK_HOURS);
  return o.singlesOnly ? singles : singles + 1 + passes * n * (max + 1) + n * (2 * win + 1);
}

/** The legs a priced wait set re-simulates, roughly: every ascension after the first wait. For estimates. */
export function waitSearchLegs(stops: number, o: WaitSearchOptions = {}): number {
  const n = Math.max(0, stops - 1);
  const max = o.maxHours ?? 24;
  // Singles: a wait after stop p re-simulates the n - p ascensions after it.
  let legs = stops;
  for (let p = 1; p <= n; p++) legs += max * (stops - p);
  if (o.singlesOnly) return legs;
  const passes = o.passes ?? 2;
  const near = Math.max(o.near ?? 3, WAIT_RISK_HOURS);
  for (let p = 1; p <= n; p++) legs += (passes * (max + 1) + 2 * near) * (stops - p);
  return legs + stops;
}

/** A wait must gain more than this to be suggested: half an hour. */
export const WAIT_MIN_GAIN_SECONDS = 1800;
/** How far either side of a suggested wait the risk check looks, hours. */
export const WAIT_RISK_HOURS = 2;
/** The worst loss within WAIT_RISK_HOURS must be under this many times the gain. */
export const WAIT_RISK_RATIO = 3;

/** Whether a wait is worth suggesting: `risk` is the worst loss within WAIT_RISK_HOURS of it. */
export function waitVerdict(gainSeconds: number, risk: NeedleWarning | null): 'wait' | 'tooSmall' | 'tooRisky' {
  if (!(gainSeconds > WAIT_MIN_GAIN_SECONDS)) return 'tooSmall';
  if (risk && risk.lossSeconds >= WAIT_RISK_RATIO * gainSeconds) return 'tooRisky';
  return 'wait';
}

const keyOf = (w: Waits) => w.join(',');
const zeros = (n: number): Waits => Array.from({ length: n }, () => 0);
const better = (a: number | null | undefined, b: number | null | undefined) =>
  a != null && (b == null || a < b);

/** Within `near` hours of `best` on a curve of seconds by wait, the worst loss against it. Prestiging at
 *  once (wait 0) is left out: what it loses is the gain itself, already reported. */
export function needleOf(curve: (number | null | undefined)[], best: number, near: number): NeedleWarning | null {
  const at = curve[best];
  if (at == null) return null;
  let worst: NeedleWarning | null = null;
  for (let w = Math.max(0, best - near); w <= Math.min(curve.length - 1, best + near); w++) {
    if (w === best || w === 0) continue;
    const s = curve[w];
    // An unpriceable neighbour is not a loss we can size; leave it out.
    if (s == null) continue;
    const loss = s - at;
    if (loss > 0 && (!worst || loss > worst.lossSeconds)) worst = { hours: w, lossSeconds: loss };
  }
  return worst;
}

/** When each stop is reached, from a priced route's legs: only when each step is one leg (no time off). */
export function reachedTimes(r: ChainResult | null | undefined, stops: number): (number | null)[] {
  if (!r || r.legs.length !== stops) return Array.from({ length: stops }, () => null);
  return r.legs.map(l => (Number.isFinite(l.endTime) ? (l.endTime as number) : null));
}

export async function searchWaits(chain: number[], price: WaitPricer, o: WaitSearchOptions = {}): Promise<WaitReport> {
  const n = Math.max(0, chain.length - 1);
  const max = Math.max(1, Math.floor(o.maxHours ?? 24));
  const near = Math.max(0, Math.floor(o.near ?? 3));
  const passes = Math.max(0, Math.floor(o.passes ?? 2));
  const bound = waitSearchBound(chain.length, { ...o, maxHours: max, near, passes });
  const cache = new Map<string, ChainResult | null>();
  let stopped = false;

  /** Price the sets not yet priced, in one batch; then read every one from the cache. */
  async function run(sets: Waits[]): Promise<(number | null)[]> {
    const todo: Waits[] = [];
    const seen = new Set<string>();
    for (const s of sets) {
      const k = keyOf(s);
      if (!cache.has(k) && !seen.has(k)) {
        seen.add(k);
        todo.push(s);
      }
    }
    if (todo.length && !stopped) {
      if (o.shouldStop?.()) stopped = true;
      else {
        const got = await price(todo);
        todo.forEach((s, i) => cache.set(keyOf(s), got[i] ?? null));
        o.onProgress?.(cache.size, bound);
      }
    }
    return sets.map(s => cache.get(keyOf(s))?.seconds ?? null);
  }
  const secondsOf = (w: Waits) => cache.get(keyOf(w))?.seconds ?? null;
  const with1 = (base: Waits, p: number, h: number) => base.map((x, i) => (i === p ? h : x));

  // 1. The route at once, and each prestige's waits alone, in one batch.
  const base = zeros(n);
  const singleSets: Waits[] = [base];
  for (let p = 0; p < n; p++) for (let h = 1; h <= max; h++) singleSets.push(with1(base, p, h));
  await run(singleSets);
  const baseSeconds = secondsOf(base);
  const reached = reachedTimes(cache.get(keyOf(base)), chain.length);

  const singles: SingleWait[] = [];
  for (let p = 0; p < n; p++) {
    const curve: (number | null)[] = [];
    for (let h = 0; h <= max; h++) curve.push(secondsOf(with1(base, p, h)));
    let bestHours = 0;
    for (let h = 1; h <= max; h++) if (better(curve[h], curve[bestHours])) bestHours = h;
    const gain = baseSeconds != null && curve[bestHours] != null ? baseSeconds - (curve[bestHours] as number) : 0;
    singles.push({
      prestige: p + 1,
      stop: chain[p],
      reachedAt: reached[p],
      bestHours,
      gainSeconds: Math.max(0, gain),
      needle: needleOf(curve, bestHours, near),
      risk: needleOf(curve, bestHours, WAIT_RISK_HOURS),
      curve,
    });
  }

  if (o.singlesOnly || n === 0 || baseSeconds == null) {
    return { chain: [...chain], baseSeconds, singles, combined: null, priced: cache.size, bound, stopped };
  }

  // 2. Together. Start from the better of the best single wait and every winning single together.
  const winners = singles.filter(s => s.gainSeconds > 0);
  let cur: Waits = base;
  if (winners.length) {
    const top = winners.reduce((a, b) => (b.gainSeconds > a.gainSeconds ? b : a));
    const one = with1(base, top.prestige - 1, top.bestHours);
    const all = base.map((_, i) => singles[i].bestHours);
    await run([all]);
    cur = better(secondsOf(all), secondsOf(one)) ? all : one;
  }
  let ran = 0;
  let settled = false;
  for (; ran < passes && !stopped; ) {
    ran++;
    let changed = false;
    for (let p = 0; p < n && !stopped; p++) {
      const sets: Waits[] = [];
      for (let h = 0; h <= max; h++) sets.push(with1(cur, p, h));
      const got = await run(sets);
      let pick = cur[p];
      for (let h = 0; h <= max; h++) if (better(got[h], got[pick])) pick = h;
      if (pick !== cur[p]) {
        cur = with1(cur, p, pick);
        changed = true;
      }
    }
    if (!changed) {
      settled = true;
      break;
    }
  }

  // 3. The needle warning around the answer: each wait moved alone by up to `near` hours (and at
  //    least WAIT_RISK_HOURS, for the risk check).
  const win = Math.max(near, WAIT_RISK_HOURS);
  const around: Waits[] = [];
  for (let p = 0; p < n; p++)
    for (let h = Math.max(0, cur[p] - win); h <= Math.min(max, cur[p] + win); h++) around.push(with1(cur, p, h));
  await run(around);
  const curves = cur.map((w, p) => {
    const curve: (number | null)[] = [];
    for (let h = 0; h <= Math.min(max, w + win); h++)
      curve.push(Math.abs(h - w) <= win ? secondsOf(with1(cur, p, h)) : null);
    return curve;
  });
  const needles = curves.map((c, p) => needleOf(c, cur[p], near));
  const risks = curves.map((c, p) => needleOf(c, cur[p], WAIT_RISK_HOURS));
  const seconds = secondsOf(cur);
  const combined: CombinedWaits | null =
    seconds == null
      ? null
      : {
          waits: cur,
          seconds,
          gainSeconds: Math.max(0, baseSeconds - seconds),
          needles,
          risks,
          reachedAt: reachedTimes(cache.get(keyOf(cur)), chain.length),
          passes: ran,
          settled,
        };
  return { chain: [...chain], baseSeconds, singles, combined, priced: cache.size, bound, stopped };
}

/** Hours, as a player reads them: "3.6 h", "40 h", "25 min". */
export function hoursText(seconds: number): string {
  const h = seconds / 3600;
  if (h < 1) return `${Math.max(1, Math.round(seconds / 60))} min`;
  return `${h < 100 ? Math.round(h * 10) / 10 : Math.round(h)} h`;
}

/** "Off by 2 h costs 40 h" for a needle, or null when nothing nearby loses enough to mention. */
export function needleText(n: NeedleWarning | null, chosenHours: number, minLossSeconds = 3600): string | null {
  if (!n || n.lossSeconds < minLossSeconds) return null;
  const off = Math.abs(n.hours - chosenHours);
  const which = n.hours === 0 ? 'prestiging at once' : `waiting ${n.hours} h`;
  return `needle-sharp: ${which} (off by ${off} h) costs ${hoursText(n.lossSeconds)}`;
}

/** "2 h later costs 92 h" / "1 h sooner costs 18 h" (prestiging that much off the time shown). */
export function slipText(n: NeedleWarning | null, chosenHours: number): string | null {
  if (!n || n.lossSeconds <= 0) return null;
  const off = n.hours - chosenHours;
  return `${Math.abs(off)} h ${off > 0 ? 'later' : 'sooner'} costs ${hoursText(n.lossSeconds)}`;
}

/** Shown above the suggestions when they were priced without the player's hours. */
export const ANY_HOUR_WARNING =
  'These waits assume you can shift eggs at any hour. Set your hours in Setup first: with real hours, long waits usually lose.';

/** What the "Try waiting before each prestige" panel says about each prestige, and about the waits together. */
export interface WaitLines {
  singles: { stop: number; text: string; warn: string | null; wait: boolean }[];
  together: string | null;
  togetherWarns: string[];
}

/** Why a wait that wins is still not suggested, or null when it is. */
function holdBack(gainSeconds: number, risk: NeedleWarning | null, chosenHours: number): string | null {
  const v = waitVerdict(gainSeconds, risk);
  if (v === 'tooSmall') return `waiting ${chosenHours} h gains only ${hoursText(gainSeconds)}`;
  if (v === 'tooRisky') return `waiting ${chosenHours} h gains ${hoursText(gainSeconds)}, but ${slipText(risk, chosenHours)}`;
  return null;
}

/** The report in a player's words; `show` formats an instant (12-hour, the player's zone). A wait is
 *  suggested only when `waitVerdict` says so; otherwise "prestige as soon as you reach it". */
export function waitLines(r: WaitReport, show: (t: number) => string): WaitLines {
  const singles = r.singles.map(s => {
    const reached = s.reachedAt != null ? ` (reached ${show(s.reachedAt)})` : '';
    const atOnce = `After ${s.stop}${reached}: prestige as soon as you reach it.`;
    if (!s.bestHours || s.gainSeconds <= 0) return { stop: s.stop, text: `${atOnce} No wait helps.`, warn: null, wait: false };
    const why = holdBack(s.gainSeconds, s.risk, s.bestHours);
    if (why) return { stop: s.stop, text: `${atOnce} (${capital(why)}.)`, warn: null, wait: false };
    const at = s.reachedAt != null ? `prestige at ${show(s.reachedAt + s.bestHours * 3600)} (wait ${s.bestHours} h)` : `wait ${s.bestHours} h`;
    return {
      stop: s.stop,
      text: `After ${s.stop}${reached}: ${at}. Finishes ${hoursText(s.gainSeconds)} sooner.`,
      warn: sharpText(s.needle, s.bestHours),
      wait: true,
    };
  });
  const c = r.combined;
  let together: string | null = null;
  const togetherWarns: string[] = [];
  if (c && c.gainSeconds > 0 && c.waits.some(w => w > 0)) {
    // Every wait in the set must pass, against the set's whole gain.
    const why = c.waits.map((w, i) => (w > 0 ? holdBack(c.gainSeconds, c.risks[i], w) : null));
    const firstWhy = why.findIndex(x => !!x);
    if (firstWhy >= 0) {
      together = `Together: prestige as soon as you reach each stop. (The best waits together gain ${hoursText(c.gainSeconds)}${
        waitVerdict(c.gainSeconds, null) === 'tooSmall' ? '' : `, but after ${r.chain[firstWhy]}, ${slipText(c.risks[firstWhy], c.waits[firstWhy])}`
      }.)`;
    } else {
      const parts = c.waits
        .map((w, i) =>
          w > 0
            ? c.reachedAt[i] != null
              ? `after ${r.chain[i]}, prestige at ${show(c.reachedAt[i]! + w * 3600)} (wait ${w} h)`
              : `wait ${w} h after ${r.chain[i]}`
            : null
        )
        .filter((x): x is string => !!x);
      together = `Together: ${parts.join('; ')}. Finishes ${hoursText(c.gainSeconds)} sooner than prestiging at once.`;
      c.waits.forEach((w, i) => {
        const t = w > 0 ? sharpText(c.needles[i], w) : null;
        if (t) togetherWarns.push(`After ${r.chain[i]}: ${t}`);
      });
    }
  } else if (c) together = 'Together: no set of waits beats prestiging as soon as you reach each stop.';
  return { singles, together, togetherWarns };
}

const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** "Needle-sharp: 2 h later costs 92 h." Null below an hour. */
function sharpText(n: NeedleWarning | null, chosen: number): string | null {
  if (!n || n.lossSeconds < 3600) return null;
  return `Needle-sharp: ${slipText(n, chosen)}.`;
}
