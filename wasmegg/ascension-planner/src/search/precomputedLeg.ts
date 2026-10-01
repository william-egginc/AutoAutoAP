/**
 * A precomputed ascension: what a fresh ascension's expensive build leaves behind, kept as a few
 * numbers, and the exact arithmetic that turns those numbers into the time to any checkpoint.
 *
 * THE SPLIT. In the simulator a fresh ascension is a build (C1..R1, a C3 sale variant, H1, then K3's
 * vehicle purchases), and from there on it is waiting at the build's peak delivery rate:
 *   K3  on kindness, until the later of the sale ending and kindness's share of the goal;
 *   C4, I2, R2, H2  on curiosity, integrity, resilience, humility, each until its share,
 * with the goal re-shared before each wait among the eggs not yet visited (auto/ascension.ts
 * `runAscension`, auto/shifts/k3.ts, auto/shifts/te-wait.ts). Nothing after the build depends on the
 * calendar or on anything but those numbers, so `tailTo` replays it with the simulator's own helpers
 * (`distributeTargetTE`, `timeToEarnTE`, `computeTEEarned`) and gives the simulator's answer to the
 * second. scripts/precompute.ts checks that against `runAscensionFromC3Variant` on every checkpoint.
 *
 * Pinia-free on purpose: the site loads a table of these and prices whole routes in the browser.
 */
import { distributeTargetTE } from '@/auto/shifts/te-wait';
import { computeTEEarned, timeToEarnTE } from '@/auto/te-thresholds';
import { countTEThresholdsPassed, TE_BREAKPOINTS } from '@/lib/truthEggs';
import { getTimezoneOffsetAt, PACIFIC_TIMEZONE } from '@/lib/events';
import type { VirtueEgg } from '@/types';

/** The five eggs in table order; also the order `delivered` is stored in. */
export const EGG_ORDER: VirtueEgg[] = ['curiosity', 'kindness', 'integrity', 'resilience', 'humility'];
/** The waits after the build, in the simulator's order (`allShifts`: K3, C4, I2, R2, H2). */
const WAIT_ORDER: VirtueEgg[] = ['kindness', 'curiosity', 'integrity', 'resilience', 'humility'];

/** One C3 variant's build, as the tail needs it. Times are seconds from the ascension's start. */
export interface BuildParams {
  /** Sales the build waits through (1-3). */
  sales: number;
  /** Whether the build also reaches for the tier-13 unlock. */
  tier13: boolean;
  /** When K3's wait begins: the build and K3's purchases done. */
  waitStart: number;
  /** When the build's last sale ends (`buildPhaseEnd`): K3 waits at least this long. */
  saleEnd: number;
  /** The peak delivery rate every wait runs at, eggs per second. */
  peakELR: number;
  /** Eggs delivered on each egg when K3's wait begins, in `EGG_ORDER`. */
  delivered: number[];
}

export interface Tail {
  /** Seconds from the ascension's start to its end. */
  seconds: number;
  /** TE when it ends. Usually the checkpoint; more when K3's wait for the sale overshoots it. */
  endTE: number;
  /** Eggs delivered on each egg when it ends (EGG_ORDER): where the next ascension starts from. */
  delivered: number[];
}

/**
 * The eggs delivered on each egg (EGG_ORDER) at TE `te`, shared the way the simulator shares a goal
 * (cheapest next TE first, from nothing) with each egg exactly on its threshold. The table's every
 * build starts from this; `rebase` moves a build onto a player's real counts.
 */
const canonicalCache = new Map<number, number[]>();
export function canonicalDelivered(te: number): number[] {
  const hit = canonicalCache.get(te);
  if (hit) return hit;
  const zero = Object.fromEntries(EGG_ORDER.map(e => [e, 0])) as Record<VirtueEgg, number>;
  const perEgg = distributeTargetTE(zero, te);
  const out = EGG_ORDER.map(e => (perEgg[e] > 0 ? TE_BREAKPOINTS[perEgg[e] - 1] : 0));
  canonicalCache.set(te, out);
  return out;
}

/**
 * A table build (made from `canonicalDelivered(te)`) moved onto a player's own egg counts at the same
 * TE: the eggs the build itself delivers, added to theirs. The build's own eggs do not depend on where
 * the counts stood (it is driven by earnings, not by TE thresholds), so this is exact: down a 7-leg
 * route the moved builds matched the simulator leg for leg, where the canonical ones were up to two
 * days out (scripts/precompute.ts --debug-chain). Which eggs hold the odd TEs, and the eggs K3's wait
 * for the sale leaves on kindness, change the next ascension by about one TE's wait.
 */
