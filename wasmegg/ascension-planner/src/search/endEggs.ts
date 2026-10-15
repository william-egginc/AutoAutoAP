/**
 * TE per egg at the end of a route, and how far each egg is from its next TE (By a date's card,
 * ByDateRouteCard.vue). Read from the route's last leg (`LegSummary.endEggs`, search/chain.ts), the
 * same per-egg numbers Your plan's TE breakdown shows (PlanFinalSummary.vue: an egg's TE is the
 * larger of what it has and the thresholds its eggs delivered have passed, src/lib/truthEggs.ts).
 *
 * "How long" is at the route's final delivery rate: the last leg's peak (`maxELR`, eggs a second),
 * the rate the farm keeps laying at if you carry on after the last stop (search/chain.ts lays at it
 * while a prestige waits for you). Laying one egg at a time, so each egg's time is its own; the
 * soonest is when your next TE would come.
 *
 * Each egg's next TE is also given as a moment (`at`, the card's Next TE column, Jordan 16 Oct 2026):
 * the route's end plus that time, as if the farm switched to that egg when the route ends.
 *
 * Nothing rather than a guess: no per-egg state (a replayed leg, a run from before 11 Oct), numbers
 * that are not finite, or per-egg TE that does not add up to the route's last stop all give null.
 * A missing rate keeps the TE and eggs needed and leaves the times out.
 */
import { countTEThresholdsPassed, getThresholdForTE, MAX_TE } from '@/lib/truthEggs';
import { VIRTUE_EGGS, type VirtueEgg } from '@/types';
import type { LegSummary } from './types';

export interface EggAtEnd {
  egg: VirtueEgg;
  /** TE on this egg when the route ends. */
  te: number;
  /** Lifetime eggs delivered of it then. */
  delivered: number;
  /** Eggs still to deliver for its next TE; null when it has every TE (98). */
  need: number | null;
  /** Seconds to deliver them at the final rate; null without a rate or a next TE. */
  seconds: number | null;
  /** When that would be (unix seconds): the route's end plus `seconds`, laying only this egg from then
   *  on. Null without `seconds` or without the last leg's end time. */
  at: number | null;
  /** The farm is on this egg when the route ends. */
  laying: boolean;
}

export interface EndEggs {
  rows: EggAtEnd[];
  /** The final delivery rate, eggs a second; null when unknown. */
  rate: number | null;
  /** The soonest next TE if you keep laying after the last stop: which egg, and when (unix seconds). */
  next: { egg: VirtueEgg; at: number } | null;
}

const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function endEggsOf(route: { chain: number[]; legs?: LegSummary[] } | null | undefined): EndEggs | null {
  const legs = Array.isArray(route?.legs) ? route!.legs : [];
  const leg = legs[legs.length - 1];
  const e = leg?.endEggs;
  if (!leg || leg.replayed || !e) return null;
  if (!Array.isArray(e.delivered) || !Array.isArray(e.te)) return null;
  if (e.delivered.length !== VIRTUE_EGGS.length || e.te.length !== VIRTUE_EGGS.length) return null;
  if (!e.delivered.every(v => ok(v) && v >= 0) || !e.te.every(v => ok(v) && v >= 0)) return null;
  const lastStop = route!.chain[route!.chain.length - 1];
  const tes = VIRTUE_EGGS.map((_, i) => Math.max(Math.round(e.te[i]), countTEThresholdsPassed(e.delivered[i])));
  if (tes.reduce((a, b) => a + b, 0) !== lastStop) return null;
  const rate = ok(leg.maxELR) && leg.maxELR > 0 ? leg.maxELR : null;
  const end = ok(leg.endTime) && leg.endTime > 0 ? leg.endTime : null;
  const rows: EggAtEnd[] = VIRTUE_EGGS.map((egg, i) => {
    const te = tes[i];
    const need = te >= MAX_TE ? null : Math.max(0, getThresholdForTE(te + 1) - e.delivered[i]);
    return {
      egg,
      te,
      delivered: e.delivered[i],
      need,
      seconds: need !== null && rate ? need / rate : null,
      at: need !== null && rate && end !== null ? end + need / rate : null,
      laying: e.egg === egg,
    };
  });
  let next: EndEggs['next'] = null;
  for (const r of rows) if (r.at !== null && (!next || r.at < next.at)) next = { egg: r.egg, at: r.at };
  return { rows, rate, next };
}
