/**
 * @module lightResult
 * @description Light's result, as something to send (Jordan, 15 Oct 2026: "Light can be submitted").
 * Light (StrongerCheck.vue) is not a search: it prices routes already known. Its result is the best of
 *   - the instant answer's routes priced at once on the player's hours (search/lightAtOnce.ts),
 *   - the player's earlier routes priced on this save (search/strongerCheck.ts `priceEarlier`), and
 *   - by a date, the instant answer's fastest route one TE lower (`stepDown`),
 * by the same rule the Stronger check ranks with (`beats`: soonest; by a date the highest TE that makes the
 * date, then more to spare). The board row says `level: 'light'`, whether the route was priced at once
 * (`atOnce`) and where it came from (`lightFrom`), so it can be set against Fast and the instant answer.
 *
 * Pure: the store builds the payload (stores/chainSearch.ts `buildLightSubmission`).
 */
import type { LightFrom } from './submission';
import { beats, key, makesDate, type Goal, type Priced } from './strongerCheck';

/** One route Light priced, with where it came from and how its fresh ascensions were started. */
export interface LightRoute extends Priced {
  from: LightFrom;
  /** Priced with each fresh ascension at once (handoff 'now'); false: as the answer above starts them. */
  atOnce: boolean;
}

export interface LightResult {
  goal: Goal;
  /** The route Light would send. */
  best: LightRoute;
  /** Every route Light priced for this answer (its CSV), the best first. */
  routes: LightRoute[];
  /** The plan start Light priced from (unix seconds). */
  planStart: number;
}

/**
 * Light's best, or null when it priced nothing usable (by a date: nothing that makes the date). Ties go to
 * the earlier list: the instant answer's routes at once, then the earlier routes, then one TE lower.
 */
export function lightBest(o: {
  goal: Goal;
  atOnce: readonly (Priced | null | undefined)[];
  earlier: readonly (Priced | null | undefined)[];
  lower?: readonly (Priced | null | undefined)[];
  planStart: number;
  /** The earlier routes and the step-down are priced as the answer above starts its ascensions: 'now' is
   *  at once too. */
  handoffNow?: boolean;
}): LightResult | null {
  const routes: LightRoute[] = [];
  const seen = new Set<string>();
  const add = (list: readonly (Priced | null | undefined)[] | undefined, from: LightFrom, atOnce: boolean) => {
    for (const p of list ?? []) {
      if (!p || !(p.seconds > 0) || !p.chain.length) continue;
      const k = `${key(p.chain)}|${atOnce ? 'now' : 'hour'}`;
      if (seen.has(k)) continue;
      seen.add(k);
      routes.push({ ...p, chain: [...p.chain], from, atOnce });
    }
  };
  add(o.atOnce, 'instant', true);
  add(o.earlier, 'earlier', !!o.handoffNow);
  add(o.lower, 'lower-te', !!o.handoffNow);
  let best: LightRoute | null = null;
  for (const r of routes)
    if ((o.goal.kind === 'fastest' || makesDate(r, o.goal.deadline)) && beats(o.goal, r, best)) best = r;
  if (!best) return null;
  const top = best;
  return { goal: o.goal, best: top, routes: [top, ...routes.filter(r => r !== top)], planStart: o.planStart };
}

/**
 * What makes a Light result the same result for "already sent" (stores/chainSearch.ts `rememberSent`): the
 * goal, the route, its time (to the collector's 1e-4 days), how it was priced, the plan start and the TE it
 * started from. Prefixed so it never matches a search's own key.
 */
export function lightResultKey(r: LightResult, currentTE: number): string {
  const g = r.goal.kind === 'fastest' ? `fastest:${r.goal.target}` : `date:${r.goal.deadline}`;
  return [
    'light',
    g,
    r.best.chain.join(' '),
    Math.round((r.best.seconds / 86400) * 1e4),
    r.best.atOnce ? 'now' : 'hour',
    r.planStart,
    currentTE,
  ].join('|');
}

/** Light's Share box shows (LightShare.vue): at the Light level, once Light is done with a result, with a
 *  board to send to. Light starts by itself, so nothing is "started with Find": the box only offers a
 *  Send, and nothing goes without that press. */
export function lightShareShown(o: {
  level: string;
  state: 'idle' | 'running' | 'done' | 'error';
  result: LightResult | null;
  collector: boolean;
}): boolean {
  return o.level === 'light' && o.state === 'done' && !!o.result && o.collector;
}

/** The Send button's words: "Send this route (Light)" / By a date "Send 310 TE by this date (Light)". */
export function lightSendLabel(r: LightResult): string {
  const te = r.best.chain[r.best.chain.length - 1];
  return r.goal.kind === 'date' ? `Send ${te} TE by this date (Light)` : `Send this route (Light)`;
}

/** Where Light's route came from, in the Share box's words. */
export function lightFromText(r: LightResult): string {
  const b = r.best;
  if (b.from === 'instant') return "one of the instant answer's routes, priced ascending at once on your hours";
  if (b.from === 'earlier') return 'one of your earlier routes, priced on this save';
  return "the instant answer's fastest route one TE lower, priced on this save";
}
