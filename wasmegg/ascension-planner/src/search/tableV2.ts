/**
 * Table version 2: every build of version 1 (search/precomputedTable.ts), plus the numbers the page
 * needs to replay a build's tail under the player's hours without simulating it again.
 *
 * WHY. With hours picked, Check exactly holds every egg shift until the player is around, the farm
 * laying the egg it is on meanwhile (auto/hold.ts `holdForPlayer`). A version 1 build has what the
 * tail's waits need (when K3's wait begins, the sale's end, the peak rate, the eggs), but not when
 * H1's and K3's shifts happen or what the farm lays while one of them waits. Version 2 stores those,
 * and `replayTail` then gives the held tail's arrival with the same arithmetic `tailTo` uses.
 *
 * WHAT IS NOT STORED, AND WHY. The rate in each tail segment: it is peakELR on every egg, waiting
 * or held (measured, --v2-check). The instant each later shift (C4, I2, R2, H2) starts and the egg
 * counts each egg is asked for depend on the target TE (the goal is re-shared before each wait), so
 * they are worked out here per target, from the thresholds (the header's `teThresholds`, the same
 * list as lib/truthEggs.ts TE_BREAKPOINTS) and the stored rates. Stored per target they would be the
 * table times ~370.
 *
 * Pure on purpose (no simulator, no Pinia): the site can load it beside the finder.
 */
import { EGG_ORDER, type BuildParams, type Tail, type TailSweep } from './precomputedLeg';
import { TE_BREAKPOINTS } from '@/lib/truthEggs';

/** The nine numbers of a version 1 build, in file order. */
export const V1_FIELDS = [
  'flags',
  'waitStart',
  'saleEnd',
  'peakELR',
  'delivered.curiosity',
  'delivered.kindness',
  'delivered.integrity',
  'delivered.resilience',
  'delivered.humility',
] as const;

/** Version 2's numbers per build, in file order: version 1's nine, then the extras. The header
 *  carries this list (`fields`); a reader takes the stride from it. */
export const V2_FIELDS = [
  ...V1_FIELDS,
  'layRate',
  'shipRate',
  'h1At',
  'h1Rate',
  'k3At',
  'k3Rate',
  'waitEgg',
] as const;

/** A version 2 build's extra numbers. Times are seconds from the ascension's start; rates eggs per
 *  second. */
export interface BuildExtras {
  /** The K3 farm's lay rate and shipping rate (`computeRealisticELR`); peakELR is the smaller. Kept
   *  apart for the weak-gear scale (row shift x sqrt(lay ratio x ship ratio)). */
  layRate: number;
  shipRate: number;
  /** When H1's shift to humility happens (C3 done), and the rate the farm lays C3's egg (curiosity)
   *  at then, which a hold before it credits. */
  h1At: number;
  h1Rate: number;
  /** When K3's shift to kindness happens (H1 done), and the rate the farm lays humility at then. K3's
   *  vehicle purchases take `waitStart - k3At` after it. */
  k3At: number;
  k3Rate: number;
  /** The egg that waits for the sale (EGG_ORDER index): kindness (1) as usual, humility (4) when K3
   *  would buy nothing and H1 takes the wait over (auto/ascension.ts). The replay models only 1. */
  waitEgg: number;
}

export type BuildV2 = BuildParams & { extras: BuildExtras };

/** Write a build's numbers into `out` at `at` (version 2 order). */
export function writeV2(out: Float64Array, at: number, b: BuildParams, x: BuildExtras): void {
  out[at] = b.sales + (b.tier13 ? 8 : 0);
  out[at + 1] = b.waitStart;
  out[at + 2] = b.saleEnd;
  out[at + 3] = b.peakELR;
  for (let e = 0; e < EGG_ORDER.length; e++) out[at + 4 + e] = b.delivered[e];
  out[at + 9] = x.layRate;
  out[at + 10] = x.shipRate;
  out[at + 11] = x.h1At;
  out[at + 12] = x.h1Rate;
  out[at + 13] = x.k3At;
  out[at + 14] = x.k3Rate;
  out[at + 15] = x.waitEgg;
}

/** A build's extras from the file's numbers at `at` (version 2 order). */
export function readExtras(body: Float64Array, at: number): BuildExtras {
  return {
    layRate: body[at + 9],
    shipRate: body[at + 10],
    h1At: body[at + 11],
    h1Rate: body[at + 12],
    k3At: body[at + 13],
    k3Rate: body[at + 14],
    waitEgg: body[at + 15],
  };
}

