/**
 * @module explorer/analysis
 * @description Turning a pile of submitted runs into the few statements that can honestly be made
 * about them.
 *
 * TWO RULES THIS MODULE EXISTS TO ENFORCE.
 *
 *   1. Totals never compare between accounts. A chain's length depends on artifacts,
 *      colleggtibles, epic research and starting TE at least as much as on the chain, so "8
 *      ascensions is faster than 6" computed across everybody is an artifact of who happened to
 *      submit what. Every cross-count comparison here is built WITHIN an account, and every
 *      cross-account view is built on the chain SHAPE -- where the checkpoints sit as a fraction of
 *      that account's own journey -- or on one leg's own length, which is the part that travels.
 *
 *   2. Within an account, compare FINISH DATES, not totals. A run's total (`durationDays`) is
 *      counted from its own plan start, so the same plan run a day later shows a day fewer
 *      (Allan's two runs of 205 246 281 311 490, 87 minutes apart, differ by exactly those 87
 *      minutes and finish at the same minute). The plan start plus the total is the date the plan
 *      reaches the target, and that does not move when the same plan is run again; a better plan
 *      finishes earlier. Totals only compare between runs from ONE save (same account, same plan
 *      start, same TE), where total and finish date say the same thing. Which runs of an account
 *      are still standing -- not a what-if, not made from an old save, not replaced by a newer run
 *      of the same plan, not one the player has fallen behind -- is the Leaderboard's judgement
 *      (lib/leaderboardRank.ts), reused here rather than restated (`judgeFinishes`).
 *
 * Per-leg durations (one ascension's length, the final stretch to 490) are intrinsic to the leg and
 * fine as days, EXCEPT the first leg, which is the rest of the ascension in progress and shrinks
 * one-for-one with a later start.
 *
 * ACCOUNT IDENTITY IS A PROXY, and a deliberately coarse one. Submissions carry no player id by
 * design (see search/submission.ts), so there is nothing exact to group on. The nickname is free
 * text and people retype it every run -- the live collector holds eleven variants of one person's
 * name, several with a timestamp in them -- so grouping on it splits one account into eleven.
 * What does hold still is the artifact set plus the timezone: the eight virtue families are
 * reported best-per-family, they change only when someone upgrades, and on the live data this
 * collapses 41 runs into 8 accounts that match who actually sent them. Two people in one timezone
 * with identical sets would merge, which is a wrong answer this module can produce and says so in
 * the UI rather than pretending otherwise.
 */
import { formatBand } from '@/search/exhaustive';
import type { Submission } from '@/search/submission';
import type { PricedChain } from '@/search/types';
import type { CollectorRow } from './collector';
import { checkFinalLegRate, clothedTEFromLabels, deliveryScore, slotsFromLabels } from '@/search/virtueScore';
import {
  accountKeyOf,
  DAY_MS,
  displayName,
  fileRows,
  foldCopies,
  formatDate,
  foundByText,
  groupPlayers,
  mayJudge,
  ownCopies,
  playerKey,
  samePlan,
  sameSave,
  settingTags,
  type BoardRow,
  type Filing,
  type Folded,
  type Plan,
  type PlanState,
} from '@/lib/leaderboardRank';

/**
 * Stable key for "probably the same account": timezone plus the sorted artifact set. The
 * Leaderboard's `accountKeyOf`, under the name this page has always used, so the two pages can never
 * disagree about who is who. See the module note on how coarse this is.
 */
export const accountKey: (row: Pick<Submission, 'timezone' | 'artifacts'>) => string = accountKeyOf;

/**
 * What to call an account in a legend.
 *
 * The nickname field is where people record what a particular run WAS, not who they are: the live
 * collector holds `Willsalt`, `Willsalt(2 ascent) 2026-09-20 12:02`, `Williamthe5thc 8 exhaus
 * 2026-09-20 08:47` and `Williamthe5thc (bad sync)` — all annotations bolted onto a name. So the
 * annotations are stripped (a trailing date, a trailing parenthetical, a trailing run note) and
 * the SHORTEST survivor is taken, which is the part that did not change between runs.
 *
 * Each name is cleaned by the Leaderboard's `displayName`, so the two pages call one name the same
 * thing: the stripping above, minus characters that draw nothing, and a name that is only a game icon
 * (one private-use character, which renders blank outside the game's font) reads "(icon) · Los
 * Angeles" rather than nothing. A nickname that is entirely a parenthetical keeps it, which is
 * still better than calling somebody Anonymous.
 */
export function accountLabel(rows: Submission[]): string {
  const cleaned = rows
    .filter(r => r.nickname?.trim())
    .map(r => displayName(r.nickname, r.timezone))
    .filter(Boolean);
  if (!cleaned.length) return `Anonymous · ${rows[0]?.timezone ?? 'unknown zone'}`;
  const shortest = (list: string[]) => list.reduce((a, b) => (b.length < a.length ? b : a));
  // The name the most runs are filed under, counting a run for every name it STARTS WITH, so a bare
  // name is credited with its annotated variants ("Williamthe5thc 8 exhaus"); the shortest only
  // breaks a tie. Shortest alone let one typo'd run, "altfieldhouse", name an account whose other
  // seventeen runs all said "allanfieldhouse".
  const distinct = [...new Set(cleaned)];
  const support = (n: string) => cleaned.filter(c => c.startsWith(n)).length;
  const top = Math.max(...distinct.map(support));
  return shortest(distinct.filter(n => support(n) === top));
}

