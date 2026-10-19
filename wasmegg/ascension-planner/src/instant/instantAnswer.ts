/**
 * The instant answer: the best route for each number of ascensions, from the precomputed table, to
 * 490 TE (Fastest) or to the highest TE by a date (Egg Day or another date). Pure: the worker
 * (instant.worker.ts) runs `workOutAnswer` on the table, the card (components/instant/InstantAnswer.vue)
 * shows `rowsShown`.
 *
 * What it assumes, said on the card: the first ascension is a fresh build (prestige now, on the next
 * whole hour) from the save's own egg counts, or finishing the ascension in progress without buying
 * anything (continue) when that is sooner; every later one on the next whole hour after the last
 * ends, at any hour of the day; the save's delivery rate (deliveryScale.ts) on the maxed table's
 * builds. Joo's planner ("Simulate this plan") is the exact check: its dates can differ from these
 * by a fraction of a percent, earlier or later.
 */
import { countTEThresholdsPassed } from '@/lib/truthEggs';
import { getLocalTimestampInTimezone } from '@/lib/events';
import type { VirtueEgg } from '@/types';
import { EGG_ORDER, type BuildParams } from './precomputedLeg';
import { findRoutes, firstLegOptions, polishFound, type FoundRoutes, type Route } from './routeFinder';
import type { Table, TableHeader } from './precomputedTable';
import { tableSimMismatch } from './simVersion';

/** The finder looks this far; the rows shown stop sooner (`rowsShown`). */
export const MAX_ASCENSIONS = 12;
/** Fastest's target. */
export const FINAL_TE = 490;
/** The stronger polish (three of the finder's routes per count, the first two stops moved up to eight
 *  TE together, then the local search): on the fork's bench it was never worse, ~0.5 s a count. */
export const STRONG_POLISH = { wide: 8, candidates: 3 };

export interface AnswerRequest {
  startTE: number;
  /** Unix seconds the plan starts (now). */
  start: number;
  /** Eggs delivered per egg at the start (EGG_ORDER). */
  delivered: number[];
  deliveryScale: number;
  /** Continue current ascension (continueTail.ts), or null/absent for a fresh first ascension only. */
  cont?: BuildParams | null;
  /** By a date: the unix second. Without it, the fastest route to FINAL_TE. */
  deadline?: number;
}

/** The finder and the polish, on one table. */
export async function workOutAnswer(
  table: Table,
  req: AnswerRequest,
  onProgress?: (done: number, of: number) => void,
  /** Awaited after the route search, before the polish; it may throw to stop the run (a newer
   *  request came, instant.worker.ts). */
  pause?: () => Promise<void>
): Promise<FoundRoutes> {
  // With a farm in progress, the first ascension is continue or the fresh build, whichever is sooner.
  const firstLegs = req.cont
    ? firstLegOptions({
        table: table.lookup,
        startTE: req.startTE,
        start: req.start,
        final: FINAL_TE,
        deliveryScale: req.deliveryScale,
        delivered: req.delivered,
        cont: req.cont,
      })
    : undefined;
  const base = {
    startTE: req.startTE,
    start: req.start,
    startDelivered: req.delivered,
    ...(firstLegs ? { firstLegs } : {}),
    deliveryScale: req.deliveryScale,
    ...(req.deadline !== undefined ? { deadline: req.deadline } : {}),
  };
  const found = await findRoutes({
    ...base,
    table: table.lookup,
    final: FINAL_TE,
    maxAscensions: MAX_ASCENSIONS,
    ...(onProgress ? { onProgress } : {}),
  });
  // The route search runs to its end; a superseded run stops here, before the polish.
  if (pause) await pause();
  const polished = polishFound(table.lookup, { ...base, ...STRONG_POLISH }, found);
  return { best: polished.best, byAscensions: polished.byAscensions, byDate: polished.byDate, byDateByAscensions: polished.byDateByAscensions };
}

/** Where the save stands: its TE (every threshold its eggs passed, pending ones included: they are
 *  claimed on ascending) and its eggs delivered per egg, in the table's order. */