/** The waits after the build, in the simulator's order (precomputedLeg.ts WAIT_ORDER), as EGG_ORDER
 *  positions: kindness, curiosity, integrity, resilience, humility. */
const WAIT_IDX = [1, 0, 2, 3, 4];
/** distributeTargetTE's tie order (auto/shifts/te-wait.ts ALL_VIRTUE_EGGS) as EGG_ORDER positions. */
const GREEDY_IDX = [0, 2, 3, 4, 1];
const C = 0;
const K = 1;
const H = 4;

function countTE(d: number, thresholds: readonly number[]): number {
  let lo = 0;
  let hi = thresholds.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (d >= thresholds[mid]) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** auto/shifts/te-wait.ts `distributeTargetTE` on EGG_ORDER arrays: each unlocked egg's TE goal for a
 *  total of `target`, the cheapest next threshold first from where the counts stand. */
function shareGoal(delivered: number[], target: number, locked: boolean[], thresholds: readonly number[]): number[] {
  const goal = delivered.map(d => countTE(d, thresholds));
  const at = delivered.slice();
  let left = target - goal.reduce((a, b) => a + b, 0);
  while (left > 0) {
    let best = -1;
    let bestCost = Infinity;
    for (const e of GREEDY_IDX) {
      if (locked[e] || goal[e] >= thresholds.length) continue;
      const cost = Math.max(0, thresholds[goal[e]] - at[e]);
      if (cost < bestCost) {
        bestCost = cost;
        best = e;
      }
    }
    if (best < 0) break;
    goal[best]++;
    at[best] = thresholds[goal[best] - 1];
    left--;
  }
  return goal;
}

/** auto/te-thresholds.ts `timeToEarnTE`, the same arithmetic. */
function teWait(d: number, rate: number, n: number, thresholds: readonly number[]): number {
  if (n <= 0) return 0;
  if (rate <= 0) return Infinity;
  const target = countTE(d, thresholds) + n;
  if (target > thresholds.length) return Infinity;
  return Math.max(0, (thresholds[target - 1] - d) / rate + 0.001);
}

export interface ReplayOptions {
  /** Unix seconds the ascension starts (the table cell's hour, or the player's real start). */
  start: number;
  /** When the player is next around at or after unix second `t` (search/availability.ts
   *  `nextAvailable` on their hours); `t` itself when they are. Absent: hours off, no holds. */
  holdUntil?: (t: number) => number;
  /** Seconds into the table's hour the ascension really starts (`tailTo`'s `lateBy`). */
  lateBy?: number;
  /** The TE thresholds (the header's `teThresholds`); default lib/truthEggs.ts TE_BREAKPOINTS. */
  thresholds?: readonly number[];
  /**
   * 'table' (default): the tail as `tailTo` times it, kindness waiting for the sale in every build,
   * so with hours off the replay is the instant answer's own number to the bit.
   * 'simulator': as auto/ascension.ts runs it, which differs for a build whose `waitEgg` is humility
   * (H1 waits for the sale on humility, then K3, C4, I2, R2 are plain waits and H2 drops out). There
   * `tailTo`, and so the table, can be a TE's wait off the simulator (--v2-check measures it).
   */
  order?: 'table' | 'simulator';
}

export interface ReplayResult extends Tail {
  /** Seconds the shifts waited for the player, in all. */
  heldSeconds: number;
  /** Each shift the tail makes, from H1's on: its egg (EGG_ORDER index) and seconds from the start. */
  shifts: { egg: number; at: number }[];
}

/**
 * A version 2 build's tail to `target` total TE with the player's hours: the moment the ascension
 * ends, as auto/ascension.ts `runAscension` (resumed at H1, as the table's cells are) would time it
 * with `holdUntil` set, or null when the eggs cannot carry that much TE.
 *
 * Before each shift to another egg (H1, K3, then C4, I2, R2, H2 in turn) the shift waits for the
 * player; meanwhile the farm lays the egg it is on (at h1Rate, k3Rate, then peakELR) and those eggs
 * count. In the tail the farm lays every egg at peakELR when held (nothing is bought after K3; the
 * generator's --v2-check measured the simulator's hold rate there equal to peakELR on every egg). The
 * goal is re-shared after each hold, as the simulator does. With `holdUntil` absent and the default
 * order this is `tailTo` to the bit (tableV2.spec.ts).
 *
 * Approximate in one place: H1 and K3's purchases are taken to last as long after a hold as without
 * one (the bank grows while held, so they may be a little shorter in the simulator). The build before
 * C3's end is not replayed at all: holds there (the opening's shifts, C3's) move the sale timing and
 * are not in a table cell.
 */
export function replayTail(p: BuildParams, x: BuildExtras, target: number, o: ReplayOptions): ReplayResult | null {
  const thresholds = o.thresholds ?? TE_BREAKPOINTS;
  const d = p.delivered.slice();
  const saleEnd = p.saleEnd - (o.lateBy ?? 0);
  const shifts: { egg: number; at: number }[] = [];
  const humility = o.order === 'simulator' && x.waitEgg === H;
  let held = 0;
  // A hold before a shift at `t` (seconds from the start) with the farm on `egg` laying at `rate`.
  const hold = (t: number, egg: number, rate: number): number => {
    if (!o.holdUntil) return 0;
    const now = o.start + t;
    const wait = o.holdUntil(now) - now;
    if (!(wait > 0)) return 0;
    d[egg] = d[egg] + rate * wait;
    held += wait;
    return wait;
  };
  // H1 (from C3's egg, curiosity), then K3 (from humility) unless H1 waits for the sale itself: the
  // build's last shifts. A hold before either moves everything after it later by as much.
  let shift = hold(x.h1At, C, x.h1Rate);
  shifts.push({ egg: H, at: x.h1At + shift });
  let current = H;
  if (!humility) {
    shift += hold(x.k3At + shift, H, x.k3Rate);
    shifts.push({ egg: K, at: x.k3At + shift });
    current = K;
  }
  let t = p.waitStart + shift;

  // The waits in order: the sale's egg first, then the rest in the simulator's order (K3, C4, I2,
  // R2, H2) without it.
  const first = humility ? H : K;
  const order = [first, ...WAIT_IDX.filter(e => e !== first)];
  const locked = [false, false, false, false, false];
  for (const egg of order) {
    // The hold comes before the goal is shared (auto/ascension.ts), for every shift to another egg,
    // even one that then has nothing to wait for. The first wait's shift was held above.
    if (egg !== first && current !== egg) t += hold(t, current, p.peakELR);
    const goal = shareGoal(d, target, locked, thresholds);
    const have = countTE(d[egg], thresholds);
    const need = Math.max(0, goal[egg] - have);
    let wait = egg === first ? Math.max(0, saleEnd - t) : 0;
    if (need > 0) {
      const w = teWait(d[egg], p.peakELR, need, thresholds);
      if (!Number.isFinite(w)) return null;
      wait = Math.max(wait, w);
    }
    // runTEWaitShift shifts only when the egg has something to earn; the first one always has.
    if (egg !== first && need > 0 && current !== egg) {
      current = egg;
      shifts.push({ egg, at: t });
    }
    if (wait > 0) {
      d[egg] = d[egg] + p.peakELR * wait;
      t += wait;
    }
    locked[egg] = true;
  }
  const endTE = d.reduce((n, x) => n + countTE(x, thresholds), 0);
  return endTE >= target ? { seconds: t, endTE, delivered: d, heldSeconds: held, shifts } : null;
}

/** The fastest of a cell's builds to `target` with the player's hours (`bestTailTo`'s pick: least
 *  time, the first of equals). */
export function bestReplay(
  builds: { params: BuildParams; extras: BuildExtras }[],
  target: number,
  o: ReplayOptions
): (ReplayResult & { index: number }) | null {
  let best: (ReplayResult & { index: number }) | null = null;
  builds.forEach((b, index) => {
    const r = replayTail(b.params, b.extras, target, o);
    if (r && (!best || r.seconds < best.seconds)) best = { ...r, index };
  });
  return best;
}

/** Version 2's numbers attached to a build as the finder carries it (search/routeFinder.ts): the
 *  table's `lookup` gives plain builds, `withExtras` (precomputedTable.ts) these. Moving a build onto
 *  other counts (`rebase`) or another delivery rate keeps them. */
export type BuildWithExtras = BuildParams & { extras?: BuildExtras };

/** A sweep of held tails (`sweepReplay`): what `TailSweep` gives, plus per checkpoint the egg the
 *  farm is on when the tail ends (EGG_ORDER) and the seconds its shifts waited for the player. */
export interface ReplaySweep extends TailSweep {
  lastEgg: Int8Array;
  held: Float64Array;
}

/** The order the goal hands out TEs one at a time from counts `d` (shareGoal's greedy, every egg),
 *  as EGG_ORDER positions, up to `max` of them. Among any subset of the eggs the order is this one
 *  with the others left out: each egg's costs are its own, and ties break the same way. */
function greedyOrderOf(d: number[], max: number, thresholds: readonly number[]): Int8Array {
  const goal = d.map(x => countTE(x, thresholds));
  const at = d.slice();
  const out = new Int8Array(Math.max(0, max));
  let n = 0;
  while (n < max) {
    let best = -1;
    let bestCost = Infinity;
    for (const e of GREEDY_IDX) {
      if (goal[e] >= thresholds.length) continue;
      const cost = Math.max(0, thresholds[goal[e]] - at[e]);
      if (cost < bestCost) {
        bestCost = cost;
        best = e;
      }
    }
    if (best < 0) break;
    goal[best]++;
    at[best] = thresholds[goal[best] - 1];
    out[n++] = best;
  }
  return out.subarray(0, n);
}

/**
 * `replayTail` for every checkpoint from `lowest` (default one above where the counts stand) to `top`
 * at once, the same numbers to the bit (tableV2.spec.ts), as `sweepTails` is `tailTo`'s. The route
 * finder prices a whole start's checkpoints from one of these when the player's hours hold the shifts.
 *
 * WHY IT CAN BE SWEPT. H1's and K3's holds come before any goal is shared, so they are the same for
 * every checkpoint. After them, a hold only ever adds eggs to the egg the farm is on, which has had
 * its wait (it is locked), and a wait only to its own egg, which is then locked: the eggs still to
 * wait keep the counts they had after K3's hold. So each goal-sharing hands out TEs in one fixed order
 * (the greedy order from those counts, the locked eggs left out) and needs only how many there are to
 * hand out; that is worked out once per start, and each checkpoint then costs a few steps.
 */
export function sweepReplay(
  p: BuildParams,
  x: BuildExtras,
  top: number,
  o: ReplayOptions & { lowest?: number }
): ReplaySweep {
  const thresholds = o.thresholds ?? TE_BREAKPOINTS;
  const d0 = p.delivered.slice();
  const saleEnd = p.saleEnd - (o.lateBy ?? 0);
  const humility = o.order === 'simulator' && x.waitEgg === H;
  const rate = p.peakELR;
  const holdAt = (t: number): number => {
    if (!o.holdUntil) return 0;
    const now = o.start + t;
    const wait = o.holdUntil(now) - now;
    return wait > 0 ? wait : 0;
  };
  // H1's hold and K3's: the same for every checkpoint.
  let heldPre = 0;
  let shift = holdAt(x.h1At);
  d0[C] = d0[C] + x.h1Rate * shift;
  heldPre += shift;
  let current0 = H;
  if (!humility) {
    const w = holdAt(x.k3At + shift);
    d0[H] = d0[H] + x.k3Rate * w;
    heldPre += w;
    shift += w;
    current0 = K;
  }
  const t0 = p.waitStart + shift;
  const first = humility ? H : K;
  const order = [first, ...WAIT_IDX.filter(e => e !== first)];

  const c0 = d0.map(v => countTE(v, thresholds));
  const now = c0.reduce((a, b) => a + b, 0);
  const from = Math.min(now + 1, o.lowest ?? now + 1);
  const to = Math.max(from - 1, top);
  const n = to - from + 1;
  const seconds = new Float64Array(Math.max(0, n)).fill(NaN);
  const endTE = new Int16Array(Math.max(0, n));
  const lastEgg = new Int8Array(Math.max(0, n));
  const held = new Float64Array(Math.max(0, n));
  const ends = new Float64Array(5 * Math.max(0, n));
  const sweep = (): ReplaySweep => ({
    from,
    to,
    seconds,
    endTE,
    lastEgg,
    held,
    deliveredInto: (i, out) => {
      for (let e = 0; e < 5; e++) out[e] = ends[i * 5 + e];
    },
    bytes: 4500 + seconds.byteLength * 2 + endTE.byteLength + lastEgg.byteLength + ends.byteLength,
  });
  if (n <= 0) return sweep();

  // Step k shares among order[k..4]: how many of the first m TEs handed out among them go to
  // order[k] (the egg that waits at step k).
  const all = greedyOrderOf(d0, Math.max(0, to - now), thresholds);
  const prefix: Int16Array[] = [];
  for (let k = 0; k < 5; k++) {
    const set = order.slice(k);
    const list = Array.from(all).filter(e => set.includes(e));
    const pre = new Int16Array(list.length + 1);
    for (let i = 0; i < list.length; i++) pre[i + 1] = pre[i] + (list[i] === order[k] ? 1 : 0);
    prefix.push(pre);
  }

  const dd = [0, 0, 0, 0, 0];
  const cc = [0, 0, 0, 0, 0];
  for (let target = from; target <= to; target++) {
    const i = target - from;
    for (let e = 0; e < 5; e++) {
      dd[e] = d0[e];
      cc[e] = c0[e];
    }
    let sum = now;
    let t = t0;
    let h = heldPre;
    let current = current0;
    let ok = true;
    for (let k = 0; k < 5; k++) {
      const egg = order[k];
      if (k > 0 && current !== egg) {
        const w = holdAt(t);
        if (w > 0) {
          dd[current] = dd[current] + rate * w;
          const c = countTE(dd[current], thresholds);
          sum += c - cc[current];
          cc[current] = c;
          t += w;
          h += w;
        }
      }
      const left = target - sum;
      const pre = prefix[k];
      const need = left > 0 ? pre[Math.min(left, pre.length - 1)] : 0;
      let wait = k === 0 ? Math.max(0, saleEnd - t) : 0;
      if (need > 0) {
        const w = teWait(dd[egg], rate, need, thresholds);
        if (!Number.isFinite(w)) {
          ok = false;
          break;
        }
        wait = Math.max(wait, w);
      }
      if (k > 0 && need > 0 && current !== egg) current = egg;
      if (wait > 0) {
        dd[egg] = dd[egg] + rate * wait;
        const c = countTE(dd[egg], thresholds);
        sum += c - cc[egg];
        cc[egg] = c;
        t += wait;
      }
    }
    for (let e = 0; e < 5; e++) ends[i * 5 + e] = ok ? dd[e] : d0[e];
    if (!ok || sum < target) continue;
    seconds[i] = t;
    endTE[i] = sum;
    lastEgg[i] = current;
    held[i] = h;
  }
  return sweep();
}

/**
 * Continue current ascension with the player's hours (search/leg.ts `continueTailParams`, held as
 * auto/ascension.ts `runContinueCurrent` holds it): the goal shared once from the farm's counts, the
 * eggs visited cheapest first with the egg the farm is on first, and before each shift to another
 * egg a wait for the player, the farm laying the egg it is on (at its own rate) meanwhile. Null when
 * the eggs cannot carry that much TE. Without `holdUntil` it is continue's own time (the same total
 * as `tailTo` on the same params).
 */
export function replayContinue(
  p: BuildParams,
  /** The egg the farm is on (EGG_ORDER index). */
  egg: number,
  target: number,
  o: Pick<ReplayOptions, 'start' | 'holdUntil' | 'thresholds'>
): (Tail & { heldSeconds: number; lastEgg: number }) | null {
  const thresholds = o.thresholds ?? TE_BREAKPOINTS;
  const d = p.delivered.slice();
  const rate = p.peakELR;
  const have = d.map(v => countTE(v, thresholds));
  const goal = shareGoal(d, target, [false, false, false, false, false], thresholds);
  // runContinueCurrent's order: by TEs needed (a stable sort over EGG_ORDER), its own egg first.
  const visit = [0, 1, 2, 3, 4].filter(e => goal[e] > have[e]).sort((a, b) => goal[a] - have[a] - (goal[b] - have[b]));
  const at = visit.indexOf(egg);
  if (at > 0) {
    visit.splice(at, 1);
    visit.unshift(egg);
  }
  let t = 0;
  let held = 0;
  let current = egg;
  for (const e of visit) {
    if (o.holdUntil && current !== e) {
      const now = o.start + t;
      const w = o.holdUntil(now) - now;
      if (w > 0) {
        d[current] = d[current] + rate * w;
        t += w;
        held += w;
      }
    }
    const need = goal[e] - countTE(d[e], thresholds);
    if (need <= 0) continue;
    current = e;
    const w = teWait(d[e], rate, need, thresholds);
    if (!Number.isFinite(w)) return null;
    if (w > 0) {
      d[e] = d[e] + rate * w;
      t += w;
    }
  }
  const endTE = d.reduce((n, v) => n + countTE(v, thresholds), 0);
  return endTE >= target ? { seconds: t, endTE, delivered: d, heldSeconds: held, lastEgg: current } : null;
}