export interface Account {
  key: string;
  label: string;
  rows: CollectorRow[];
  /** Ascension counts this account has submitted, ascending. */
  counts: number[];
}

export function groupByAccount(rows: CollectorRow[]): Account[] {
  const buckets = new Map<string, CollectorRow[]>();
  for (const row of rows) {
    const key = accountKey(row);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }
  return [...buckets.entries()]
    .map(([key, group]) => ({
      key,
      label: accountLabel(group),
      rows: group,
      counts: [...new Set(group.map(r => r.ascensions))].sort((a, b) => a - b),
    }))
    .sort((a, b) => b.rows.length - a.rows.length || a.label.localeCompare(b.label));
}

/** Checkpoints as fractions of this run's own journey, final target excluded. */
export function chainFractions(chain: number[], currentTE: number, finalTE: number): number[] {
  const span = finalTE - currentTE;
  if (!(span > 0)) return [];
  return chain.slice(0, -1).map(v => (v - currentTE) / span);
}

export function median(values: number[]): number {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Min and max in one pass, without spreading into `Math.min`.
 *
 * `Math.min(...values)` passes one argument per element, and a near-best set out of a full chain
 * table can be tens of thousands of them -- `MAX_PARSED_CHAINS` alone allows 60,000. V8 throws
 * RangeError somewhere past 125,000 and JavaScriptCore's limit is lower still, so the spread is a
 * crash that only shows up on somebody else's phone, against somebody else's big run.
 */
function extent(values: number[]): { lo: number; hi: number } {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return { lo, hi };
}

/** Column of observed fractions -> the band it describes. Shared by both callers below. */
function bandsFromColumns(columns: number[][]): PositionBand[] {
  return columns.map((values, index) => {
    const { lo, hi } = extent(values);
    return { index, lo, mid: median(values), hi, samples: values.length };
  });
}

/** Where one checkpoint position lands across a set of runs, in fractions of the journey. */
export interface PositionBand {
  /** 0-based checkpoint index. The final target is never a position. */
  index: number;
  lo: number;
  mid: number;
  hi: number;
  /** How many runs contributed. Two is a coincidence; ten is a pattern. */
  samples: number;
}

/**
 * The band each checkpoint occupies across these runs.
 *
 * Min/median/max rather than a standard deviation: with three to ten samples a spread statistic
 * that assumes a distribution is inventing one, and the honest summary of eight numbers is the
 * eight numbers' own range.
 */
export function positionBands(rows: Submission[]): PositionBand[] {
  const columns: number[][] = [];
  for (const row of rows) {
    const fractions = chainFractions(row.chain, row.currentTE, row.finalTE);
    fractions.forEach((f, i) => {
      if (!columns[i]) columns[i] = [];
      columns[i].push(f);
    });
  }
  return bandsFromColumns(columns);
}

/** A set of runs, as the count cards and the "All" card describe it. */
export interface RunGroup {
  rows: CollectorRow[];
  /** Distinct accounts behind those runs. */
  accounts: number;
  /** Runs here that can prove their answer over a stated space rather than having found it. */
  exhaustive: number;
}

export interface CountGroup extends RunGroup {
  ascensions: number;
  bands: PositionBand[];
}

/**
 * The card numbers for any set of runs. There is deliberately no "fastest" here: the lowest total
 * in a set picks whichever account has the best gear and whichever run was made last, which is two
 * of the comparisons this page refuses to make. Each account's earliest finish is in the runs table.
 */
export function summariseRuns(rows: CollectorRow[]): RunGroup {
  return {
    rows,
    accounts: new Set(rows.map(accountKey)).size,
    exhaustive: rows.filter(r => r.space && !r.space.stoppedEarly).length,
  };
}

/** One group per ascension count present, shortest chain first. Rows keep the order given. */
export function groupByCount(rows: CollectorRow[]): CountGroup[] {
  const buckets = new Map<number, CollectorRow[]>();
  for (const row of rows) {
    const bucket = buckets.get(row.ascensions);
    if (bucket) bucket.push(row);
    else buckets.set(row.ascensions, [row]);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ascensions, group]) => ({ ascensions, ...summariseRuns(group), bands: positionBands(group) }));
}

// ------------------------------------------------------------------------------ finish dates

/**
 * Plan states whose finish still stands, so it compares with the account's other finishes.
 *
 * The Leaderboard's `current`, plus `old` (planned over 30 days ago). The race drops an old plan
 * because it wants a fresh one on the board; this page is a record of what runs found, and a plan
 * that was not re-measured, not a what-if and not fallen behind still finished when it said. The
 * rest do not stand: a what-if or an old-save run was not planned from the account as it was, a
 * replaced one was re-measured by a newer run of the same plan (the newest measurement stands,
 * earlier or later), and a behind one is a plan the player is no longer on.
 */
const STANDING: ReadonlySet<PlanState> = new Set<PlanState>(['current', 'old']);

/**
 * A later run has to start at least this much later to count as newer: the Leaderboard's `LATER_MS`
 * (lib/leaderboardRank.ts), which it does not export. Keep the two equal.
 */
const LATER_MS = 60 * 60_000;

/** A run in one of these states cannot re-measure a plan: it was not planned from the account as it
 *  was, or it has no finish to measure with. Everything else can, as on the Leaderboard. */
const NO_REMEASURE: ReadonlySet<PlanState> = new Set<PlanState>(['what-if', 'old-save', 'no-date']);

