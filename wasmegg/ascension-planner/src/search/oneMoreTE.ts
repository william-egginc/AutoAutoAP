/**
 * The "one more TE" hint on By a date's answer (ByDateRouteCard.vue, from DeadlinePanel.vue): when a
 * run did not search its whole space -- it was stopped early, a Simple run's boxes were narrow, or the
 * best route sits on the edge of its box -- and the best route's time to spare is more than one more
 * TE costs at that TE, a route to one TE higher may well exist.
 *
 * Not for a finished run over its whole space with the best route inside its boxes: that search
 * already tried every shape's last stop one higher.
 *
 * WHAT ONE MORE TE COSTS, in order:
 *  1. The run's own: when its last stop L was reached against the soonest route it priced to L - 1
 *     (`lastTECostFrom`, worked out when the run ends and kept with the result as `lastTECost`). Not
 *     L + 1 against L: every route priced to L + 1 missed the date (or it would be the answer), so
 *     that gap is always more than the spare and could never say anything.
 *  2. The measured table: a flat ~51 h at TE 239-248 and ~45 h at 327-338 (the analyst's
 *     marginal_te.py, 10 Oct: the soonest arrival at each last stop over every route), in between
 *     along a line, and only from TE 235 to 345 where it was measured.
 *  3. The route's own next TE by just laying after the last stop (search/endEggs.ts): an upper bound,
 *     since the route could at least do that.
 * None of them: no hint, rather than a guess.
 */
import { spareLabel } from './deadlineSummary';
import { endEggsOf } from './endEggs';
import type { DeadlineRoute, PricedRoutes } from './deadline';

const H = 3600;
/** The measured points: (TE, seconds one more TE costs there). */
const TABLE: [number, number][] = [
  [244, 51 * H],
  [332, 45 * H],
];
const TABLE_LO = 235;
const TABLE_HI = 345;

/** One more TE at the by-date ceiling, from the measured table; null outside TE 235-345. */
export function tableTECostSeconds(te: number): number | null {
  if (!Number.isFinite(te) || te < TABLE_LO || te > TABLE_HI) return null;
  const [[t0, c0], [t1, c1]] = TABLE;
  const f = Math.min(1, Math.max(0, (te - t0) / (t1 - t0)));
  return c0 + (c1 - c0) * f;
}

/**
 * The run's own cost of its last TE: when `best` reaches its last stop L, less the soonest any route
 * the run priced reaches L - 1 (its own route stopping one lower is usually among them, as the last
 * stop is bracketed). Null when nothing to L - 1 was priced.
 */
export function lastTECostFrom(
  all: PricedRoutes | null | undefined,
  best: DeadlineRoute | null | undefined
): number | null {
  if (!all || !best?.chain.length || !Number.isFinite(best.reachAt)) return null;
  const below = String(best.chain[best.chain.length - 1] - 1);
  let soonest = Infinity;
  for (let i = 0; i < all.size; i++) {
    const k = all.keys[i];
    const last = k.slice(k.lastIndexOf(',') + 1);
    if (last !== below) continue;
    const t = all.reachAt(i);
    if (Number.isFinite(t) && t < soonest) soonest = t;
  }
  const cost = best.reachAt - soonest;
  return Number.isFinite(cost) && cost > 0 ? cost : null;
}

export interface TECost {
  seconds: number;
  from: 'run' | 'table' | 'laying';
}

/** What one more TE costs at the end of `route` (the order above); null when nothing says. */
export function oneMoreTECost(route: DeadlineRoute, runCost?: number | null): TECost | null {
  if (typeof runCost === 'number' && Number.isFinite(runCost) && runCost > 0) return { seconds: runCost, from: 'run' };
  const table = tableTECostSeconds(route.chain[route.chain.length - 1]);
  if (table !== null) return { seconds: table, from: 'table' };
  const eggs = endEggsOf(route);
  const end = route.legs?.[route.legs.length - 1]?.endTime;
  if (eggs?.next && typeof end === 'number' && eggs.next.at > end)
    return { seconds: eggs.next.at - end, from: 'laying' };
  return null;
}

/** "51 h": hours, as the measured cost is said, up to five days. */
function costLabel(seconds: number): string {
  return seconds < 5 * 86400 ? `${Math.max(1, Math.round(seconds / H))} h` : spareLabel(seconds);
}

export interface OneMoreTEHint {
  text: string;
  cost: TECost;
}

/**
 * The hint, or null. `narrow`: a Simple run whose boxes were narrow around the best route (or which
 * found it as the instant answer's own route, outside every box); `onEdge`: the best route is on the
 * edge of its box (search/bandCheck.ts `findBandEdges`).
 */
export function oneMoreTEHint(o: {
  route: DeadlineRoute | null | undefined;
  stoppedEarly: boolean;
  narrow?: boolean;
  onEdge?: boolean;
  /** The run's own cost of its last TE (`SavedDeadlineResult.lastTECost`). */
  runCost?: number | null;
}): OneMoreTEHint | null {
  const r = o.route;
  if (!r?.chain.length || !Number.isFinite(r.spare)) return null;
  if (!o.stoppedEarly && !o.narrow && !o.onEdge) return null;
  const cost = oneMoreTECost(r, o.runCost);
  if (!cost || r.spare <= cost.seconds) return null;
  const spare = spareLabel(r.spare);
  const worth = `more than one TE's worth (one more TE costs about ${costLabel(cost.seconds)} here)`;
  const text = o.stoppedEarly
    ? `A better route may exist: this run stopped early with ${spare} spare, ${worth}. Let it finish, or widen the boxes.`
    : o.onEdge
      ? `A better route may exist: its best route is on the edge of its box, with ${spare} spare, ${worth}. Widen the boxes.`
      : `A better route may exist: this run's boxes were narrow, and it has ${spare} spare, ${worth}. Widen the boxes.`;
  return { text, cost };
}
