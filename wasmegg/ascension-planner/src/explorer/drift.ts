/**
 * @module explorer/drift
 * @description Does the best plan move from one day to the next? One account's plans, each at the date
 * it was made, and the SAME plan joined across the times it was priced. The pure half of
 * PlanDriftChart.vue.
 *
 * WITHIN ONE ACCOUNT, BY FINISH DATE. A plan's total counts from its own start, so the same plan
 * priced a day later is a day shorter; its finish date is what compares (analysis.ts, rule 2). Every
 * point here is a finish, drawn as days after the account's earliest standing finish (`judgeFinishes`'s
 * `bestByAccount`), and a joined line that rises is a plan whose finish slipped when it was priced
 * again: going stale. One that stays flat is a plan that holds.
 *
 * WHAT COUNTS AS THE SAME PLAN is the Leaderboard's `samePlan`: the same settings and the same route,
 * or the route with the checkpoints the player has passed since dropped off. Each point joins the
 * most recent earlier point of the same plan (its `prev`), so a plan priced three times is one line of
 * three. `samePlan` is not transitive -- a row sent before the finish-the-current-run switch existed
 * matches both answers, while "prestige now" and "finish first" never match each other -- so a point
 * is only ever compared with the point it matched: every re-pricing and every tooltip is `prev` to
 * point, and a point whose match is not the last on its line starts a branch from that match rather
 * than being strung after a pricing it never matched.
 *
 * THREE KINDS OF PRICING.
 *   - `run`: a submitted run's own best plan.
 *   - `recheck`: a schema-7 row's `rechecks`, the player's earlier plans priced again from that row's
 *     save and start (search/submission.ts). Kept the way the Leaderboard's `recheckLines` keeps
 *     them: a valid route to the target, not the row's own, and only when it re-prices an earlier plan
 *     of the account (started over an hour before the row).
 *   - `table`: an earlier plan that turns up among a later run's runners-up or best-at-each-count
 *     (`proof`), which is the same plan priced from that run's save, under that run's settings, for
 *     free. Only those short lists are read; the run's full table (its stored CSV) is not fetched here.
 *
 * A what-if run (a plan typed in from a TE the account did not have, or dated ahead) is left out: its
 * finish is not a pricing of the account as it was. Runs with no start cannot be placed.
 *
 * A RE-PRICING is two neighbouring points on one line at least an hour apart (the Leaderboard's
 * "newer" threshold); two pricings closer than that are the same moment priced twice.
 */
import { accountKey, searchGrade, type FinishJudgement, type SearchGrade } from './analysis';
import type { CollectorRow } from './collector';
import { DAY_MS, samePlan, type PlanState } from '@/lib/leaderboardRank';

/** Two pricings must start at least this far apart to be two moments (leaderboardRank's LATER_MS). */
export const REPRICE_MIN_MS = 3_600_000;
/** A finish that moved less than this is unchanged (leaderboardRank's UNCHANGED_MS). */
export const UNCHANGED_MS = 3_600_000;

export type PricingKind = 'run' | 'recheck' | 'table';

export interface DriftPoint {
  /** The run's id, or `<id>~recheck<i>` / `<id>~table<i>` for a plan priced inside that run. */
  id: string;
  kind: PricingKind;
  /** The run this pricing belongs to. */
  row: CollectorRow;
  chain: number[];
  /** When the plan was made (the run's start) and when it reaches the target, ms. */
  start: number;
  finish: number;
  /** Days after the account's anchor finish (negative: before it). */
  behind: number;
  /** The plan's own length from its start, days. */
  days: number;
  /** How the run searched; null for a re-check or a plan priced inside a later run. */
  grade: SearchGrade | null;
  /** The run's standing, from `judgeFinishes` (a re-check or table point carries its run's). */
  state: PlanState;
  standing: boolean;
  reason: string;
  /** The earlier pricing this one matched (`samePlan`): what it re-prices. Null for a first pricing. */
  prev: DriftPoint | null;
}

export interface DriftLine {
  key: string;
  /** Oldest first: the pricings this line owns. Each one's `prev` is the one before it, or `from`. */
  points: DriftPoint[];
  /** A branch: the point on another line its first point re-priced. Null for a plan's first line. */
  from: DriftPoint | null;
  /** The route when the plan was first priced; a later point may have passed checkpoints dropped. */
  chain: number[];
  /** Ascensions when the plan was first priced (the line's colour and legend entry). */
  ascensions: number;
}

export interface Repricing {
  lineKey: string;
  from: DriftPoint;
  to: DriftPoint;
  /** Finish change, days: positive is later (the plan slipped). */
  moved: number;
  /** Days between the two starts. */
  apart: number;
}

export interface AccountDrift {
  key: string;
  label: string;
  /** The finish every point is measured from, ms; null when the account has no point. */
  anchor: number | null;
  /** `standing`: the account's earliest standing finish. `own`: none stands, so the earliest shown. */
  anchorKind: 'standing' | 'own';
  points: DriftPoint[];
  /** Every plan, one line each, including plans priced once. */
  lines: DriftLine[];
  repricings: Repricing[];
  /** Lines with at least one re-pricing. */
  repricedPlans: number;
}