/**
 * The Leaderboard's "replaced" rule, applied across the player lines this page merges into one
 * account block.
 *
 * `groupPlayers` judges each Leaderboard line on its own: an owner code, a name, or the anonymous
 * runs of one timezone and artifact set. This page shows one block per account (`accountKey`), and a
 * block can hold several of those lines, so an older plan on one line could stand -- and be the
 * block's earliest finish -- after a newer run of the same plan on another line re-measured it: an
 * anonymous 206 283 490 from 14 Sep next to the same plan sent under a name on 21 Sep. Here a plan
 * that still stands is replaced by the earliest run in its block that starts more than an hour
 * after it, is not a what-if, not from an old save, has a date, prices the same plan (`samePlan`)
 * and may judge it (`mayJudge`).
 *
 * `mayJudge` keeps the Leaderboard's owner-code protection exactly: a row with an owner code never
 * judges one without, nor the other way round. So an owner's newer run of a plan first sent without
 * a code (Allan's 5-ascension 223 253 282 316 490, a re-run of his code-less 6-ascension plan with the
 * first checkpoint passed) leaves the older plan standing here, as it does on the Leaderboard.
 *
 * Returns the reason for each plan this replaces, in the Leaderboard's words.
 */
function replacedAcrossLines(plans: readonly Plan<CollectorRow>[], filing: Filing): Map<Plan<CollectorRow>, string> {
  const blocks = new Map<string, Plan<CollectorRow>[]>();
  for (const plan of plans) {
    if (plan.start == null) continue;
    const key = accountKey(plan.row);
    const block = blocks.get(key);
    if (block) block.push(plan);
    else blocks.set(key, [plan]);
  }
  const out = new Map<Plan<CollectorRow>, string>();
  for (const block of blocks.values()) {
    block.sort((a, b) => a.start! - b.start!);
    for (const older of block) {
      if (!STANDING.has(older.state)) continue;
      const newer = block.find(
        p =>
          p.start! > older.start! + LATER_MS &&
          p.finish != null &&
          !NO_REMEASURE.has(p.state) &&
          samePlan(older.row, p.row) &&
          mayJudge(filing, p.row, older.row)
      );
      if (!newer) continue;
      const when = formatDate(newer.start, newer.row.timezone, { day: 'numeric', month: 'short' });
      // A line made from a newer run's `rechecks` carries `recheckOf`, which is not a collector field.
      const line: BoardRow = newer.row;
      out.set(
        older,
        line.recheckOf
          ? `re-checked by a newer run (${when}), which priced it again from its own save`
          : `replaced by a newer run of the same plan (${when})`
      );
    }
  }
  return out;
}

/** One run's finish, judged against its own account. */
export interface RunFinish {
  /** Plan start and finish, as instants (ms). Null when the start or timezone is missing. */
  start: number | null;
  finish: number | null;
  state: PlanState;
  /** Why the finish does not stand, in player words. Empty when it does. */
  reason: string;
  /** The finish still stands, so it compares with the account's other standing finishes. */
  standing: boolean;
  /**
   * Days this finish is after the account's earliest standing finish at this target: 0 for that
   * run, positive for any other standing run. Null when this finish does not stand, or when the run
   * is not among the shown ones (see `judgeFinishes`).
   */
  behind: number | null;
  /** This run is the account's earliest standing finish (ties go to the more recent start). */
  best: boolean;
  /**
   * Made from the same save as the account's best and planned around the same time off, so the gap is
   * the plans alone. A run planned around time off can share its save, start and route with a normal
   * run, and then the gap is the farm stopping and being rebuilt (`sameSave` does not look at it).
   */
  sameSaveAsBest: boolean;
}

/** The time off a run was planned around, as one comparable string ('' for none). */
export function timeOffKey(row: Pick<Submission, 'timeOff'>): string {
  return (row.timeOff ?? []).map(t => `${t.from}~${t.to}`).join(',');
}

export interface AccountBest {
  row: CollectorRow;
  start: number;
  finish: number;
}

