/**
 * @module explorer/analysis
 * @description Turning a pile of submitted runs into the few statements that can honestly be made
 * about them.
 *
 * THE ONE RULE THIS MODULE EXISTS TO ENFORCE: durations are not comparable between accounts. A
 * chain's length depends on artifacts, colleggtibles, epic research and starting TE at least as
 * much as on the chain, so "8 ascensions is faster than 6" computed across everybody is an
 * artifact of who happened to submit what. Every cross-count comparison here is therefore built
 * WITHIN an account, and every cross-account view is built on the chain SHAPE -- where the
 * checkpoints sit as a fraction of that account's own journey -- which is the part that does
 * travel.
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
import type { Submission } from '@/search/submission';
import type { PricedChain } from '@/search/types';
import type { CollectorRow } from './collector';
import { checkFinalLegRate, clothedTEFromLabels, deliveryScore, slotsFromLabels } from '@/search/virtueScore';

/** Stable key for "probably the same account". See the module note on how coarse this is. */
export function accountKey(row: Submission): string {
  const artifacts = [...(row.artifacts ?? [])].sort().join('|');
  return `${row.timezone ?? '?'}::${artifacts}`;
}

/**
 * What to call an account in a legend.
 *
 * The nickname field is where people record what a particular run WAS, not who they are: the live
 * collector holds `Willsalt`, `Willsalt(2 ascent) 2026-09-20 12:02`, `Williamthe5thc 8 exhaus
 * 2026-09-20 08:47` and `Williamthe5thc (bad sync)` — all annotations bolted onto a name. So the
 * annotations are stripped (a trailing date, a trailing parenthetical, a trailing run note) and
 * the SHORTEST survivor is taken, which is the part that did not change between runs.
 *
 * Falls back to the raw shortest if stripping leaves nothing, because a nickname that is entirely
 * a parenthetical is still better than calling somebody Anonymous.
 */
export function accountLabel(rows: Submission[]): string {
  const names = rows.map(r => r.nickname?.trim()).filter((n): n is string => !!n);
  if (!names.length) return `Anonymous · ${rows[0]?.timezone ?? 'unknown zone'}`;
  const shortest = (list: string[]) => list.reduce((a, b) => (b.length < a.length ? b : a));
  const cleaned = names
    .map(n =>
      n
        // A trailing timestamp, with or without a time: `Willsalt 2026-09-20 12:02`.
        .replace(/\s*\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2})?.*$/, '')
        // A trailing parenthetical, closed or not: `(bad sync)`, `(step exhaustiv`.
        .replace(/\s*\([^)]*\)?\s*$/, '')
        .trim()
    )
    .filter(Boolean);
  return cleaned.length ? shortest(cleaned) : shortest(names);
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

export interface CountGroup {
  ascensions: number;
  rows: CollectorRow[];
  /** Distinct accounts behind those runs. */
  accounts: number;
  /** Fastest run at this count, which is only meaningful next to the account it came from. */
  best: CollectorRow;
  bands: PositionBand[];
  /** Runs here that can prove their answer over a stated space rather than having found it. */
  exhaustive: number;
}

/** One group per ascension count present, shortest chain first. */
export function groupByCount(rows: CollectorRow[]): CountGroup[] {
  const buckets = new Map<number, CollectorRow[]>();
  for (const row of rows) {
    const bucket = buckets.get(row.ascensions);
    if (bucket) bucket.push(row);
    else buckets.set(row.ascensions, [row]);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ascensions, group]) => ({
      ascensions,
      rows: [...group].sort((a, b) => a.durationDays - b.durationDays),
      accounts: new Set(group.map(accountKey)).size,
      best: group.reduce((a, b) => (b.durationDays < a.durationDays ? b : a)),
      bands: positionBands(group),
      exhaustive: group.filter(r => r.space && !r.space.stoppedEarly).length,
    }));
}

export interface CountComparisonPoint {
  ascensions: number;
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
}

/**
 * "Does one more ascension help?", per account.
 *
 * Two grades of evidence, and the difference is worth stating on the chart rather than burying:
 *
 *   - A single exhaustive run that priced several counts knows the answer outright -- every chain
 *     at both counts was priced from the same save at the same instant, so the comparison holds
 *     every input fixed. That is `proof.byAscensions`, and a series built from it is marked
 *     `singleRun`.
 *   - Several runs from one account, submitted on different days at different current TE. Still
 *     far better than comparing strangers, still not a controlled experiment: an account that
 *     gained 50 TE between runs is not the same account.
 *
 * Accounts with only one count are dropped: a single point makes no comparison and adds a legend
 * entry to a chart that lives on being readable.
 */
export function compareCounts(rows: CollectorRow[]): CountComparison[] {
  const out: CountComparison[] = [];

  for (const account of groupByAccount(rows)) {
    // Prefer a run that measured several counts by itself.
    const proven = account.rows.find(r => (r.proof?.byAscensions?.length ?? 0) > 1);
    if (proven) {
      out.push({
        key: `${account.key}#${proven.id}`,
        accountKey: account.key,
        label: `${account.label} (one exhaustive run)`,
        singleRun: true,
        points: proven
          .proof!.byAscensions.map(entry => ({
            ascensions: entry.ascensions,
            days: entry.days,
            currentTE: proven.currentTE,
            finalTE: proven.finalTE,
            runId: proven.id,
            chain: entry.chain,
          }))
          .sort((a, b) => a.ascensions - b.ascensions),
      });
      continue;
    }

    if (account.counts.length < 2) continue;
    const bestPerCount = new Map<number, CollectorRow>();
    for (const row of account.rows) {
      const held = bestPerCount.get(row.ascensions);
      if (!held || row.durationDays < held.durationDays) bestPerCount.set(row.ascensions, row);
    }
    out.push({
      key: account.key,
      accountKey: account.key,
      label: account.label,
      singleRun: false,
      points: [...bestPerCount.values()]
        .map(r => ({
          ascensions: r.ascensions,
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

/** JSON with keys sorted at every level, so two records that hold the same values compare equal. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Rows that are an exact copy of an earlier row: every field equal except the id and the moment
 * it was posted. The earliest copy is kept and the rest are returned, to be hidden.
 *
 * EXACT, not "same run". Two runs of the same chain on one account that differ in chains priced or
 * effort are two experiments and both stay -- that is `/leaderboard`'s collapse, and it is a
 * different question. This is the same POST twice (a double-clicked Submit, a retry after a
 * timeout), which counts one run as two in every average on the page.
 */
export function exactDuplicateIds(rows: CollectorRow[]): Set<string> {
  const byContent = new Map<string, CollectorRow>();
  const dupes = new Set<string>();
  const sorted = [...rows].sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''));
  for (const row of sorted) {
    const { id: _id, submittedAt: _at, hasCsv: _csv, ...content } = row;
    const key = canonical(content);
    if (byContent.has(key)) dupes.add(row.id);
    else byContent.set(key, row);
  }
  return dupes;
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
