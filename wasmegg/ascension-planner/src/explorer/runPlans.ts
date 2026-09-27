/**
 * @module explorer/runPlans
 * @description Every plan one run priced, as a list a player can page through, filter and sort.
 *
 * A player asked for "a list of best plans … top ten from their CSVs … a list of all the
 * combinations checked". One run's table is exactly that: every plan in it was priced from the same
 * save, so its days compare directly and "days behind this run's best" is a real gap, not the
 * cross-save comparison the rest of the page refuses to make.
 *
 * WHAT IS RENDERED IS ONE PAGE. A table holds up to 60,000 plans (collector.ts `MAX_PARSED_CHAINS`),
 * and a DOM row for each is a tab that stops scrolling. So the list is ranked once, and every
 * choice after that -- count, checkpoint filter, how many, order, page -- is a cheap pass over
 * numbers that hands the page at most 100 rows.
 *
 * THE ORDER OF OPERATIONS IS THE MEANING. "Top 25" means the 25 fastest plans that pass the
 * filters; the order picked then arranges THOSE 25, so "top 25 by chain" reads the 25 best plans
 * in checkpoint order rather than the first 25 chains alphabetically, which would be a list of
 * whatever happened to start lowest. Only "All" pages, 100 at a time, in the order picked.
 */
import type { PricedChain } from '@/search/types';

export interface RankedPlan {
  /** 1 for the fastest plan in the table. Kept through every filter, so it always means the same. */
  rank: number;
  chain: number[];
  ascensions: number;
  days: number;
  /** Days after the table's fastest plan. */
  behind: number;
  /** Position in checkpoint order over the whole table, so sorting by chain is a numeric sort. */
  chainOrder: number;
}

/** Lowest first, checkpoint by checkpoint; a chain that is a prefix of another comes first. */
export function compareChains(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

/**
 * The table ranked, fastest first. Stable, so plans the file lists as equally fast keep its order.
 * The file is already in rank order (`parseRunCsv`), but ranking here means a table from anywhere
 * else -- a dropped file, a test -- ranks the same.
 */
export function rankPlans(chains: readonly PricedChain[]): RankedPlan[] {
  const byDays = chains
    .map((c, i) => ({ c, i }))
    .sort((x, y) => x.c.days - y.c.days || x.i - y.i)
    .map(x => x.c);
  const best = byDays.length ? byDays[0].days : 0;
  const ranked: RankedPlan[] = byDays.map((c, i) => ({
    rank: i + 1,
    chain: c.chain,
    ascensions: c.chain.length,
    days: c.days,
    behind: c.days - best,
    chainOrder: 0,
  }));
  [...ranked].sort((a, b) => compareChains(a.chain, b.chain)).forEach((p, i) => (p.chainOrder = i));
  return ranked;
}

/** The ascension counts in a table, lowest first. */
export function countsIn(plans: readonly RankedPlan[]): number[] {
  return [...new Set(plans.map(p => p.ascensions))].sort((a, b) => a - b);
}

/** One term of the checkpoint filter: a checkpoint somewhere in `lo`..`hi`, inclusive. */
export interface TeTerm {
  lo: number;
  hi: number;
}

/**
 * The checkpoint filter as typed: `280` (some checkpoint at 280), `275-285` (some checkpoint in
 * that range), or several of either separated by spaces or commas, all of which must hold
 * (`230 275-285`: a checkpoint at 230 AND one in 275-285). Blank is no filter. Anything else is an
 * error to show, and the list is left unfiltered rather than silently emptied.
 */
export function parseTeFilter(text: string): { terms: TeTerm[] } | { error: string } {
  const normalised = text.trim().replace(/\s*(?:-|–|—|to|\.\.)\s*/gi, '-');
  if (!normalised) return { terms: [] };
  const terms: TeTerm[] = [];
  for (const token of normalised.split(/[\s,;]+/)) {
    if (!token) continue;
    const m = /^(\d{1,5})(?:-(\d{1,5}))?$/.exec(token);
    if (!m) return { error: `"${token}" is not a TE or a range. Type a TE like 280, or a range like 275-285.` };
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : Number(m[2]);
    terms.push({ lo: Math.min(a, b), hi: Math.max(a, b) });
  }
  return { terms };
}

/** Whether every term finds a checkpoint in the chain. The target is not a checkpoint. */
export function matchesTerms(chain: readonly number[], terms: readonly TeTerm[]): boolean {
  const last = chain.length - 1;
  for (const t of terms) {
    let hit = false;
    for (let i = 0; i < last; i++) {
      if (chain[i] >= t.lo && chain[i] <= t.hi) {
        hit = true;
        break;
      }
    }
    if (!hit) return false;
  }
  return true;
}

/** Rank order, filtered to one ascension count (or all) and the checkpoint terms. */
export function filterPlans(
  plans: readonly RankedPlan[],
  count: number | 'all',
  terms: readonly TeTerm[]
): RankedPlan[] {
  if (count === 'all' && !terms.length) return plans as RankedPlan[];
  return plans.filter(p => (count === 'all' || p.ascensions === count) && matchesTerms(p.chain, terms));
}

export type PlanSortKey = 'rank' | 'chain';
export interface PlanSort {
  by: PlanSortKey;
  dir: 'asc' | 'desc';
}

/** A new array in the order picked. Rank ascending is the input's own order, so it is a copy. */
export function sortPlans(plans: readonly RankedPlan[], sort: PlanSort): RankedPlan[] {
  const key = sort.by === 'chain' ? (p: RankedPlan) => p.chainOrder : (p: RankedPlan) => p.rank;
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...plans].sort((a, b) => sign * (key(a) - key(b)));
}