export function rebase(b: BuildParams, te: number, delivered: number[]): BuildParams {
  const canon = canonicalDelivered(te);
  return { ...b, delivered: b.delivered.map((d, i) => delivered[i] + (d - canon[i])) };
}

/**
 * The time from the ascension's start to `target` total TE with this build (`runAscension`'s K3..H2
 * for a whole-TE goal), or null when the eggs cannot carry that much TE.
 *
 * `lateBy`: seconds into the table's hour the ascension really starts. The build's purchases take as
 * long either way, but the sale ends at a fixed moment, so it ends that much sooner after a late
 * start. (Exact at 0, which is what the table was built at; scripts/precompute.ts --verify-table
 * measures it in between.)
 */
export function tailTo(p: BuildParams, target: number, lateBy = 0): Tail | null {
  const delivered = Object.fromEntries(EGG_ORDER.map((e, i) => [e, p.delivered[i]])) as Record<VirtueEgg, number>;
  const locked: VirtueEgg[] = [];
  const saleEnd = p.saleEnd - lateBy;
  let t = p.waitStart;
  for (const egg of WAIT_ORDER) {
    const targets = distributeTargetTE(delivered, target, locked);
    const have = countTEThresholdsPassed(delivered[egg] || 0);
    const need = Math.max(0, targets[egg] - have);
    // K3 waits for the sale to end whatever the goal; the others only for their share.
    let wait = egg === 'kindness' ? Math.max(0, saleEnd - t) : 0;
    if (need > 0) {
      const teWait = timeToEarnTE(delivered[egg] || 0, p.peakELR, need);
      if (!Number.isFinite(teWait)) return null;
      wait = Math.max(wait, teWait);
    }
    if (wait > 0) {
      delivered[egg] = computeTEEarned(delivered[egg] || 0, p.peakELR, wait).finalEggsDelivered;
      t += wait;
    }
    locked.push(egg);
  }
  const endTE = EGG_ORDER.reduce((n, e) => n + countTEThresholdsPassed(delivered[e] || 0), 0);
  return endTE >= target ? { seconds: t, endTE, delivered: EGG_ORDER.map(e => delivered[e] || 0) } : null;
}

/** The fastest of a start's builds to `target`, as the app picks (`pickVariant`: least time, the
 *  first of equals). Null when none can reach it. */
export function bestTailTo(builds: BuildParams[], target: number, lateBy = 0): (Tail & { build: BuildParams }) | null {
  let best: (Tail & { build: BuildParams }) | null = null;
  for (const b of builds) {
    const t = tailTo(b, target, lateBy);
    if (t && (!best || t.seconds < best.seconds)) best = { ...t, build: b };
  }
  return best;
}

/** `distributeTargetTE`'s own egg order (auto/shifts/te-wait.ts ALL_VIRTUE_EGGS), which breaks ties,
 *  as positions in EGG_ORDER: curiosity, integrity, resilience, humility, kindness. */
const GREEDY_IDX = [0, 2, 3, 4, 1];
/** The four eggs after kindness, in the order they wait (C4, I2, R2, H2), as positions in EGG_ORDER. */
const OTHERS_IDX = [0, 2, 3, 4];
const KIND = 1;
const MAX_TE = TE_BREAKPOINTS.length;

