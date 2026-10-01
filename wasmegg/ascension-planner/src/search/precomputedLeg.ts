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