/** A plan priced inside `row` as a row of its own, for `samePlan`: the row's settings, this route. */
function asRow(row: CollectorRow, chain: number[], days: number): CollectorRow {
  return { ...row, chain: [...chain], ascensions: chain.length, durationDays: days };
}

/** A route the collector would take as a re-check: whole TEs, strictly rising, ending at the target. */
function validRoute(chain: unknown, target: number): chain is number[] {
  return (
    Array.isArray(chain) &&
    chain.length >= 1 &&
    chain.every((v, k) => Number.isFinite(v) && v > 0 && (k === 0 || v > chain[k - 1])) &&
    chain[chain.length - 1] === target
  );
}

interface Candidate {
  point: DriftPoint;
  /** What `samePlan` reads for this pricing. */
  plan: CollectorRow;
}

/**
 * Every account's pricings at `finalTE`, lines and re-pricings, in the order the picker lists them
 * (most re-priced plans first).
 *
 * `rows` are the runs the page shows (each result once: ChainExplorer's `usable`); only those at
 * `finalTE` that `judged` knows are used. `judged` must be for the same target.
 */
export function planDrift(
  rows: readonly CollectorRow[],
  judged: FinishJudgement,
  finalTE: number,
  labels: ReadonlyMap<string, string> = new Map()
): AccountDrift[] {
  const byAccount = new Map<string, Candidate[]>();
  const push = (key: string, c: Candidate) => {
    const list = byAccount.get(key);
    if (list) list.push(c);
    else byAccount.set(key, [c]);
  };

  const runs: Candidate[] = [];
  for (const row of rows) {
    if (row.finalTE !== finalTE || !Array.isArray(row.chain)) continue;
    const j = judged.byId.get(row.id);
    if (!j || j.start == null || j.finish == null || j.state === 'what-if') continue;
    const c: Candidate = {
      point: {
        id: row.id,
        kind: 'run',
        row,
        chain: [...row.chain],
        start: j.start,
        finish: j.finish,
        behind: 0,
        days: row.durationDays,
        grade: searchGrade(row),
        state: j.state,
        standing: j.standing,
        reason: j.reason,
        prev: null,
      },
      plan: row,
    };
    runs.push(c);
    push(accountKey(row), c);
  }

  // Plans priced inside a run: its re-checks, and earlier plans among its runners-up. Kept only when
  // they re-price an earlier pricing of the account's.
  for (const src of runs) {
    const row = src.point.row;
    const key = accountKey(row);
    const earlier = (byAccount.get(key) ?? []).filter(
      c => c.point.kind === 'run' && c.point.start + REPRICE_MIN_MS < src.point.start
    );
    if (!earlier.length) continue;
    const seen = new Set([row.chain.join(',')]);
    const inside: { kind: PricingKind; chain: number[]; days: number }[] = [
      ...(row.rechecks ?? []).map(r => ({ kind: 'recheck' as const, chain: r?.chain, days: r?.days })),
      ...(row.proof?.runnersUp ?? []).map(r => ({ kind: 'table' as const, chain: r?.chain, days: r?.days })),
      ...(row.proof?.byAscensions ?? []).map(r => ({ kind: 'table' as const, chain: r?.chain, days: r?.days })),
    ];
    const counters: Record<PricingKind, number> = { run: 0, recheck: 0, table: 0 };
    for (const p of inside) {
      if (!validRoute(p.chain, finalTE) || !Number.isFinite(p.days) || p.days <= 0) continue;
      const routeKey = p.chain.join(',');
      if (seen.has(routeKey)) continue;
      const plan = asRow(row, p.chain, p.days);
      if (!earlier.some(e => samePlan(e.plan, plan))) continue;
      seen.add(routeKey);
      const index = counters[p.kind]++;
      push(key, {
        point: {
          ...src.point,
          id: `${row.id}~${p.kind}${index}`,
          kind: p.kind,
          chain: [...p.chain],
          finish: src.point.start + p.days * DAY_MS,
          days: p.days,
          grade: null,
        },
        plan,
      });
    }
  }

  const out: AccountDrift[] = [];
  for (const [key, candidates] of byAccount) {
    const order = (a: Candidate, b: Candidate) =>
      a.point.start - b.point.start ||
      kindRank(a.point.kind) - kindRank(b.point.kind) ||
      a.point.id.localeCompare(b.point.id);
    candidates.sort(order);

    const best = judged.bestByAccount.get(key);
    const runFinishes = candidates.filter(c => c.point.kind === 'run').map(c => c.point.finish);
    const anchor = best ? best.finish : runFinishes.length ? Math.min(...runFinishes) : null;
    for (const c of candidates) c.point.behind = anchor == null ? 0 : (c.point.finish - anchor) / DAY_MS;

    // Each pricing joins the latest earlier pricing of the same plan; exact routes win a tie.
    const lineOf: number[] = [];
    const lines: DriftLine[] = [];
    const repricings: Repricing[] = [];
    candidates.forEach((c, j) => {
      let match = -1;
      for (let i = j - 1; i >= 0; i--) {
        const e = candidates[i];
        if (!samePlan(e.plan, c.plan)) continue;
        if (match === -1) {
          match = i;
          continue;
        }
        const m = candidates[match];
        if (e.point.start !== m.point.start) break;
        if (
          e.point.chain.join(',') === c.point.chain.join(',') &&
          m.point.chain.join(',') !== c.point.chain.join(',')
        ) {
          match = i;
        }
      }
      const newLine = (from: DriftPoint | null, root: DriftLine | null) => {
        lineOf[j] = lines.length;
        lines.push({
          key: `${key}#${lines.length}`,
          points: [c.point],
          from,
          chain: root ? root.chain : c.point.chain,
          ascensions: root ? root.ascensions : c.point.chain.length,
        });
      };
      if (match === -1) {
        c.point.prev = null;
        newLine(null, null);
        return;
      }
      const prev = candidates[match].point;
      c.point.prev = prev;
      const line = lines[lineOf[match]];
      if (line.points[line.points.length - 1] === prev) {
        lineOf[j] = lineOf[match];
        line.points.push(c.point);
      } else {
        // The pricing it matched already has a later one on its line that this one does not match.
        newLine(prev, line);
      }
      if (c.point.start - prev.start >= REPRICE_MIN_MS) {
        repricings.push({
          lineKey: lines[lineOf[j]].key,
          from: prev,
          to: c.point,
          moved: (c.point.finish - prev.finish) / DAY_MS,
          apart: (c.point.start - prev.start) / DAY_MS,
        });
      }
    });

    out.push({
      key,
      label: labels.get(key) ?? candidates[0].point.row.nickname ?? key,
      anchor,
      anchorKind: best ? 'standing' : 'own',
      points: candidates.map(c => c.point),
      lines,
      repricings,
      repricedPlans: new Set(repricings.map(r => r.lineKey)).size,
    });
  }

  return out.sort(
    (a, b) =>
      b.repricedPlans - a.repricedPlans ||
      b.repricings.length - a.repricings.length ||
      b.points.length - a.points.length ||
      a.label.localeCompare(b.label)
  );
}

