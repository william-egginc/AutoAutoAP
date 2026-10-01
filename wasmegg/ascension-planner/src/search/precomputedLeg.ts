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

/** `distributeTargetTE`'s own egg order (auto/shifts/te-wait.ts ALL_VIRTUE_EGGS): it breaks ties. */
const GREEDY_ORDER: VirtueEgg[] = ['curiosity', 'integrity', 'resilience', 'humility', 'kindness'];
const MAX_TE = TE_BREAKPOINTS.length;
const OTHERS: VirtueEgg[] = ['curiosity', 'integrity', 'resilience', 'humility'];

/** `countTEThresholdsPassed` by halving: the thresholds rise, so it is the same count. */
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
 * threshold first, ties to GREEDY_ORDER), among `eggs` only, up to `max` of them. Its result for a
 * goal m TEs above where the counts stand is exactly the first m of these.
 */
function greedyOrder(delivered: Record<VirtueEgg, number>, eggs: VirtueEgg[], max: number): VirtueEgg[] {
  const targets = Object.fromEntries(GREEDY_ORDER.map(e => [e, countTE(delivered[e] || 0)])) as Record<
    VirtueEgg,
    number
  >;
  const at = { ...delivered };
  const out: VirtueEgg[] = [];
  const order = GREEDY_ORDER.filter(e => eggs.includes(e));
  while (out.length < max) {
    let best: VirtueEgg | null = null;
    let bestCost = Infinity;
    for (const e of order) {
      const t = targets[e];
      if (t >= MAX_TE) continue;
      const cost = Math.max(0, TE_BREAKPOINTS[t] - (at[e] || 0));
      if (cost < bestCost) {
        bestCost = cost;
        best = e;
      }
    }
    if (!best) break;
    targets[best]++;
    at[best] = TE_BREAKPOINTS[targets[best] - 1];
    out.push(best);
  }
  return out;
}

/** Every checkpoint's tail from one build at once (`sweepTails`); index = checkpoint - `from`. */
export interface TailSweep {
  /** The first checkpoint (one above the TE the counts start at) and the last. */
  from: number;
  to: number;
  /** Seconds to each checkpoint; NaN where it cannot be reached. */
  seconds: Float64Array;
  endTE: Int16Array;
  /** End egg counts, five per checkpoint (EGG_ORDER). */
  delivered: Float64Array;
}

/**
 * `tailTo` for every checkpoint from `lowest` (default: one above where the counts stand) up to `top`
 * in one pass, the same numbers to the last bit (checked
 * against it, search/precomputedLeg.spec.ts). The goal-sharing `tailTo` redoes for each checkpoint
 * hands out TEs one at a time, cheapest first, so it is worked out once: kindness's share of a goal
 * m TEs up is how many of the first m go to kindness, and after kindness's wait the other four take
 * the first TEs of the same order with kindness left out. A route search prices hundreds of
 * checkpoints from each build, so this is what makes it quick.
 */
export function sweepTails(p: BuildParams, top: number, lateBy = 0, lowest?: number): TailSweep {
  const d = Object.fromEntries(EGG_ORDER.map((e, i) => [e, p.delivered[i]])) as Record<VirtueEgg, number>;
  const c = Object.fromEntries(EGG_ORDER.map(e => [e, countTE(d[e] || 0)])) as Record<VirtueEgg, number>;
  const now = EGG_ORDER.reduce((n, e) => n + c[e], 0);
  // A build can earn TEs itself, so checkpoints at or below where it leaves the counts are asked for
  // too (`lowest`): each is reached as soon as K3's wait for the sale is over.
  const from = Math.min(now + 1, lowest ?? now + 1);
  const to = Math.max(from - 1, top);
  const n = to - from + 1;
  const seconds = new Float64Array(n).fill(NaN);
  const endTE = new Int16Array(n);
  const delivered = new Float64Array(n * 5);
  if (n <= 0) return { from, to, seconds, endTE, delivered };

  const all = greedyOrder(d, GREEDY_ORDER, n);
  const others = greedyOrder(d, OTHERS, n);
  // kind[m]: kindness's TEs among the first m; per[e][m]: each other egg's among the first m of theirs.
  const kind = new Int16Array(all.length + 1);
  for (let i = 0; i < all.length; i++) kind[i + 1] = kind[i] + (all[i] === 'kindness' ? 1 : 0);
  const per = Object.fromEntries(OTHERS.map(e => [e, new Int16Array(others.length + 1)])) as Record<
    VirtueEgg,
    Int16Array
  >;
  for (let i = 0; i < others.length; i++) {
    for (const e of OTHERS) per[e][i + 1] = per[e][i] + (others[i] === e ? 1 : 0);
  }
  const othersNow = OTHERS.reduce((s, e) => s + c[e], 0);
  const saleEnd = p.saleEnd - lateBy;
  const kIdx = EGG_ORDER.indexOf('kindness');

  for (let target = from; target <= to; target++) {
    const m = Math.max(0, target - now);
    if (m > all.length) break;
    // K3: the later of the sale ending and kindness's share.
    let t = p.waitStart;
    let wait = Math.max(0, saleEnd - t);
    const needK = kind[m];
    if (needK > 0) {
      const tw = teWait(d.kindness || 0, p.peakELR, needK);
      if (!Number.isFinite(tw)) continue;
      wait = Math.max(wait, tw);
    }
    let dk = d.kindness || 0;
    if (wait > 0) {
      dk = dk + p.peakELR * wait;
      t += wait;
    }
    // C4, I2, R2, H2: the rest of the goal, with kindness where it ended.
    const left = target - countTE(dk) - othersNow;
    if (left > others.length) continue;
    const at = d;
    let ok = true;
    const ends: Partial<Record<VirtueEgg, number>> = {};
    for (const e of WAIT_ORDER) {
      if (e === 'kindness') continue;
      const need = left > 0 ? per[e][left] : 0;
      let de = at[e] || 0;
      if (need > 0) {
        const tw = teWait(de, p.peakELR, need);
        if (!Number.isFinite(tw)) {
          ok = false;
          break;
        }
        if (tw > 0) {
          de = de + p.peakELR * tw;
          t += tw;
        }
      }
      ends[e] = de;
    }
    if (!ok) continue;
    let total = countTE(dk);
    for (const e of OTHERS) total += countTE(ends[e]!);
    if (total < target) continue;
    const i = target - from;
    seconds[i] = t;
    endTE[i] = total;
    for (let k = 0; k < EGG_ORDER.length; k++) {
      delivered[i * 5 + k] = k === kIdx ? dk : ends[EGG_ORDER[k]]!;
    }
  }
  return { from, to, seconds, endTE, delivered };
}

/** Hours in a week: the table's second key. */
export const WEEK_HOURS = 168;

/**
 * The Pacific hour of the week an instant falls in, 0 = Monday 00:00 Pacific. The game's weekly
 * events (the research sale, the Monday earnings boost) are at fixed Pacific times, daylight saving
 * included (lib/events.ts), so an ascension started at the same Pacific hour in any week meets them
 * at the same points.
 */
export function pacificHourOfWeek(unixSeconds: number): number {
  const local = unixSeconds + getTimezoneOffsetAt(PACIFIC_TIMEZONE, unixSeconds);
  // 1970-01-01 was a Thursday: shift so the week starts on Monday.
  const hours = Math.floor(local / 3600) + 3 * 24;
  return ((hours % WEEK_HOURS) + WEEK_HOURS) % WEEK_HOURS;
}