export interface FinishJudgement {
  /** Every copy of every run at the target, by id. */
  byId: Map<string, RunFinish>;
  /** Per account (`accountKey`): the shown run with the earliest standing finish. */
  bestByAccount: Map<string, AccountBest>;
}

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
  shown?: ReadonlySet<string>
): FinishJudgement {
  // `groupPlayers`' own filing, over the rows it ranks (its `rankable`: a route and no flags), and its
  // own key for the line a folded run is filed under. Keep both in step with it.
  const filing = fileRows(rows.filter(r => Array.isArray(r.chain) && !r.flags?.length));
  const lineOf = (f: Folded<CollectorRow>) =>
    (f.player ?? playerKey(filing, f.row)) || `account:${accountKeyOf(f.row)}`;

  const plans = new Map<string, Plan<CollectorRow>>();
  const lines: Plan<CollectorRow>[] = [];
  for (const player of groupPlayers(rows, { target: finalTE, now })) {
    for (const plan of player.plans) {
      if (lineOf(plan.folded) !== player.key) continue;
      lines.push(plan);
      for (const copy of plan.folded.copies) if (copy.id) plans.set(copy.id, plan);
    }
  }

  const replaced = replacedAcrossLines(lines, filing);
  const stateOf = (plan: Plan<CollectorRow>): PlanState => (replaced.has(plan) ? 'replaced' : plan.state);
  const stands = (plan: Plan<CollectorRow>) => STANDING.has(stateOf(plan)) && plan.finish != null;
  const isShown = (plan: Plan<CollectorRow>) => !shown || plan.folded.copies.some(c => shown.has(c.id));

  const bestPlan = new Map<string, Plan<CollectorRow>>();
  for (const plan of new Set(plans.values())) {
    if (!stands(plan) || plan.start == null || !isShown(plan)) continue;
    const key = accountKey(plan.row);
    const held = bestPlan.get(key);
    // Earliest finish; a tie goes to the more recent start, as on the Leaderboard.
    if (!held || plan.finish! < held.finish! || (plan.finish === held.finish && plan.start > held.start!)) {
      bestPlan.set(key, plan);
    }
  }

  const byId = new Map<string, RunFinish>();
  for (const [id, plan] of plans) {
    const best = bestPlan.get(accountKey(plan.row));
    const standing = stands(plan);
    byId.set(id, {
      start: plan.start,
      finish: plan.finish,
      state: stateOf(plan),
      reason: standing ? '' : (replaced.get(plan) ?? plan.reason),
      standing,
      behind: standing && best && isShown(plan) ? (plan.finish! - best.finish!) / DAY_MS : null,
      best: best === plan,
      sameSaveAsBest:
        !!best && best !== plan && sameSave(plan.row, best.row) && timeOffKey(plan.row) === timeOffKey(best.row),
    });
  }

  // Named by the copy the table shows for it (`shownCopy`), so the block header describes the row the
  // table lists: under Proofs only, a proof shown in place of a bigger search is not "not a proof".
  const who = (r: CollectorRow) => playerKey(filing, r);
  const bestByAccount = new Map<string, AccountBest>();
  for (const [key, plan] of bestPlan) {
    bestByAccount.set(key, { row: shownCopy(plan.folded, who), start: plan.start!, finish: plan.finish! });
  }
  return { byId, bestByAccount };
}

/** One account's runs in the runs table. */
export interface AccountRuns {
  key: string;
  label: string;
  /** In the order asked for (`RunSort`); by default standing finishes first, earliest first. */
  rows: CollectorRow[];
  best: AccountBest | null;
}

/**
 * What the runs table can order an account's runs by, the player's pick. Only the runs INSIDE each
 * account: the accounts themselves stay in colour order whatever is picked, because no number here
 * compares between accounts. Plan length is on the list because players ask for it, and the page
 * says beside it that it only compares runs from one save.
 */
export type RunSortKey = 'finish' | 'planned' | 'length' | 'ascensions' | 'te' | 'priced' | 'left' | 'compute';

export interface RunSort {
  by: RunSortKey;
  dir: 'asc' | 'desc';
}

export const DEFAULT_RUN_SORT: RunSort = { by: 'finish', dir: 'asc' };

/** The way each order starts when picked: the end with the likely question first (the newest plan,
 *  the biggest search), then a second pick flips it. */
export const RUN_SORT_START: Readonly<Record<RunSortKey, RunSort['dir']>> = {
  finish: 'asc',
  planned: 'desc',
  length: 'asc',
  ascensions: 'asc',
  te: 'asc',
  priced: 'desc',
  left: 'asc',
  compute: 'desc',
};

/** Orders worked out outside this module, by run: `left` is left.ts's count (the page passes it in). */
export type RunSortValues = Partial<Record<RunSortKey, (row: CollectorRow) => number | null>>;

/** The number a run is ordered by, or null when it has none (no date, no compute recorded). */
function runSortValue(
  row: CollectorRow,
  by: RunSortKey,
  judged: FinishJudgement,
  values: RunSortValues
): number | null {
  const given = values[by];
  if (given) {
    const v = given(row);
    return typeof v === 'number' && !Number.isNaN(v) ? v : null;
  }
  const j = judged.byId.get(row.id);
  const finite = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  switch (by) {
    case 'finish':
      return finite(j?.finish);
    case 'planned':
      return finite(j?.start);
    case 'length':
      return finite(row.durationDays);
    case 'ascensions':
      return finite(row.ascensions);
    case 'te':
      return finite(row.currentTE);
    case 'priced':
      return finite(row.chainsPriced);
    case 'compute':
      return row.run ? finite(row.run.minutes * (row.run.workers || 1)) : null;
    case 'left':
      return null;
  }
}

/**
 * The runs table: one block per account, in `order` (the page's colour order), each account's runs
 * in the order `sort` asks for. Accounts are never ranked against each other -- different gear -- so
 * there is no order between blocks to get wrong. By finish date (the default), runs whose finish no
 * longer stands (a what-if, a replaced plan, ...) come after the ones that do, whatever their date;
 * by anything else they sort in with the rest (they stay greyed). A run with no value for the
 * picked order goes last either way, and ties fall back to the finish-date order.
 */