/** A run before the plans priced inside it, when two share a start. */
function kindRank(kind: PricingKind): number {
  return kind === 'run' ? 0 : kind === 'recheck' ? 1 : 2;
}

/** The account the chart opens on: the one with the most re-priced plans (`planDrift`'s order). */
export function defaultDriftAccount(drifts: readonly AccountDrift[]): string | null {
  return drifts.find(d => d.points.length)?.key ?? null;
}

export type Direction = 'later' | 'unchanged' | 'earlier';

/** Which way a re-pricing moved the finish, with the Leaderboard's hour of "unchanged". */
export function directionOf(r: Pick<Repricing, 'moved'>): Direction {
  if (Math.abs(r.moved) * DAY_MS < UNCHANGED_MS) return 'unchanged';
  return r.moved > 0 ? 'later' : 'earlier';
}

export interface DriftTally {
  repricings: number;
  accounts: number;
  later: number;
  unchanged: number;
  earlier: number;
  /** Priced again less than a day after the time before. */
  withinDay: number;
  /** The largest slip and the largest gain, days (0 when there is none). */
  maxLater: number;
  maxEarlier: number;
}

/** Every account's re-pricings counted, for the sentence under the chart. */
export function driftTally(drifts: readonly AccountDrift[]): DriftTally {
  const all = drifts.flatMap(d => d.repricings);
  const dirs = all.map(directionOf);
  const later = all.filter((_, i) => dirs[i] === 'later').map(r => r.moved);
  const earlier = all.filter((_, i) => dirs[i] === 'earlier').map(r => -r.moved);
  return {
    repricings: all.length,
    accounts: drifts.filter(d => d.repricings.length).length,
    later: later.length,
    unchanged: dirs.filter(d => d === 'unchanged').length,
    earlier: earlier.length,
    withinDay: all.filter(r => r.apart < 1).length,
    maxLater: later.length ? Math.max(...later) : 0,
    maxEarlier: earlier.length ? Math.max(...earlier) : 0,
  };
}

/** Ascension counts get one fixed colour each, whatever account is shown: 2 to 8, then 9 and up. */
export const COUNT_SLOTS = [2, 3, 4, 5, 6, 7, 8, 9] as const;

/** The legend's name for a count's slot. */
export function countSlotName(ascensions: number): string {
  return ascensions >= 9 ? '9+ ascensions' : `${ascensions} ascension${ascensions === 1 ? '' : 's'}`;
}

/** Index into the palette for a count: 2 is the first colour, 9 and up share the last. */
export function countSlotIndex(ascensions: number): number {
  return Math.min(COUNT_SLOTS.length - 1, Math.max(0, ascensions - COUNT_SLOTS[0]));
}
