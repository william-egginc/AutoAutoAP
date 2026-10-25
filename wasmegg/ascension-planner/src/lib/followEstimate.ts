/**
 * A FOLLOWED ROUTE ALWAYS HAS A TIMELINE (24 Oct 2026, Jordan: "No timeline for your route on this save yet … Single
 * run ignores the hours, which is inferior"). A route the player follows that no kept result prices on this save is
 * priced on the instant answer's own data, the way the instant answer prices its routes (search/routeFinder.ts
 * `priceChain`, in a route worker: composables/useFollowEstimate.ts), and Right now shows its steps "estimated from the
 * instant answer's data (times rounded to the hour)".
 *
 * What it is priced with is what the instant answer of THIS save priced its own routes with, kept in its snapshot
 * (InstantRoute.vue `pricing`): the table it read, the player's own first ascensions (each stop), the delivery scale,
 * the plan start and the held hours, time off and no-prestige days (`instantTail`). The snapshot's key holds the save
 * and Your setup, so these are the player's now. A kept Fast, Exact or Custom result for the route still wins (exact
 * times); this is only for a route with no timeline.
 *
 * Pure: no Vue, no workers.
 */
import type { PolishOptions, Route } from '@/search/routeFinder';
import type { SnapMeta } from '@/search/instantSnapshot';
import type { NowPlan } from './nowPlan';

/** Right now's words for an estimated route (the Next step and the source line). */
export const ESTIMATE_WORDS = "estimated from the instant answer's data (times rounded to the hour)";

/** The most the pricing inputs may add to a snapshot (search/instantSnapshot.ts MAX_BYTES is 600 kB for the whole). */
export const PRICING_MAX_BYTES = 200_000;

/** What the instant answer priced its routes with, kept in its snapshot. */
export interface SnapPricing {
  v: 1;
  /** The TE its first ascensions go up to (the route finder's `final`): a stop above it can't be priced. */
  final: number;
  /** routeFinder.ts PolishOptions as the instant answer passed them (its `polishOptions`): firstLegs, start, held
   *  hours and the tail options. */
  options: PolishOptions;
}

/** The pricing inputs for a snapshot, or null when there are none or they are too big to keep. A plain copy. */
export function snapPricing(options: PolishOptions | null | undefined, final: number): SnapPricing | null {
  if (!options || !Array.isArray(options.firstLegs) || !options.firstLegs.length || !(final > 0)) return null;
  try {
    const text = JSON.stringify({ v: 1, final, options });
    if (text.length > PRICING_MAX_BYTES) return null;
    return JSON.parse(text) as SnapPricing;
  } catch {
    return null;
  }
}

/** A snapshot's `pricing` field when it is usable, else null (absent before 24 Oct 2026). */
export function readPricing(x: unknown): SnapPricing | null {
  const p = x as SnapPricing | null | undefined;
  if (!p || p.v !== 1 || !(p.final > 0) || !p.options) return null;
  const o = p.options;
  if (!Number.isFinite(o.startTE) || !Number.isFinite(o.start) || !Array.isArray(o.firstLegs) || !o.firstLegs.length) return null;
  return p;
}

/** One of this save's snapshots that could price the route. */
export interface PricingSource {
  /** The table the instant answer read (its snapshot's `tableUrl`). */
  url: string;
  pricing: SnapPricing;
  /** The table's highest TE (its header's `to`), when known. */
  tableTo: number | null;
  /** The snapshot is the selected goal's own (else another goal's of the same save and setup). */
  ownGoal: boolean;
  /** When the snapshot was saved, ms. */
  at: number;
  meta: SnapMeta | null;
}

export type PickedPricing =
  | { source: PricingSource; chain: number[] }
  /** Every source stops short of the route (its last stop above the instant answer's data). */
  | { beyond: true; chain: number[] }
  | null;

/**
 * The source to price `chain` (the stops still ahead of the save) with: the selected goal's own snapshot first, then
 * the newest of the others. One whose start TE isn't the save's is never used (another save). Null when there is no
 * source at all; `beyond` when every source stops below the route's last stop.
 */
export function pickPricing(sources: readonly PricingSource[], chain: readonly number[], currentTE: number): PickedPricing {
  if (!chain.length) return null;
  const mine = sources.filter(s => s.pricing.options.startTE === Math.floor(currentTE) && !!s.url);
  if (!mine.length) return null;
  const last = chain[chain.length - 1];
  const covers = (s: PricingSource) => last <= s.pricing.final && (s.tableTo == null || last <= s.tableTo);
  const ok = mine.filter(covers).sort((a, b) => Number(b.ownGoal) - Number(a.ownGoal) || b.at - a.at);
  return ok.length ? { source: ok[0], chain: [...chain] } : { beyond: true, chain: [...chain] };
}

/** The estimate's key: the save, the source snapshot (its table and when it was saved) and the route. A new save or a
 *  new instant answer makes another key, so an estimate for one never shows for another. */
export function estimateKey(saveSeconds: number, source: PricingSource, chain: readonly number[]): string {
  return `${saveSeconds}|${source.at}|${source.url}|${chain.join(',')}`;
}

/** The priced route as Right now's plan: the table's times (prestige times only), `exact` false (rounded, no
 *  calendar), marked `estimated`. No runner-up: it is the player's pick. */
export function planFromEstimate(
  route: Route,
  goal: { goal: 'fastest' | 'date'; deadline: number | null },
  source: Pick<PricingSource, 'meta' | 'pricing'>,
  /** When it was priced, ms. */
  at: number
): NowPlan {
  const lastLeg = route.legs[route.legs.length - 1];
  const endTE = lastLeg?.endTE ?? route.chain[route.chain.length - 1] ?? 0;
  const deadline = goal.goal === 'date' ? goal.deadline : null;
  return {
    goal: goal.goal,
    deadline,
    chain: [...route.chain],
    end: route.end,
    endTE,
    legs: null,
    tableLegs: route.legs.map(l => ({ from: l.from, to: l.to, endTE: l.endTE, start: l.start, end: l.end, label: l.label })),
    exact: false,
    estimated: true,
    instantTE: goal.goal === 'date' ? endTE : null,
    spareHours: deadline ? (deadline - route.end) / 3600 : null,
    runnerUpHours: null,
    runnerUp: null,
    calculatedAt: at,
    planStart: source.pricing.options.start,
    meta: source.meta,
    whatIf: null,
  };
}
