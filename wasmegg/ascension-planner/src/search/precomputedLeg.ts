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
import { countTEThresholdsPassed } from '@/lib/truthEggs';
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
}

/** The time from the ascension's start to `target` total TE with this build (`runAscension`'s
 *  K3..H2 for a whole-TE goal), or null when the eggs cannot carry that much TE. */
export function tailTo(p: BuildParams, target: number): Tail | null {
  const delivered = Object.fromEntries(EGG_ORDER.map((e, i) => [e, p.delivered[i]])) as Record<VirtueEgg, number>;
  const locked: VirtueEgg[] = [];
  let t = p.waitStart;
  for (const egg of WAIT_ORDER) {
    const targets = distributeTargetTE(delivered, target, locked);
    const have = countTEThresholdsPassed(delivered[egg] || 0);
    const need = Math.max(0, targets[egg] - have);
    // K3 waits for the sale to end whatever the goal; the others only for their share.
    let wait = egg === 'kindness' ? Math.max(0, p.saleEnd - t) : 0;
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
  return endTE >= target ? { seconds: t, endTE } : null;
}

/** The fastest of a start's builds to `target`, as the app picks (`pickVariant`: least time, the
 *  first of equals). Null when none can reach it. */
export function bestTailTo(builds: BuildParams[], target: number): (Tail & { build: BuildParams }) | null {
  let best: (Tail & { build: BuildParams }) | null = null;
  for (const b of builds) {
    const t = tailTo(b, target);
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
