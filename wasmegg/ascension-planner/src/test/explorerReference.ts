/**
 * Spec references for the Explorer (code review U2.4, 22 Nov 2026): one-line compositions the app code no longer needs, kept
 * here because many specs use them to judge their fixtures the way the page does. Not imported by the app.
 */
import { assessFinishes, finishJudgement, targetsPresent, whatIfIds, type FinishJudgement } from '@/explorer/analysis';
import { createPlanMerger, type AccountTable, type AccountTop } from '@/explorer/accountTop';
import type { CollectorRow } from '@/explorer/collector';

/**
 * Each run's finish date and whether it still stands, from the Leaderboard's own rules.
 *
 * `rows` should be every run on the page at every target -- a run to 300 is still evidence of the
 * TE the account had that day -- and exact copies included: `groupPlayers` folds them itself, and
 * every copy's id is answered with the judgement of the result it is a copy of. That includes runs
 * the page hides: whether a run is SHOWN must not change which OTHER runs stand. `now` only decides
 * the Leaderboard's 30-day rule, which this page does not apply (see `STANDING`).
 *
 * `shown` is the ids of the runs the page lists (every copy's id will do). Only those can be an
 * account's best or carry a `behind`: a best nobody can find in the table is no help. Leave it out
 * and every run counts as shown.
 *
 * `zone` is the calendar the dates inside each `reason` are read on (the Leaderboard's
 * `RankOptions.zone`): the page passes the viewer's, so "replaced by a newer run (24 Sep)" agrees
 * with the Planned and Finishes cells beside it. Left out, each date is in the zone of the run it
 * names.
 *
 * Lines the Leaderboard makes from a newer run's `rechecks` are used for what they replace but are
 * never an account's best here, for the same reason: they are not rows in this page's table.
 *
 * EACH RUN IS JUDGED ON ITS OWN LINE. `groupPlayers` can list one run on two lines: an anonymous
 * re-run of a plan sent under a name with no owner code is on its own line (the anonymous runs of its
 * account) and on the named player's too (`withUnnamedRechecks`), and the named line also weighs that
 * name's runs from OTHER accounts. So a same-name run on another account's gear could make the re-run
 * a what-if, or replace it, and which of the two verdicts showed was whichever line came last in
 * /all's order. Here a run's verdict, and what it may replace in `replacedAcrossLines`, come only from
 * the line `groupPlayers` files it under -- its own copy on the named line is left out, and so are the
 * lines that line made from its `rechecks`. Its re-check of the named plan still counts on the named
 * line, as on the Leaderboard.
 */
export function judgeFinishes(
  rows: CollectorRow[],
  finalTE: number,
  now: number,
  shown?: ReadonlySet<string>,
  zone?: string
): FinishJudgement {
  return finishJudgement(assessFinishes(rows, finalTE, now, zone), shown);
}

/** Every table at once: `createPlanMerger` for a caller that already has them all. */
export function mergeAccountTables(tables: readonly AccountTable[]): AccountTop {
  const merger = createPlanMerger();
  for (const t of tables) merger.add(t);
  return merger.result();
}

/** Every run the Leaderboard's rules call a what-if, at every target present. */
export function whatIfRuns(rows: CollectorRow[], now: number): Set<string> {
  return whatIfIds(targetsPresent(rows).map(({ finalTE }) => assessFinishes(rows, finalTE, now)));
}