export function runsByAccount(
  rows: CollectorRow[],
  judged: FinishJudgement,
  labels: ReadonlyMap<string, string>,
  order: readonly string[] = [],
  sort: RunSort = DEFAULT_RUN_SORT,
  values: RunSortValues = {}
): AccountRuns[] {
  const blocks = new Map<string, CollectorRow[]>();
  for (const row of rows) {
    const key = accountKey(row);
    const block = blocks.get(key);
    if (block) block.push(row);
    else blocks.set(key, [row]);
  }
  const rank = (key: string) => {
    const i = order.indexOf(key);
    return i < 0 ? Infinity : i;
  };
  const sortKey = (row: CollectorRow) => {
    const j = judged.byId.get(row.id);
    return { standing: j?.standing ? 0 : 1, finish: j?.finish ?? Infinity, start: j?.start ?? -Infinity };
  };
  const byFinish = (a: CollectorRow, b: CollectorRow) => {
    const x = sortKey(a);
    const y = sortKey(b);
    return x.standing - y.standing || x.finish - y.finish || y.start - x.start;
  };
  const sign = sort.dir === 'asc' ? 1 : -1;
  const byPick = (a: CollectorRow, b: CollectorRow) => {
    const x = runSortValue(a, sort.by, judged, values);
    const y = runSortValue(b, sort.by, judged, values);
    if (x == null || y == null) return x == null && y == null ? byFinish(a, b) : x == null ? 1 : -1;
    return sign * (x - y) || byFinish(a, b);
  };
  const compare =
    sort.by === 'finish'
      ? (a: CollectorRow, b: CollectorRow) => sortKey(a).standing - sortKey(b).standing || byPick(a, b)
      : byPick;
  return [...blocks.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || (labels.get(a) ?? a).localeCompare(labels.get(b) ?? b))
    .map(([key, block]) => ({
      key,
      label: labels.get(key) ?? accountLabel(block),
      best: judged.bestByAccount.get(key) ?? null,
      rows: [...block].sort(compare),
    }));
}

export interface CountComparisonPoint {
  ascensions: number;
  /**
   * Days after the series' anchor (`CountComparison.anchor`): the account's earliest finish, so 0 only
   * at the count that holds it, or on a solid line whose run no longer stands, that run's own best
   * count. The one number on this chart that compares across runs made on different days.
   */
  behind: number;
  /** When the plan reaches the target (ms), or null when the start or timezone is missing. */
  finish: number | null;
  /** The plan's own length, from its own start. For the tooltip, never for comparing. */
  days: number;
  /** Where the account was when it ran this, because it moves between runs and changes the total. */
  currentTE: number;
  finalTE: number;
  runId: string;
  chain: number[];
}

export interface CountComparison {
  /** Unique per series. Carries the run id when one exhaustive run supplied every point. */
  key: string;
  /** The account the series belongs to, so every chart on the page can colour it the same. */
  accountKey: string;
  label: string;
  points: CountComparisonPoint[];
  /** True when every point came out of ONE exhaustive run, which is the only airtight version. */
  singleRun: boolean;
  /**
   * What `behind` is measured from. `account`: the account's earliest finish, at `anchorFinish`.
   * `run`: a solid line whose run no longer stands, measured from that run's own best count instead,
   * because its finishes do not compare with the account's (`note` says why it no longer stands).
   */
  anchor: 'account' | 'run';
  /** The finish `behind` counts from (ms), or null when it has no date. */
  anchorFinish: number | null;
  /** Why a `run`-anchored line's run no longer stands, in player words. Empty otherwise. */
  note: string;
}

/**
 * "Does one more ascension help?", per account, as days after that account's earliest finish.
 *
 * Two grades of evidence, and the difference is worth stating on the chart rather than burying:
 *
 *   - A single exhaustive run that priced several counts knows the answer outright -- every chain
 *     at both counts was priced from the same save at the same instant, so the comparison holds
 *     every input fixed. That is `proof.byAscensions`, and a series built from it is marked
 *     `singleRun`. Each count's point is that run's own finish date at that count.
 *   - Several runs from one account, made on different days. Their totals do NOT compare (a run
 *     made a day later is a day shorter), so each count's point is the EARLIEST FINISH among that
 *     account's runs at that count whose finish still stands (`judgeFinishes`): not a what-if, not
 *     from an old save, not replaced by a newer run of the same plan, not fallen behind. Built for
 *     an account with a proof too, so counts the proof did not cover still show.
 *
 * ONE ANCHOR PER ACCOUNT. Both lines count from the account's earliest finish: the earliest of its
 * best standing finish (`judged.bestByAccount`, taken from every shown run, so it can be one that
 * Proofs only leaves out of `rows`) and the proof run's own best finish. Measuring the solid line
 * from its own best instead put rontimes' 6 ascensions on 0 at 28 Nov when that account's earliest
 * finish is 18 Nov, ten days before. That holds only while the proof run stands: a what-if or a run
 * from an old save does not compare with the account's finishes, so its line is measured from its
 * own best count and says so (`anchor: 'run'`).
 *
 * A line with only one count is dropped: a single point makes no comparison and adds a legend
 * entry to a chart that lives on being readable.
 */