/** How many plans to show. "All" pages. */
export type PlanLimit = 10 | 25 | 100 | 'all';
export const PLAN_LIMITS: readonly PlanLimit[] = [10, 25, 100, 'all'];
/** Rows per page under "All". */
export const PAGE_SIZE = 100;

export interface PlanPage {
  /** The rows to render: at most `PAGE_SIZE`. */
  rows: RankedPlan[];
  /** Plans that pass the filters. */
  matched: number;
  /** Plans in the list being paged: `matched`, or fewer under a top-N limit. */
  listed: number;
  /** 0-based page actually shown, clamped into range. */
  page: number;
  /** Pages in all; 1 unless the limit is "All". */
  pages: number;
  /** 1-based positions of the first and last row shown in the list, 0 and 0 when it is empty. */
  from: number;
  to: number;
}

/**
 * Filter, keep the top N by rank, arrange in the order picked, and cut one page. See the module
 * note for why the limit comes before the order.
 */
export function selectPlans(
  plans: readonly RankedPlan[],
  opts: { count: number | 'all'; terms: readonly TeTerm[]; sort: PlanSort; limit: PlanLimit; page: number }
): PlanPage {
  const matched = filterPlans(plans, opts.count, opts.terms);
  const limited = opts.limit === 'all' ? matched : matched.slice(0, opts.limit);
  const ordered = opts.sort.by === 'rank' && opts.sort.dir === 'asc' ? limited : sortPlans(limited, opts.sort);
  const size = opts.limit === 'all' ? PAGE_SIZE : opts.limit;
  const pages = Math.max(1, Math.ceil(ordered.length / size));
  const page = Math.min(Math.max(0, Math.floor(opts.page) || 0), pages - 1);
  const rows = ordered.slice(page * size, page * size + size);
  return {
    rows,
    matched: matched.length,
    listed: ordered.length,
    page,
    pages,
    from: rows.length ? page * size + 1 : 0,
    to: page * size + rows.length,
  };
}

/**
 * The page buttons to show: the first, the last, and `around` either side of the current one, with
 * `null` for each gap. 0-based. A gap of a single page is shown as that page, since "…" standing
 * for one number hides nothing.
 */
export function pageList(page: number, pages: number, around = 2): (number | null)[] {
  if (pages <= 1) return pages === 1 ? [0] : [];
  const keep = new Set<number>([0, pages - 1]);
  for (let p = page - around; p <= page + around; p++) if (p >= 0 && p < pages) keep.add(p);
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0) {
      const gap = sorted[i] - sorted[i - 1];
      if (gap === 2) out.push(sorted[i] - 1);
      else if (gap > 2) out.push(null);
    }
    out.push(sorted[i]);
  }
  return out;
}

/** The best plan at one ascension count, and how many were priced at it. */
export interface CountBest {
  ascensions: number;
  chain: number[];
  days: number;
  /** Plans at this count: all the run priced, or, when `partial`, only those the page read. */
  priced: number;
  /**
   * Counted from a table the page read only part of (the parse cap drops the slowest plans): `priced`
   * is a floor, and a count whose plans were all slow is missing. The best at a count that is here is
   * still its best, since the plans dropped are the slowest.
   */
  partial: boolean;
}

/**
 * The best plan at each ascension count, lowest count first. From the run's own proof block when it
 * has one (it counted every plan, even ones a capped parse dropped), otherwise from the table, and
 * empty when there is only one count -- one count repeats the table's first row. `truncated` is how
 * many plans the parse dropped (`parseRunCsv(...).truncated`): counted from the table, each count is
 * then partial.
 */
export function bestByCount(
  plans: readonly RankedPlan[],
  proof?: { byAscensions?: readonly { ascensions: number; chain: number[]; days: number; priced: number }[] } | null,
  truncated = 0
): CountBest[] {
  const stated = proof?.byAscensions ?? [];
  if (stated.length > 1) {
    return [...stated]
      .sort((a, b) => a.ascensions - b.ascensions)
      .map(b => ({ ascensions: b.ascensions, chain: b.chain, days: b.days, priced: b.priced, partial: false }));
  }
  const partial = truncated > 0;
  const groups = new Map<number, CountBest>();
  // Rank order, so the first plan seen at a count is its best.
  for (const p of plans) {
    const g = groups.get(p.ascensions);
    if (g) g.priced++;
    else groups.set(p.ascensions, { ascensions: p.ascensions, chain: p.chain, days: p.days, priced: 1, partial });
  }
  return groups.size > 1 ? [...groups.values()].sort((a, b) => a.ascensions - b.ascensions) : [];
}

/** `{base}/csv?id=…`: the run's stored table, served by the collector as a .csv.gz download. The
 *  Leaderboard's link (LeaderboardRunDetail.vue `csvHref`), built from the same base. */
export function csvHref(base: string, id: string): string {
  return `${base.replace(/\/$/, '')}/csv?id=${encodeURIComponent(id)}`;
}