export function saveStart(eggsDelivered: Record<VirtueEgg, number>): { te: number; delivered: number[] } {
  const delivered = EGG_ORDER.map(e => Math.max(0, eggsDelivered[e] || 0));
  return { te: delivered.reduce((n, d) => n + countTEThresholdsPassed(d), 0), delivered };
}

export type NoAnswer =
  | { kind: 'no-table' }
  | { kind: 'other-sim'; why: string }
  | { kind: 'below'; from: number; te: number }
  | { kind: 'above'; to: number; te: number }
  | { kind: 'at-target'; te: number }
  | { kind: 'pick-date' }
  | { kind: 'date-passed' };

/** What the goal asks, beside the table: By a date needs a date that has not passed yet. */
export interface GoalAsked {
  /** True for Egg Day and Another date (a deadline is needed). */
  dated?: boolean;
  /** Unix seconds now (the deadline must be later). */
  now?: number;
}

/**
 * Why there is no instant answer for this save on this table, or null when there is one. The date
 * checks come first: they need no table, and no run is made for them.
 */
export function noAnswerFor(header: TableHeader | null, te: number, deadline?: number, asked: GoalAsked = {}): NoAnswer | null {
  if (asked.dated && deadline === undefined) return { kind: 'pick-date' };
  if (deadline !== undefined && asked.now !== undefined && deadline <= asked.now) return { kind: 'date-passed' };
  if (!header) return { kind: 'no-table' };
  const why = tableSimMismatch(header);
  if (why) return { kind: 'other-sim', why };
  if (deadline === undefined && te >= FINAL_TE) return { kind: 'at-target', te };
  if (te < header.from) return { kind: 'below', from: header.from, te };
  if (te > header.to) return { kind: 'above', to: header.to, te };
  return null;
}

export interface AnswerRow {
  ascensions: number;
  route: Route;
  /** The TE the route reaches (its last ascension's end). */
  endTE: number;
  /** The best of the rows: soonest (Fastest), or highest TE then soonest (By a date). */
  best: boolean;
}

/**
 * The rows shown: each number of ascensions with a route, from 1 up to the best plus two (and up to
 * 10 for Fastest, whose low counts are far behind but still asked about), as the fork's counts table.
 */
export function rowsShown(found: FoundRoutes, deadline?: number): AnswerRow[] {
  const dated = deadline !== undefined;
  const list = dated ? found.byDateByAscensions : found.byAscensions;
  const best = dated ? found.byDate : found.best;
  const bestK = best ? best.chain.length : 0;
  const last = Math.min(MAX_ASCENSIONS, dated ? bestK + 2 : Math.max(10, bestK + 2));
  const rows: AnswerRow[] = [];
  for (let k = 1; k <= last; k++) {
    const r = list[k];
    if (!r) continue;
    rows.push({
      ascensions: k,
      route: r,
      endTE: r.legs[r.legs.length - 1]?.endTE ?? 0,
      best: !!best && r.end === best.end && r.chain.join() === best.chain.join(),
    });
  }
  return rows;
}

/** The goal an answer was worked out for: Fastest (no deadline) or By a date (the deadline). */
export interface AnsweredGoal {
  dated: boolean;
  deadline?: number;
}

/**
 * True when the answer on hand was worked out for the goal now chosen. The card shows rows, and
 * Simulate records a plan, only then: Fastest's rows never stand under a date tab (or the reverse)
 * while a new answer is coming or when the date field is empty.
 */
export function answerFits(answered: AnsweredGoal | null, chosen: AnsweredGoal): boolean {
  if (!answered || answered.dated !== chosen.dated) return false;
  if (!chosen.dated) return true;
  return chosen.deadline !== undefined && answered.deadline === chosen.deadline;
}

/** Egg Day of `year` (14 July, 9:00 am Pacific), unix seconds. */
export function eggDaySeconds(year: number): number {
  return getLocalTimestampInTimezone(`${year}-07-14`, '09:00', 'America/Los_Angeles');
}

/** The year of the next Egg Day that has not started yet. */
export function nextEggDayYear(nowMs = Date.now()): number {
  const y = new Date(nowMs).getUTCFullYear();
  return nowMs / 1000 < eggDaySeconds(y) ? y : y + 1;
}
