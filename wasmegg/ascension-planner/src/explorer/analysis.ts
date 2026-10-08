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
 *      cross-account view is built on the chain SHAPE -- where the checkpoints sit against where
 *      that account started -- or on one leg's own length, which is the part that travels. Across
 *      accounts each account counts once, by its own best plan (`bestPerCount`), never by how many
 *      runs it sent.
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
import { formatBand, parseBands } from '@/search/exhaustive';
import type { Submission } from '@/search/submission';
import type { PricedChain } from '@/search/types';
import type { CollectorRow } from './collector';
import { checkFinalLegRate, clothedTEFromLabels, deliveryScore, slotsFromLabels } from '@/search/virtueScore';
import {
  accountKeyOf,
  artifactLabels,
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
  sameBuild,
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

/** When a row was sent, as an ISO string that sorts; '' when it carries neither stamp. */
function sentAt(row: Pick<CollectorRow, 'submittedAt' | 'receivedAt'>): string {
  return row.submittedAt || row.receivedAt || '';
}

/**
 * Two accounts never share a name.
 *
 * One player can be two accounts here: the key is the artifact set, so upgrading one artifact starts
 * a new account under the same nickname (Willsalt's Puzzle cube, T4E to T4L, between 19 and 24 Sep).
 * ECharts builds a legend entry per series NAME, so the two drew as one "Willsalt" entry that toggled
 * both lines, and the gear chart listed "Willsalt" twice with nothing to tell them apart. A shared
 * name gets the artifact that tells the accounts apart ("Willsalt · T4E cube", "Willsalt · T4L
 * cube"): it is what the key already is, what the player upgraded, and it never changes. The TE of
 * each account's newest run, which this used before, renamed the account on every chart whenever it
 * sent another run, while What we know still called it by the old name. When the artifacts do not
 * tell them apart (the same set in two timezones, or several upgrades at once), a number in the
 * order the accounts first sent a run ("Willsalt", "Willsalt (2)"), which does not move either. The
 * key does not change, so colours do not either.
 */
function distinguishLabels(accounts: Account[]): void {
  const byLabel = new Map<string, Account[]>();
  for (const a of accounts) {
    const same = byLabel.get(a.label);
    if (same) same.push(a);
    else byLabel.set(a.label, [a]);
  }
  for (const [label, same] of byLabel) {
    if (same.length < 2) continue;
    const byArtifact = same.map(a => ownArtifact(a, same));
    if (byArtifact.every(Boolean) && new Set(byArtifact).size === same.length) {
      same.forEach((a, i) => (a.label = `${label} · ${byArtifact[i]}`));
      continue;
    }
    const first = (a: Account) => a.rows.map(sentAt).reduce((x, y) => (y && (!x || y < x) ? y : x), '');
    [...same]
      .sort((x, y) => first(x).localeCompare(first(y)) || x.key.localeCompare(y.key))
      .forEach((a, i) => (a.label = i ? `${label} (${i + 1})` : label));
  }
}

/**
 * The one artifact this account has that none of the others under its name do, short: tier plus the
 * last word of the name ("T4L Puzzle cube" -> "T4L cube"), which is what the legend has room for and
 * still says which piece. Null when it has none, or more than one.
 */
function ownArtifact(account: Account, same: Account[]): string | null {
  const others = new Set(same.filter(a => a !== account).flatMap(a => artifactLabels(a.rows[0])));
  const own = artifactLabels(account.rows[0]).filter(label => !others.has(label));
  if (own.length !== 1) return null;
  const m = /^(T\d+[A-Z]?)\s+(.*\S)\s*$/.exec(own[0]);
  return m ? `${m[1]} ${m[2].split(/\s+/).pop()}` : own[0];
}

/** Accounts on these rows, busiest first. No two share a label (`distinguishLabels`). */
export function groupByAccount(rows: CollectorRow[]): Account[] {
  const buckets = new Map<string, CollectorRow[]>();
  for (const row of rows) {
    const key = accountKey(row);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }
  const accounts = [...buckets.entries()].map(([key, group]) => ({
    key,
    label: accountLabel(group),
    rows: group,
    counts: [...new Set(group.map(r => r.ascensions))].sort((a, b) => a - b),
  }));
  distinguishLabels(accounts);
  return accounts.sort((a, b) => b.rows.length - a.rows.length || a.label.localeCompare(b.label));
}

/**
 * Every account on these rows, in the order it first sent a run (then by key): the page's colour
 * order. Pass it every row there is, filters or not, so that ticking a box never repaints an
 * account. Ranked by run count, as the colours used to be, "include flagged runs" swapped
 * allanfieldhouse's and Williamthe5thc's colours.
 */
export function accountOrder(rows: CollectorRow[]): string[] {
  const first = new Map<string, string>();
  for (const row of rows) {
    const key = accountKey(row);
    const at = sentAt(row);
    const held = first.get(key);
    if (held === undefined || (at && (!held || at < held))) first.set(key, at);
  }
  // A row with no stamp at all sorts after every stamped one, not before.
  const rank = (at: string) => at || '￿';
  return [...first.entries()]
    .sort((a, b) => rank(a[1]).localeCompare(rank(b[1])) || a[0].localeCompare(b[0]))
    .map(e => e[0]);
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

/**
 * Least-squares slope of `ys` on `xs`, or null with fewer than three points or a single x: two
 * points always sit on a line, so a slope from them says nothing about a trend.
 */
export function leastSquaresSlope(xs: readonly number[], ys: readonly number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += xs[i] / n;
    my += ys[i] / n;
  }
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  return sxx > 0 ? sxy / sxx : null;
}

/** One checkpoint position across accounts, in every form the checkpoint chart's table shows. */
export interface CheckpointSummary {
  /** 0-based checkpoint index. */
  index: number;
  /** Runs behind it: one per account. */
  accounts: number;
  /** The checkpoint's TE, lowest and highest. */
  te: { lo: number; hi: number };
  /** The checkpoint's TE minus the TE its plan started from, lowest and highest. */
  aboveStart: { lo: number; hi: number };
  /** As a share of each plan's own journey: lowest, median, highest. */
  share: PositionBand;
  /**
   * TE the checkpoint moves per TE higher the plan starts (`leastSquaresSlope`): about 0 is a fixed
   * TE whoever you are, about 1 moves one-for-one with your start. Null under three accounts.
   */
  slope: number | null;
}

/**
 * Where each checkpoint sits across accounts, from ONE run per account (`bestPerCount`), three ways:
 * as a TE, as TE above the start, and as a share of the journey, with the slope that says which of
 * them travels. None is right for every checkpoint: on 26 Sep the last 3-ascension checkpoint sat at
 * 279-288 TE whether the account started at 124 or 199 (slope 0.05), while the first 6-ascension one
 * moved almost one-for-one with the start (0.91), and at 5 to 7 ascensions the last one spreads 12 to
 * 21 TE either way. The table used to turn the median share back into TE on a median journey, which
 * put a 157->490 account's last 3-ascension checkpoint at 260-301 when every account's was 279-288.
 */
export function summariseCheckpoints(rows: readonly Submission[]): CheckpointSummary[] {
  const shares = positionBands([...rows]);
  const out: CheckpointSummary[] = [];
  for (const share of shares) {
    const i = share.index;
    const at = rows.filter(r => r.chain.length - 1 > i);
    const te = at.map(r => r.chain[i]);
    const above = at.map(r => r.chain[i] - r.currentTE);
    out.push({
      index: i,
      accounts: at.length,
      te: extent(te),
      aboveStart: extent(above),
      share,
      slope: leastSquaresSlope(
        at.map(r => r.currentTE),
        te
      ),
    });
  }
  return out;
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
    exhaustive: rows.filter(isProof).length,
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
 * Returns the reason for each plan this replaces, in the Leaderboard's words, its date on `zone`'s
 * calendar when given (the Leaderboard's `RankOptions.zone`), else on the newer run's own.
 */
function replacedAcrossLines(
  plans: readonly Plan<CollectorRow>[],
  filing: Filing,
  zone?: string
): Map<Plan<CollectorRow>, string> {
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
      // On the viewer's calendar when the page gives one, as the Planned and Finishes cells are.
      const when = formatDate(newer.start, zone ?? newer.row.timezone, { day: 'numeric', month: 'short' });
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
   * Made from the same save as the account's best, planned around the same time off and priced by the
   * same planner build, so the gap is the plans alone. A run planned around time off can share its
   * save, start and route with a normal run, and then the gap is the farm stopping and being rebuilt
   * (`sameSave` does not look at it); a new build moves finishes by itself (`sameBuild`, as on the
   * Leaderboard).
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

/**
 * The expensive half of `judgeFinishes`: every run at `finalTE` judged by the Leaderboard's rules
 * (`groupPlayers`, then `replacedAcrossLines`), before `shown` picks each account's best. Nothing in
 * it depends on which runs are shown, so a page can keep one per target and ask `finishJudgement`
 * again when a filter changes, and read the what-ifs off it (`whatIfIds`) without grouping the
 * players a second time. Opaque: read it through those two.
 */
export interface AssessedFinishes {
  readonly finalTE: number;
  /** @internal Every copy's id -> the plan it is judged on. */
  readonly plans: ReadonlyMap<string, Plan<CollectorRow>>;
  /** @internal Plans `replacedAcrossLines` replaced, with the reason. */
  readonly replaced: ReadonlyMap<Plan<CollectorRow>, string>;
  /** @internal `groupPlayers`' filing, for naming each account's best by its shown copy. */
  readonly filing: Filing;
}

/** `rows`, `finalTE`, `now` and `zone` as for `judgeFinishes`. */
export function assessFinishes(rows: CollectorRow[], finalTE: number, now: number, zone?: string): AssessedFinishes {
  // `groupPlayers`' own filing, over the rows it ranks (its `rankable`: a route and no flags), and its
  // own key for the line a folded run is filed under. Keep both in step with it.
  const filing = fileRows(rows.filter(r => Array.isArray(r.chain) && !r.flags?.length));
  const lineOf = (f: Folded<CollectorRow>) =>
    (f.player ?? playerKey(filing, f.row)) || `account:${accountKeyOf(f.row)}`;

  const plans = new Map<string, Plan<CollectorRow>>();
  const lines: Plan<CollectorRow>[] = [];
  for (const player of groupPlayers(rows, { target: finalTE, now, zone })) {
    for (const plan of player.plans) {
      if (lineOf(plan.folded) !== player.key) continue;
      lines.push(plan);
      for (const copy of plan.folded.copies) if (copy.id) plans.set(copy.id, plan);
    }
  }
  return { finalTE, plans, replaced: replacedAcrossLines(lines, filing, zone), filing };
}

/** A plan's state once `replacedAcrossLines` has had its say: what `RunFinish.state` reports. */
function assessedState(assessed: AssessedFinishes, plan: Plan<CollectorRow>): PlanState {
  return assessed.replaced.has(plan) ? 'replaced' : plan.state;
}

/**
 * The ids of every run the Leaderboard's rules call a what-if in these assessments (one per target):
 * the same runs `judgeFinishes(...).byId` gives the state `what-if`, without judging again.
 */
export function whatIfIds(assessments: Iterable<AssessedFinishes>): Set<string> {
  const out = new Set<string>();
  for (const assessed of assessments) {
    for (const [id, plan] of assessed.plans) if (assessedState(assessed, plan) === 'what-if') out.add(id);
  }
  return out;
}

/** The cheap half of `judgeFinishes`: each account's best among the runs `shown`, and every run's
 *  finish against it. */
export function finishJudgement(assessed: AssessedFinishes, shown?: ReadonlySet<string>): FinishJudgement {
  const { plans, replaced, filing } = assessed;
  const stateOf = (plan: Plan<CollectorRow>): PlanState => assessedState(assessed, plan);
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
        !!best &&
        best !== plan &&
        sameSave(plan.row, best.row) &&
        sameBuild(plan.row, best.row) &&
        timeOffKey(plan.row) === timeOffKey(best.row),
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

/** One account's representative run at one ascension count. */
export interface CountBest {
  accountKey: string;
  ascensions: number;
  row: CollectorRow;
  /** When the plan reaches the target (ms). Null only on a stand-in with no date. */
  finish: number | null;
  /** False on a stand-in: the account's newest run at that count, none of which still stands. */
  standing: boolean;
}

/**
 * Per account, per ascension count: the run with the EARLIEST STANDING FINISH (`judgeFinishes`), so
 * whatever summarises across accounts counts each account once, by the plan it would actually run.
 * Counting runs instead let the account that sent the most decide the answer: seven of the sixteen
 * 5-ascension runs were allanfieldhouse's, and the per-run median put checkpoint 3 about 10 TE lower
 * than the median of the accounts' own best plans. A tie goes to the more recent start, as on the
 * Leaderboard.
 *
 * `standIn`: for an account none of whose runs at a count still stands (all replaced, or behind),
 * use its newest run there instead, marked `standing: false`, rather than drop the account. Right for
 * a SHAPE, which is still that account's plan; never for a finish, which no longer compares.
 *
 * Returns account key -> ascension count -> its run, accounts in the order their rows come.
 */
export function bestPerCount(
  rows: CollectorRow[],
  judged: FinishJudgement,
  { standIn = false }: { standIn?: boolean } = {}
): Map<string, Map<number, CountBest>> {
  const out = new Map<string, Map<number, CountBest>>();
  const newest = new Map<string, Map<number, CollectorRow>>();
  const startOf = (r: CollectorRow) => judged.byId.get(r.id)?.start ?? -Infinity;
  for (const row of rows) {
    const key = accountKey(row);
    if (!out.has(key)) out.set(key, new Map());
    const j = judged.byId.get(row.id);
    if (j?.standing && j.finish != null) {
      const counts = out.get(key)!;
      const held = counts.get(row.ascensions);
      if (
        !held ||
        j.finish < held.finish! ||
        (j.finish === held.finish && (j.start ?? -Infinity) > startOf(held.row))
      ) {
        counts.set(row.ascensions, {
          accountKey: key,
          ascensions: row.ascensions,
          row,
          finish: j.finish,
          standing: true,
        });
      }
    } else if (standIn) {
      if (!newest.has(key)) newest.set(key, new Map());
      const counts = newest.get(key)!;
      const held = counts.get(row.ascensions);
      const later = (a: CollectorRow, b: CollectorRow) =>
        startOf(a) > startOf(b) || (startOf(a) === startOf(b) && sentAt(a) > sentAt(b));
      if (!held || later(row, held)) counts.set(row.ascensions, row);
    }
  }
  for (const [key, counts] of newest) {
    const own = out.get(key)!;
    for (const [ascensions, row] of counts) {
      if (own.has(ascensions)) continue;
      own.set(ascensions, {
        accountKey: key,
        ascensions,
        row,
        finish: judged.byId.get(row.id)?.finish ?? null,
        standing: false,
      });
    }
  }
  for (const [key, counts] of out) if (!counts.size) out.delete(key);
  return out;
}

// ------------------------------------------------------------------------------ search effort

/**
 * Under this many days apart, two finishes are the same finish: half the two-decimal step the page
 * prints days in, so a gap is never shown as `+0.00 d`.
 */
export const SAME_FINISH_DAYS = 0.005;

/**
 * The most a box that steps over TEs has been seen to leave on the table, in days: the top of each
 * range in What we know (every 2nd TE has ended up 0.4 to 6 days behind trying every TE, every 5th
 * 2 to 12). A gap bigger than this is bigger than anything a finer search has found so far. A 4th
 * step sits between the two measured ones and takes the larger. Nothing coarser than every 5th TE
 * has been measured (every 10th, 11th and 20th are on the board), so a box like that gets no bound
 * at all (`searchGrade`: penalty null) and a gap it loses is never settled.
 */
export const STEP_PENALTY_DAYS = { everyTE: 0, fine: 6, coarse: 12 } as const;

/** The coarsest step `STEP_PENALTY_DAYS` has a measurement for. */
const MEASURED_STEP = 5;

/** How thoroughly one run searched, for weighing a gap it is on one side of. */
export interface SearchGrade {
  /**
   * `every-te`: a finished box at every TE, so its best is the best in its box. `coarse`: a finished
   * box that stepped over TEs. `staged`: a staged search, or a box it did not finish, where nothing
   * bounds what it missed.
   */
  kind: 'every-te' | 'coarse' | 'staged';
  /** The widest step between the TEs it tried at any checkpoint; Infinity when there is no box. */
  step: number;
  /**
   * The step at each checkpoint, first to last (1 for every TE or a single TE); empty when there is
   * no box. `judgeStep` compares two searches checkpoint by checkpoint, not by the widest step alone.
   */
  steps: number[];
  /**
   * The most a finer search could still find, in days (`STEP_PENALTY_DAYS`); null when unknown: a
   * staged search, or a box coarser than every 5th TE, which has never been measured.
   */
  penalty: number | null;
  /** In player words: `every TE`, `every 5th TE`, `up to every 6th TE`, `staged (thorough)`. */
  text: string;
}

function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}

/** The widest step between neighbouring TEs in one checkpoint's band; 1 for a single TE. */
function bandStep(band: readonly number[]): number {
  const sorted = [...band].sort((a, b) => a - b);
  let widest = 1;
  for (let i = 1; i < sorted.length; i++) widest = Math.max(widest, sorted[i] - sorted[i - 1]);
  return widest;
}

/** Every step a box took between the TEs it tried, one per checkpoint. A pool (`range`) uses one
 *  step at every checkpoint of the plan. */
function boxSteps(space: NonNullable<CollectorRow['space']>, checkpoints: number): number[] {
  if (space.mode === 'range' && space.range) return Array(Math.max(1, checkpoints)).fill(Math.max(1, space.range.step));
  return (space.bands ?? []).map(bandStep);
}

/**
 * An uploaded sweep's steps, read off the bands it was tagged with (`sweep.bands`, the text needs.ts
 * reads too; a TE-relative first band like `+1-+38:1` has the same step). An upload carries no
 * `space`, but its CSV's own chain count already guards against a partial file, so it is a finished
 * box like any other: graded as a staged search, a finished every-TE sweep drew as a cross, could
 * never settle a gap it lost and counted as the coarser side of one it won. Null when it was sent
 * with no bands, so nothing says what it tried.
 */
function uploadSteps(row: CollectorRow): number[] | null {
  const bands = row.sweep?.bands ? parseBands(row.sweep.bands) : [];
  return bands.length ? bands.map(bandStep) : null;
}

export function searchGrade(row: CollectorRow): SearchGrade {
  const upload = !row.space && row.source === 'upload';
  const steps = row.space
    ? isProof(row)
      ? boxSteps(row.space, row.chain.length - 1)
      : null
    : upload
      ? uploadSteps(row)
      : null;
  if (!steps) {
    return {
      kind: 'staged',
      step: Infinity,
      steps: [],
      penalty: null,
      text: row.space ? 'box not finished' : upload ? 'uploaded, box not given' : `staged (${foundByText(row)})`,
    };
  }
  const step = steps.length ? Math.max(...steps) : 1;
  if (step <= 1) {
    return {
      kind: 'every-te',
      step: 1,
      steps: steps.length ? steps : [1],
      penalty: STEP_PENALTY_DAYS.everyTE,
      text: 'every TE',
    };
  }
  const uneven = steps.some(s => s !== step);
  return {
    kind: 'coarse',
    step,
    steps,
    penalty: step <= 3 ? STEP_PENALTY_DAYS.fine : step <= MEASURED_STEP ? STEP_PENALTY_DAYS.coarse : null,
    text: `${uneven ? 'up to ' : ''}every ${ordinal(step)} TE`,
  };
}

/**
 * Whether `a` was searched at least as coarsely as `b` at every checkpoint and more coarsely at one
 * or more, lined up from the last checkpoint (a plan with one more ascension has one more checkpoint
 * at the front). Comparing only the widest step anywhere let one wide checkpoint decide: Willsalt's
 * F5-alt 6 ([3, 2, 7, 6, 6]) counted as coarser than its M4 5 ([5, 5, 5, 5]), though F5-alt looked
 * closer at two of the checkpoints. A staged search has no box and counts as coarser than any box.
 */
function coarserThroughout(a: SearchGrade, b: SearchGrade): boolean {
  if (a.kind === 'staged' || b.kind === 'staged') return a.kind === 'staged' && b.kind !== 'staged';
  const n = Math.min(a.steps.length, b.steps.length);
  let wider = false;
  for (let i = 1; i <= n; i++) {
    const x = a.steps[a.steps.length - i];
    const y = b.steps[b.steps.length - i];
    if (x < y) return false;
    if (x > y) wider = true;
  }
  return wider;
}

/**
 * What a gap between two counts of one account says, given how each side was searched.
 *
 *   - `settled`: the slower count lost by more than a finer search of it could make up
 *     (`SearchGrade.penalty`). Never for a staged search, or a box coarser than every 5th TE, whose
 *     shortfall is unknown.
 *   - `direction`: not settled, but the count that won was searched AT LEAST AS COARSELY at every
 *     checkpoint and more coarsely at one or more (`coarserThroughout`), so searching it as finely
 *     as the other would more likely widen the gap than close it.
 *   - `noise`: neither; the gap could be how the two were searched rather than the count.
 *
 * Only about the searches: both sides are still bounded by the boxes they tried.
 */
export type StepVerdict = 'settled' | 'direction' | 'noise';

export interface CountStep {
  /** The two counts, lower first. Adjacent among the counts the account tried, not always by one. */
  from: number;
  to: number;
  /** The count whose plan finishes first (`from` on a tie). */
  better: number;
  /** Days between the two finishes, never negative. */
  gap: number;
  verdict: StepVerdict;
}

type Weighed = Pick<CountComparisonPoint, 'ascensions' | 'behind' | 'search'>;

export function judgeStep(a: Weighed, b: Weighed): CountStep {
  const [lo, hi] = a.ascensions <= b.ascensions ? [a, b] : [b, a];
  const better = hi.behind < lo.behind ? hi : lo;
  const worse = better === lo ? hi : lo;
  const gap = Math.max(0, worse.behind - better.behind);
  let verdict: StepVerdict = 'noise';
  if (gap >= SAME_FINISH_DAYS) {
    if (worse.search.penalty != null && gap > worse.search.penalty) verdict = 'settled';
    else if (coarserThroughout(better.search, worse.search)) verdict = 'direction';
  }
  return { from: lo.ascensions, to: hi.ascensions, better: better.ascensions, gap, verdict };
}

/** Each step between neighbouring counts on one line, lowest first. */
export function countSteps(points: readonly Weighed[]): CountStep[] {
  const sorted = [...points].sort((a, b) => a.ascensions - b.ascensions);
  return sorted.slice(1).map((p, i) => judgeStep(sorted[i], p));
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
  /** How the run behind this point searched, so a gap can be weighed against it (`judgeStep`). */
  search: SearchGrade;
  /** Plans that run priced, for the tooltip. */
  priced: number;
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
 *
 * Every point carries how its run searched (`search`): the best plan FOUND at a count is only as
 * good as the search that found it, and the higher counts have mostly been searched more coarsely.
 * `countSteps` weighs each gap against that.
 *
 * `labels` names the accounts (the page's one map, so this chart and every other agree); an account
 * missing from it is named from these rows.
 */
export function compareCounts(
  rows: CollectorRow[],
  judged: FinishJudgement,
  labels?: ReadonlyMap<string, string>
): CountComparison[] {
  const out: CountComparison[] = [];
  const bests = bestPerCount(rows, judged);

  for (const account of groupByAccount(rows)) {
    const label = labels?.get(account.key) ?? account.label;
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
      const search = searchGrade(proven);
      out.push({
        key: `${account.key}#${proven.id}`,
        accountKey: account.key,
        label: `${label} (one exhaustive run)`,
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
              search,
              priced: entry.priced,
            };
          })
          .sort((a, b) => a.ascensions - b.ascensions),
      });
    }

    const perCount = [...(bests.get(account.key)?.values() ?? [])];
    if (perCount.length < 2) continue;
    // Every run here stands and is shown, so the account's best is at or before each of them; the
    // fallback is only for a judgement made without this account's runs in it.
    const earliest = anchorFinish ?? Math.min(...perCount.map(b => b.finish!));
    out.push({
      key: account.key,
      accountKey: account.key,
      label,
      singleRun: false,
      anchor: 'account',
      anchorFinish: earliest,
      note: '',
      points: perCount
        .map(({ row: r, finish }) => ({
          ascensions: r.ascensions,
          behind: (finish! - earliest) / DAY_MS,
          finish,
          days: r.durationDays,
          currentTE: r.currentTE,
          finalTE: r.finalTE,
          runId: r.id,
          chain: r.chain,
          search: searchGrade(r),
          priced: r.chainsPriced ?? 0,
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
 * is a fraction of that run's own best (0.01 is 1%), or `{ days }` for an absolute number of days.
 * The page asks for days first: 1% of a 700-day plan is 7 days, more than most gains from one more
 * ascension, and on Allan's every-TE 4-ascension box it took in 5,705 of 9,261 plans -- a plateau
 * that is the whole box says nothing. Within 1 day, 35 of them.
 *
 * Restricted to one ascension count because positions only line up within one: the third
 * checkpoint of a six-chain and of an eight-chain are not the same thing.
 */
export function nearBestBands(
  chains: PricedChain[],
  currentTE: number,
  finalTE: number,
  ascensions: number,
  tolerance: number | { days: number } = 0.01
): { bands: PositionBand[]; near: number; total: number; bestDays: number; bestChain: number[] } | null {
  const atCount = chains.filter(c => c.prestiges === ascensions);
  if (!atCount.length || !(finalTE > currentTE)) return null;

  const best = atCount.reduce((a, b) => (b.days < a.days ? b : a));
  const cutoff = typeof tolerance === 'number' ? best.days * (1 + tolerance) : best.days + tolerance.days;
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
  return (isProof(row) ? 2 : 0) + (row.sweep ? 1 : 0);
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
export function runTags(rows: readonly CollectorRow[], zone?: string): Map<CollectorRow, string[]> {
  // `zone`: the calendar any "starts HH:MM" tag is read on (the page passes the viewer's, as for
  // every other date in the runs table).
  const tags = settingTags(rows, zone);
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

/**
 * The one test for "this run proved its answer over its box": it tried a stated box (`space`), was
 * not stopped, and priced every plan in it (`boxPriced`). `space && !stoppedEarly` alone passed a run
 * whose end never recorded its count: Halceyx's 6-ascension run from 23 Sep priced 4,192 of a
 * 61,749-plan box and still counted as proven on the count cards and under Proofs only, while the
 * runs table called it partial. Everything on the page that asks, asks this.
 */
export function isProof(row: CollectorRow): boolean {
  return !!row.space && !row.space.stoppedEarly && boxPriced(row) >= row.space.chains;
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
  const finished = isProof(row);
  words.push(
    finished
      ? `All ${sp.chains.toLocaleString('en-US')} plans in the box priced, so its best is the best in the box.`
      : `${sp.stoppedEarly ? 'Stopped after' : 'It recorded pricing only'} ${done.toLocaleString('en-US')} of the ${sp.chains.toLocaleString('en-US')} plans in the box, so its best is the best of those, not a proof.`
  );
  const title = words.join(' ');
  return {
    // A box the run did not finish is partial, whether it was stopped or just never recorded the rest.
    how: `${finished ? foundByText(row) : 'Advanced · partial'}${preset}`,
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
  const check = rateCheckOf(row);
  return check.state === 'suspect' ? check.why : null;
}

/**
 * The delivery-rate check in all three of its answers, for showing rather than filtering: `suspect`
 * (what `flagOf` flags), `clean`, or `unchecked` with the reason it could not look. `flagOf` lets an
 * unchecked run through like a clean one, which is right for the filter -- there is nothing against
 * it -- but the page should not let it read as checked: four runs to 490 on 26 Sep could not be (two
 * without legs, two with no delivery set and a last checkpoint under 190).
 */
export type RateCheckState =
  | { state: 'suspect'; why: string }
  | { state: 'clean' }
  | { state: 'unchecked'; why: string };

export function rateCheckOf(row: Submission): RateCheckState {
  const rate = checkFinalLegRate(row.chain, row.legs, row.delivery);
  if (rate?.suspect) {
    return {
      state: 'suspect',
      why: `Final leg peaks at ${rate.measuredQph.toFixed(2)} q/hr; this gear reaches about ${rate.expectedQph.toFixed(2)} from ${row.chain[row.chain.length - 2]} TE. Looks like the old delivery-set-for-earnings bug.`,
    };
  }
  if (rate) return { state: 'clean' };
  // The same tests `checkFinalLegRate` makes, in its order, to say which one stopped it.
  const last = row.legs?.[row.legs.length - 1];
  const why =
    row.chain?.[row.chain.length - 1] !== 490
      ? 'The delivery-rate check only works on runs to 490: a shorter final leg can end before the farm reaches its rate.'
      : !deliveryScore(slotsFromLabels(row.delivery))
        ? 'This run did not record its delivery set, so there is nothing to check its final leg against.'
        : !last
          ? 'This run carried no per-leg detail, so its final leg cannot be checked.'
          : !(last.peakDeliveryQph > 0)
            ? 'Its final leg recorded no peak delivery rate to check.'
            : row.chain.length < 2
              ? 'A plan with one ascension has no checkpoint to check its final leg from.'
              : `Its last checkpoint (${row.chain[row.chain.length - 2]} TE) is under 190, below where the delivery ramp was measured.`;
  return { state: 'unchecked', why: `Not checked for the delivery-set bug. ${why}` };
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