export function compareCounts(rows: CollectorRow[], judged: FinishJudgement): CountComparison[] {
  const out: CountComparison[] = [];

  for (const account of groupByAccount(rows)) {
    let anchorFinish = judged.bestByAccount.get(account.key)?.finish ?? null;

    // A run that measured several counts by itself; one that still stands if there is one.
    const proofs = account.rows.filter(r => (r.proof?.byAscensions?.length ?? 0) > 1);
    const proven = proofs.find(r => judged.byId.get(r.id)?.standing) ?? proofs[0];
    if (proven) {
      const j = judged.byId.get(proven.id);
      const entries = proven.proof!.byAscensions;
      const fastest = Math.min(...entries.map(e => e.days));
      const start = j?.start ?? null;
      const stands = !!j?.standing && start != null;
      if (stands) anchorFinish = Math.min(anchorFinish ?? Infinity, start + fastest * DAY_MS);
      out.push({
        key: `${account.key}#${proven.id}`,
        accountKey: account.key,
        label: `${account.label} (one exhaustive run)`,
        singleRun: true,
        anchor: stands ? 'account' : 'run',
        anchorFinish: stands ? anchorFinish : start == null ? null : start + fastest * DAY_MS,
        note: stands ? '' : j?.reason || 'no finish date',
        points: entries
          .map(entry => {
            const finish = start == null ? null : start + entry.days * DAY_MS;
            return {
              ascensions: entry.ascensions,
              // Standing: from the account's earliest finish. Not: from its own best count, where one
              // save and one start make the totals say what the finishes would.
              behind: stands ? (finish! - anchorFinish!) / DAY_MS : entry.days - fastest,
              finish,
              days: entry.days,
              currentTE: proven.currentTE,
              finalTE: proven.finalTE,
              runId: proven.id,
              chain: entry.chain,
            };
          })
          .sort((a, b) => a.ascensions - b.ascensions),
      });
    }

    const bestPerCount = new Map<number, { row: CollectorRow; finish: number }>();
    for (const row of account.rows) {
      const j = judged.byId.get(row.id);
      if (!j?.standing || j.finish == null) continue;
      const held = bestPerCount.get(row.ascensions);
      if (!held || j.finish < held.finish) bestPerCount.set(row.ascensions, { row, finish: j.finish });
    }
    if (bestPerCount.size < 2) continue;
    // Every run here stands and is shown, so the account's best is at or before each of them; the
    // fallback is only for a judgement made without this account's runs in it.
    const earliest = anchorFinish ?? Math.min(...[...bestPerCount.values()].map(b => b.finish));
    out.push({
      key: account.key,
      accountKey: account.key,
      label: account.label,
      singleRun: false,
      anchor: 'account',
      anchorFinish: earliest,
      note: '',
      points: [...bestPerCount.values()]
        .map(({ row: r, finish }) => ({
          ascensions: r.ascensions,
          behind: (finish - earliest) / DAY_MS,
          finish,
          days: r.durationDays,
          currentTE: r.currentTE,
          finalTE: r.finalTE,
          runId: r.id,
          chain: r.chain,
        }))
        .sort((a, b) => a.ascensions - b.ascensions),
    });
  }

  return out.sort((a, b) => Number(b.singleRun) - Number(a.singleRun) || b.points.length - a.points.length);
}

/**
 * The plateau around the winner in one run's full table, per checkpoint position.
 *
 * Same statistic `scripts/analyzeChainCorpus.py` computes for the suggester's band table, run here
 * on one file so the page can show where a single run's near-best chains actually sat. `tolerance`
 * is a fraction of that run's own best, not an absolute number of days: a 1% plateau on a 300-day
 * plan and on a 1,300-day plan are different questions and the same word.
 *
 * Restricted to one ascension count because positions only line up within one: the third
 * checkpoint of a six-chain and of an eight-chain are not the same thing.
 */
export function nearBestBands(
  chains: PricedChain[],
  currentTE: number,
  finalTE: number,
  ascensions: number,
  tolerance = 0.01
): { bands: PositionBand[]; near: number; total: number; bestDays: number; bestChain: number[] } | null {
  const atCount = chains.filter(c => c.prestiges === ascensions);
  if (!atCount.length || !(finalTE > currentTE)) return null;

  const best = atCount.reduce((a, b) => (b.days < a.days ? b : a));
  const cutoff = best.days * (1 + tolerance);
  const near = atCount.filter(c => c.days <= cutoff);

  const columns: number[][] = [];
  for (const entry of near) {
    chainFractions(entry.chain, currentTE, finalTE).forEach((f, i) => {
      if (!columns[i]) columns[i] = [];
      columns[i].push(f);
    });
  }

  return {
    bands: bandsFromColumns(columns),
    near: near.length,
    total: atCount.length,
    bestDays: best.days,
    bestChain: best.chain,
  };
}

/** Targets present in the data, commonest first. Durations only compare within one. */
export function targetsPresent(rows: CollectorRow[]): { finalTE: number; runs: number }[] {
  const counts = new Map<number, number>();
  for (const row of rows) counts.set(row.finalTE, (counts.get(row.finalTE) ?? 0) + 1);
  return [...counts.entries()]
    .map(([finalTE, runs]) => ({ finalTE, runs }))
    .sort((a, b) => b.runs - a.runs || a.finalTE - b.finalTE);
}

/** Every run once: the copies of one result folded onto the copy that stands for it. */
export interface FoldedRuns {
  /** One row per result, in the order the rows came in. */
  rows: CollectorRow[];
  /** Ids of the other copies, hidden everywhere on the page. */
  hidden: Set<string>;
  /** How many times each shown row's result was sent, by its id, when more than once. */
  sends: Map<string, number>;
}

/** 2 for a finished proof, 1 for a run tagged with its sweep, 3 for both: what "Proofs only", the
 *  sweep chart and the data needs look for in a row. */
function evidenceRank(row: CollectorRow): number {
  return (row.space && !row.space.stoppedEarly ? 2 : 0) + (row.sweep ? 1 : 0);
}

/**
 * The copy this page shows for one result (`foldCopies`' group `f`), under the name and owner
 * `foldCopies` gave it.
 *
 * `foldCopies` stands for a result by its biggest search, which suits the Leaderboard and not this
 * page: an F2 table (1,750 chains, a finished proof) and a thorough run that found the same result
 * (5,806 chains priced, no space) showed only the thorough one, so "Proofs only" dropped the result,
 * the sweep chart lost its curve and the data needs lost the coverage. Here a finished proof, or a run
 * tagged with its sweep, is shown when the result has one -- chosen only among the copies `foldCopies`
 * would let stand for it (`ownCopies`), so a stranger's anonymous copy with a made-up `space` still
 * cannot stand for an owner's result. Among equals it is `foldCopies`' order: the biggest search, then
 * a CSV, then the earliest.
 *
 * `who` must file rows the way the fold that made `f` did (`playerKey` over that fold's filing).
 */