/** `countTEThresholdsPassed` by halving: the thresholds rise (tested), so it is the same count. */
function countTE(d: number): number {
  let lo = 0;
  let hi = MAX_TE;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (d >= TE_BREAKPOINTS[mid]) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** `timeToEarnTE`, the same arithmetic. */
function teWait(d: number, rate: number, n: number): number {
  if (n <= 0) return 0;
  if (rate <= 0) return Infinity;
  const target = countTE(d) + n;
  if (target > MAX_TE) return Infinity;
  return Math.max(0, (TE_BREAKPOINTS[target - 1] - d) / rate + 0.001);
}

/**
 * The order `distributeTargetTE` hands out TEs one at a time from these counts (the cheapest next
 * threshold first, ties to its own egg order), among the eggs in `eggs` only, up to `max` of them, as
 * EGG_ORDER positions. Its result for a goal m TEs above where the counts stand is exactly the first
 * m of these.
 */
function greedyOrder(delivered: ArrayLike<number>, eggs: number[], max: number): Int8Array {
  const targets = [0, 0, 0, 0, 0];
  const at = [0, 0, 0, 0, 0];
  for (let e = 0; e < 5; e++) {
    at[e] = delivered[e] || 0;
    targets[e] = countTE(at[e]);
  }
  const order = GREEDY_IDX.filter(e => eggs.includes(e));
  const out = new Int8Array(max);
  let n = 0;
  while (n < max) {
    let best = -1;
    let bestCost = Infinity;
    for (const e of order) {
      const t = targets[e];
      if (t >= MAX_TE) continue;
      const cost = Math.max(0, TE_BREAKPOINTS[t] - at[e]);
      if (cost < bestCost) {
        bestCost = cost;
        best = e;
      }
    }
    if (best < 0) break;
    targets[best]++;
    at[best] = TE_BREAKPOINTS[targets[best] - 1];
    out[n++] = best;
  }
  return out.subarray(0, n);
}

/** Every checkpoint's tail from one build at once (`sweepTails`); index = checkpoint - `from`. */
export interface TailSweep {
  /** The first checkpoint asked for and the last. */
  from: number;
  to: number;
  /** Seconds to each checkpoint; NaN where it cannot be reached. */
  seconds: Float64Array;
  endTE: Int16Array;
  /** The end egg counts for checkpoint index `i` (EGG_ORDER), written into `out`. Worked out when
   *  asked rather than stored: a route search asks for few of them. */
  deliveredInto(i: number, out: number[] | Float64Array): void;
}

/**
 * `tailTo` for every checkpoint from `lowest` (default: one above where the counts stand) up to `top`
 * in one pass, the same numbers to the last bit (checked against it, search/precomputedLeg.spec.ts).
 * The goal-sharing `tailTo` redoes for each checkpoint hands out TEs one at a time, cheapest first,
 * so it is worked out once: kindness's share of a goal m TEs up is how many of the first m go to
 * kindness, and after kindness's wait the other four take the first TEs of the same order with
 * kindness left out. A build earns TEs of its own, so checkpoints at or below where it leaves the
 * counts are reached as soon as K3's wait for the sale is over. Plain number arrays throughout: a
 * route search runs tens of thousands of these.
 */
export function sweepTails(p: BuildParams, top: number, lateBy = 0, lowest?: number): TailSweep {
  const d = p.delivered;
  const c = [0, 0, 0, 0, 0];
  let now = 0;
  for (let e = 0; e < 5; e++) {
    c[e] = countTE(d[e] || 0);
    now += c[e];
  }
  const from = Math.min(now + 1, lowest ?? now + 1);
  const to = Math.max(from - 1, top);
  const n = to - from + 1;
  const seconds = new Float64Array(Math.max(0, n)).fill(NaN);
  const endTE = new Int16Array(Math.max(0, n));
  // Per checkpoint, what kindness and the other four were asked for: the end counts follow from them.
  const needKAt = new Int16Array(Math.max(0, n));
  const leftAt = new Int16Array(Math.max(0, n));
  if (n <= 0) return { from, to, seconds, endTE, deliveredInto: () => {} };

  const span = Math.max(0, to - now);
  const all = greedyOrder(d, GREEDY_IDX, span);
  // The four eggs' own order is the same order with kindness taken out: each egg's thresholds are its
  // own, and ties break the same way, so leaving one egg out does not reorder the rest. Of the first
  // m, the four are never asked for more than the five-egg order gave them (kindness only overshoots).
  const others = all.filter(e => e !== KIND);
  // kind[m]: kindness's TEs among the first m; per[e * (L + 1) + m]: egg e's among the first m of theirs.
  const kind = new Int16Array(all.length + 1);
  for (let i = 0; i < all.length; i++) kind[i + 1] = kind[i] + (all[i] === KIND ? 1 : 0);
  const L = others.length;
  const per = new Int16Array(5 * (L + 1));
  for (let i = 0; i < L; i++) {
    for (const e of OTHERS_IDX) per[e * (L + 1) + i + 1] = per[e * (L + 1) + i] + (others[i] === e ? 1 : 0);
  }
  const othersNow = c[0] + c[2] + c[3] + c[4];
  const saleEnd = p.saleEnd - lateBy;
  const rate = p.peakELR;
  const dk0 = d[KIND] || 0;
  const mandatory = Math.max(0, saleEnd - p.waitStart);

  // An egg's wait depends only on how many TEs it needs, and a goal asks each egg for a count
  // between 0 and a few hundred: each (egg, count) is worked out once, the arithmetic exactly as
  // above, and every checkpoint adds them up in the same order.
  // Kindness, per count asked of it: K3's wait, kindness's eggs after it, and the TE that leaves.
  const kWait = new Float64Array(all.length + 1).fill(NaN);
  const kEggs = new Float64Array(all.length + 1);
  const kTE = new Int16Array(all.length + 1);
  const kindFor = (need: number): boolean => {
    if (!Number.isNaN(kWait[need])) return Number.isFinite(kWait[need]);
    let wait = mandatory;
    if (need > 0) {
      const tw = teWait(dk0, rate, need);
      if (!Number.isFinite(tw)) {
        kWait[need] = Infinity;
        return false;
      }
      wait = Math.max(wait, tw);
    }
    kWait[need] = wait;
    kEggs[need] = wait > 0 ? dk0 + rate * wait : dk0;
    kTE[need] = countTE(kEggs[need]);
    return true;
  };
  // The other four, per count: the wait, the eggs after it, and the TE.
  const oWait = new Float64Array(5 * (L + 1)).fill(NaN);
  const oEggs = new Float64Array(5 * (L + 1));
  const oTE = new Int16Array(5 * (L + 1));
  const otherFor = (e: number, need: number): boolean => {
    const at = e * (L + 1) + need;
    if (!Number.isNaN(oWait[at])) return Number.isFinite(oWait[at]);
    const de = d[e] || 0;
    const tw = need > 0 ? teWait(de, rate, need) : 0;
    if (!Number.isFinite(tw)) {
      oWait[at] = Infinity;
      return false;
    }
    oWait[at] = tw;
    oEggs[at] = need > 0 && tw > 0 ? de + rate * tw : de;
    oTE[at] = countTE(oEggs[at]);
    return true;
  };

  for (let target = from; target <= to; target++) {
    const m = Math.max(0, target - now);
    if (m > all.length) break;
    // K3: the later of the sale ending and kindness's share.
    const needK = kind[m];
    if (!kindFor(needK)) continue;
    let t = p.waitStart;
    if (kWait[needK] > 0) t += kWait[needK];
    // C4, I2, R2, H2: the rest of the goal, with kindness where it ended.
    const left = target - kTE[needK] - othersNow;
    if (left > L) continue;
    let ok = true;
    let total = kTE[needK];
    for (const e of OTHERS_IDX) {
      const need = left > 0 ? per[e * (L + 1) + left] : 0;
      if (!otherFor(e, need)) {
        ok = false;
        break;
      }
      const at = e * (L + 1) + need;
      if (need > 0 && oWait[at] > 0) t += oWait[at];
      total += oTE[at];
    }
    if (!ok || total < target) continue;
    const i = target - from;
    seconds[i] = t;
    endTE[i] = total;
    needKAt[i] = needK;
    leftAt[i] = left;
  }
  const deliveredInto = (i: number, out: number[] | Float64Array): void => {
    const left = leftAt[i];
    for (const e of OTHERS_IDX) out[e] = oEggs[e * (L + 1) + (left > 0 ? per[e * (L + 1) + left] : 0)];
    out[KIND] = kEggs[needKAt[i]];
  };
  return { from, to, seconds, endTE, deliveredInto };
}

/** Hours in a week: the table's second key. */
export const WEEK_HOURS = 168;

/**
 * The Pacific hour of the week an instant falls in, 0 = Monday 00:00 Pacific. The game's weekly
 * events (the research sale, the Monday earnings boost) are at fixed Pacific times, daylight saving
 * included (lib/events.ts), so an ascension started at the same Pacific hour in any week meets them
 * at the same points.
 */
const offsetByDay = new Map<number, number | null>();
const offsetAtDayStart = new Map<number, number>();
function dayStartOffset(day: number): number {
  let o = offsetAtDayStart.get(day);
  if (o === undefined) {
    o = getTimezoneOffsetAt(PACIFIC_TIMEZONE, day * 86400);
    offsetAtDayStart.set(day, o);
  }
  return o;
}
const offsetByHour = new Map<number, number>();
/** Pacific's offset from UTC at an instant. It changes twice a year, on an hour boundary, so it is
 *  asked of the date formatter (slow: it was most of a route search's time) once per day, and per
 *  hour only on the two days it changes. */
function pacificOffset(unixSeconds: number): number {
  const day = Math.floor(unixSeconds / 86400);
  let whole = offsetByDay.get(day);
  if (whole === undefined) {
    // The same at the start of this day and the next: no change inside it (it changes twice a year).
    const a = dayStartOffset(day);
    const b = dayStartOffset(day + 1);
    whole = a === b ? a : null;
    offsetByDay.set(day, whole);
  }
  if (whole !== null) return whole;
  const h = Math.floor(unixSeconds / 3600);
  let offset = offsetByHour.get(h);
  if (offset === undefined) {
    offset = getTimezoneOffsetAt(PACIFIC_TIMEZONE, h * 3600);
    offsetByHour.set(h, offset);
  }
  return offset;
}

export function pacificHourOfWeek(unixSeconds: number): number {
  const local = unixSeconds + pacificOffset(unixSeconds);
  // 1970-01-01 was a Thursday: shift so the week starts on Monday.
  const hours = Math.floor(local / 3600) + 3 * 24;
  return ((hours % WEEK_HOURS) + WEEK_HOURS) % WEEK_HOURS;
}
