/**
 * @module rechecks
 * @description Which of the player's earlier plans a new run should price again, for `rechecks`
 * (schema 7, search/submission.ts).
 *
 * WHY. A plan on the leaderboard stands until the same player measures it again (lib/leaderboardRank.ts).
 * A player who has moved on to another route never does, so a finish that was a day optimistic when it
 * was sent could stand for a month. Every run already has the account's current save loaded and
 * usually priced most of the routes nearby, so it re-measures the player's best three for free and
 * sends the days along. The board treats each one as a newer run of that plan.
 *
 * WHICH THREE. The player's current plans -- the ones the race would count -- earliest finish first,
 * each cut to what is still ahead of this run's TE (a checkpoint already passed is not a checkpoint any
 * more, and the board's `samePlan` matches the cut route to the original). Skipped:
 *   - plans made under different settings (schedule, held shifts, finishing the current ascension,
 *     time off, target): priced under THIS run's settings they would be a different plan, and the
 *     board would match them to nothing;
 *   - the route this run itself found: it is already the submission's own chain;
 *   - a route that repeats one already taken, once cut.
 *
 * Pure: the store fetches the rows and prices the chains.
 */
import { buildMyPlans, remainingChain, samePlanSettings, type BoardRow, type Plan } from '@/lib/leaderboardRank';
import { isRecheckChain, MAX_RECHECKS } from './submission';

/** The run doing the re-checking: where it starts, what it found, and the settings it priced under. */
export interface RecheckRun {
  currentTE: number;
  finalTE: number;
  /** This run's own answer. */
  winner: readonly number[];
  window: string | null;
  holdShifts: boolean;
  forceContinue?: boolean;
  timeOff?: { from: string; to: string }[];
}

/** The player's current plans at the run's target, earliest finish first, from `rows` -- theirs by
 *  owner code (`yours`) or, as a fallback, by timezone and artifacts (`accountKey`). */
export function currentPlans(
  rows: readonly BoardRow[],
  accountKey: string | null,
  finalTE: number,
  now: number
): Plan[] {
  const mine = buildMyPlans(rows, accountKey, { target: finalTE, now });
  if (!mine?.best) return [];
  return [mine.best, ...mine.others];
}

/** Up to `max` routes to price again, best plan first. See the module comment for what is skipped. */
export function recheckChains(plans: readonly Plan[], run: RecheckRun, max = MAX_RECHECKS): number[][] {
  const settings = {
    finalTE: run.finalTE,
    window: run.window,
    holdShifts: run.holdShifts,
    forceContinue: run.forceContinue,
    timeOff: run.timeOff,
  };
  const seen = new Set([run.winner.join(',')]);
  const out: number[][] = [];
  for (const p of plans) {
    if (out.length >= max) break;
    if (p.state !== 'current' || p.row.finalTE !== run.finalTE) continue;
    if (!samePlanSettings(p.row, settings)) continue;
    const chain = remainingChain(p.row.chain ?? [], run.currentTE);
    if (!isRecheckChain(chain, run.finalTE) || chain[0] <= run.currentTE) continue;
    const key = chain.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(chain);
  }
  return out;
}