function shownCopy(f: Folded<CollectorRow>, who: (r: CollectorRow) => string): CollectorRow {
  const own = ownCopies(f.copies, f.player ?? '', who);
  const size = (r: CollectorRow) => r.space?.chains || r.chainsPriced || 0;
  let pick = f.copies.find(c => c.id === f.row.id) ?? f.row;
  for (const c of f.copies) {
    if (!own.has(c)) continue;
    const d =
      evidenceRank(c) - evidenceRank(pick) || size(c) - size(pick) || Number(!!c.hasCsv) - Number(!!pick.hasCsv);
    if (d > 0) pick = c;
  }
  if (pick.id === f.row.id) return f.row;
  // The name and the owner are the result's, as `foldCopies` gave them: never the copy's own.
  let row = pick;
  if (row.nickname !== f.row.nickname) {
    row = { ...row, nickname: f.row.nickname };
    if (row.nickname === undefined) delete row.nickname;
  }
  if (row.acct !== f.row.acct) {
    row = { ...row, acct: f.row.acct };
    if (row.acct === undefined) delete row.acct;
  }
  return row;
}

/**
 * Fold copies of one result, with the Leaderboard's own rule (`foldCopies`): the same plan from the
 * same save sent more than once -- a double-clicked Submit, an automatic send and a manual one, an
 * anonymous send and then a named one -- is one row. The name and the owner tag do not count as
 * content, so a named and an anonymous send of Allan's 663.27-day run are one run, not two, and the
 * row shown carries the name. The copy shown is a finished proof or a tagged sweep when the result
 * has one, else its biggest search (`shownCopy`), so "Proofs only" and the sweep chart keep it.
 *
 * Two different players are never folded together, even on identical content.
 */
export function foldRuns(rows: CollectorRow[]): FoldedRuns {
  const shown: CollectorRow[] = [];
  const hidden = new Set<string>();
  const sends = new Map<string, number>();
  const filing = fileRows(rows);
  const who = (r: CollectorRow) => playerKey(filing, r);
  for (const f of foldCopies(rows, filing)) {
    const row = shownCopy(f, who);
    shown.push(row);
    for (const copy of f.copies) if (copy.id !== row.id) hidden.add(copy.id);
    if (f.copies.length > 1) sends.set(row.id, f.copies.length);
  }
  return { rows: shown, hidden, sends };
}

/**
 * The chips on a run's route in the runs table: the Leaderboard's `settingTags` (what tells two runs
 * with one route and start apart), plus `time off` on every run planned around some, which
 * `settingTags` does not look at. With those runs included, a time-off run with the same save, start
 * and route as a normal one read as the same row nine days later.
 */
export function runTags(rows: readonly CollectorRow[]): Map<CollectorRow, string[]> {
  const tags = settingTags(rows);
  for (const r of rows) if (r.timeOff?.length) tags.set(r, [...(tags.get(r) ?? []), 'time off']);
  return tags;
}

/** What one run checked, as the runs table's "What was checked" column shows it. */
export interface Searched {
  /** How it searched: `exhaustive`, `partial` (a box it did not finish), or a staged search's effort. */
  how: string;
  /**
   * Where it looked, in the notation players type into the planner (`181-250:5; 215-300:5`, the
   * step always written), with the gap between targets and, when it covered several, the ascension
   * counts. Empty for a staged search: it improved a seed chain rather than trying a fixed set of
   * TEs, so there is no box to show.
   */
  where: string;
  /**
   * `where` cut where a line may wrap: one checkpoint's band each (with its `;`), then `· gap 10`.
   * A band never breaks at its own hyphen, and joined with spaces the pieces are `where` again, so
   * what a player copies off the page pastes straight into the planner.
   */
  pieces: string[];
  /** The same in words, for the tooltip. */
  title: string;
  /** For a box: every plan in it was priced. False for a staged search, which has no box. */
  finished: boolean;
}

/** `every TE`, `every 5th TE`, or the one TE a band allowed. */
function everyText(values: readonly number[]): string {
  if (values.length === 1) return `only ${values[0]}`;
  const step = values[1] - values[0];
  const even = values.every((v, i) => i === 0 || v - values[i - 1] === step);
  if (!even) return values.join(', ');
  const every = step === 1 ? 'every TE' : `every ${step}${step === 2 ? 'nd' : step === 3 ? 'rd' : 'th'} TE`;
  return `${values[0]} to ${values[values.length - 1]}, ${every}`;
}

/**
 * What a run checked: the box an exhaustive (or cut-short) run enumerated, from `space`, which holds
 * the TEs themselves rather than the typed text, so this is what was really tried; or, for a staged
 * search, just its effort and size. A sweep's preset name (M3, F2 ...) goes with `how`.
 */
/**
 * How many plans of its own box a run priced. The planner writes `space.chainsPriced` as 0, and
 * `stoppedEarly` as false, when a run starts, and fills both in when it ends; a row still holding
 * both starting values is a run whose end never filled them in (three on the board on 26 Sep, one
 * saying 0 of 2,979 while the row priced 2,979). The row's own `chainsPriced` is then the best record
 * of what it priced, capped at the box. A run marked stopped wrote its count when it stopped, so a 0
 * there is real.
 */
export function boxPriced(row: CollectorRow): number {
  const sp = row.space;
  if (!sp) return 0;
  const recorded = sp.chainsPriced > 0 || sp.stoppedEarly ? sp.chainsPriced : row.chainsPriced;
  return Math.max(0, Math.min(Number.isFinite(recorded) ? recorded : 0, sp.chains));
}

export function searchedOf(row: CollectorRow): Searched {
  const sp = row.space;
  const preset = row.sweep?.preset ? ` · ${row.sweep.preset}` : '';
  const priced = (row.chainsPriced ?? 0).toLocaleString('en-US');
  if (!sp) {
    return {
      how: `${foundByText(row)}${preset}`,
      where: '',
      pieces: [],
      finished: false,
      title: `A ${row.effort || 'staged'} search: it improved on a seed chain rather than trying a fixed set of TEs, so there is no box to show. ${priced} plans priced.`,
    };
  }
  const asc = sp.minAscensions === sp.maxAscensions ? `${sp.minAscensions}` : `${sp.minAscensions}-${sp.maxAscensions}`;
  const pieces: string[] = [];
  const words: string[] = [];
  if (sp.mode === 'range' && sp.range) {
    const { lo, hi, step } = sp.range;
    pieces.push(`${lo}-${hi}:${step} for every target`, `· ${asc} asc`);
    words.push(
      `Every target drawn from one pool, ${everyText(Array.from({ length: Math.floor((hi - lo) / step) + 1 }, (_, i) => lo + i * step))}; ${asc} ascensions.`
    );
  } else if (sp.bands?.length) {
    sp.bands.forEach((b, i) => pieces.push(formatBand(b) + (i < sp.bands!.length - 1 ? ';' : '')));
    if (sp.minAscensions !== sp.maxAscensions) pieces.push(`· ${asc} asc`);
    words.push(`${sp.bands.map((b, i) => `ascension ${i + 1} at ${everyText(b)}`).join('; ')}.`);
  }
  if (sp.minGap > 0) {
    pieces.push(`· gap ${sp.minGap}`);
    words.push(`Targets at least ${sp.minGap} TE apart.`);
  }
  const done = boxPriced(row);
  const finished = done >= sp.chains && !sp.stoppedEarly;
  words.push(
    finished
      ? `All ${sp.chains.toLocaleString('en-US')} plans in the box priced, so its best is the best in the box.`
      : `${sp.stoppedEarly ? 'Stopped after' : 'It recorded pricing only'} ${done.toLocaleString('en-US')} of the ${sp.chains.toLocaleString('en-US')} plans in the box, so its best is the best of those, not a proof.`
  );
  const title = words.join(' ');
  return {
    // A box the run did not finish is partial, whether it was stopped or just never recorded the rest.
    how: `${finished ? foundByText(row) : 'partial'}${preset}`,
    finished,
    where: pieces.join(' '),
    pieces,
    title: title[0].toUpperCase() + title.slice(1),
  };
}

/**
 * Why a row should not be trusted, or null.
 *
 * One rule so far: the final leg's delivery rate is far below what the row's own gear reaches from
 * that checkpoint. That is how the "delivery set used for earnings research" bug shows up -- the
 * earnings side was researched with the wrong set, the farm never reached its real delivery rate,
 * and the plan took hundreds of days longer. See `checkFinalLegRate` for the threshold.
 */
export function flagOf(row: Submission): string | null {
  const rate = checkFinalLegRate(row.chain, row.legs, row.delivery);
  if (rate?.suspect) {
    return `Final leg peaks at ${rate.measuredQph.toFixed(2)} q/hr; this gear reaches about ${rate.expectedQph.toFixed(2)} from ${row.chain[row.chain.length - 2]} TE. Looks like the old delivery-set-for-earnings bug.`;
  }
  return null;
}

/**
 * Which sweep a row belongs to, for the per-sweep chart. A tagged upload says so itself; an
 * untagged exhaustive run is grouped by its ascension count, which is what the presets differ by.
 * A staged (seeded) run is not a sweep and gets null.
 */
export function sweepGroupOf(row: Submission): string | null {
  if (row.sweep?.preset && row.sweep.preset !== 'custom') return row.sweep.preset;
  if (row.space) return `${row.ascensions} ascensions`;
  return null;
}

export interface Gear {
  /** 0-1 share of the best delivery set. */
  delivery: number | null;
  clothedTE: number | null;
  /** Highest peak delivery any leg reached, q/hr. */
  peakQph: number | null;
}

/**
 * A row's gear as the two percent-of-perfect numbers. Uses what the row recorded when it recorded
 * it (schema 6) and recomputes from its loadouts otherwise, so older rows are not left blank.
 */
export function gearOf(row: Submission): Gear {
  const delivery = row.deliveryScore?.score ?? deliveryScore(slotsFromLabels(row.delivery))?.score ?? null;
  const maxed = !!row.colleggtibles?.maxed && !!row.epicResearch?.maxed;
  const clothedTE = row.clothedTE ?? clothedTEFromLabels(row.currentTE, row.earnings, maxed);
  const peaks = (row.legs ?? []).map(l => l.peakDeliveryQph).filter(v => Number.isFinite(v) && v > 0);
  return { delivery, clothedTE, peakQph: peaks.length ? Math.max(...peaks) : null };
}
