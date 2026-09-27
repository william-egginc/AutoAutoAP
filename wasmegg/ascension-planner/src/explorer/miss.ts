/**
 * @module explorer/miss
 * @description What missing a checkpoint costs, read off one run's full chain table.
 *
 * A player on a plan does not always ascend at the planned TE: they were asleep, or impatient, or
 * a sale moved. The question is then what that costs, and what to do next. One run's table answers
 * both for its own save, because every plan in it is priced from the same start: two of its days
 * compare directly (the rule in analysis.ts applies across runs, not inside one).
 *
 * For each checkpoint of the run's best chain, and each offset (-2, -1, +1, +2 TE by default):
 *
 *   KEEP THE PLAN   the same chain with only that checkpoint moved. What happens if the player
 *                   carries on with the old later checkpoints as if nothing had happened.
 *   RE-PLAN         the fastest chain in the table with the same earlier checkpoints and that
 *                   checkpoint moved, whatever it does afterwards. What happens if the player
 *                   re-plans the rest from where they landed.
 *
 * Both are days after the run's best. At the last checkpoint nothing comes after, so the two are
 * the same chain by construction and the page shows one number.
 *
 * NOTHING IS INVENTED. A moved chain the run never priced -- the box stepped over that TE, stopped
 * short of it, or its rules (a minimum gap between checkpoints) left that chain out -- is `null`,
 * which the page says as "not tried". When the page read only part of the table (collector.ts keeps
 * the fastest `MAX_PARSED_CHAINS` and drops the slow tail), a `null` may instead be a plan in the
 * tail, so the page says "not in the part of the table read" instead: every number is still right,
 * since the fastest plan of any kind is never in the slow tail. Interpolating between the neighbours would be exactly wrong
 * here: the cost of a miss is jagged (on the live tables a 1-TE miss often costs more than a 2-TE
 * one, the sale calendar's sawtooth), so a smooth guess would hide the thing being measured.
 *
 * Restricted to the run's own ascension count, like the plateau (`nearBestBands`): the second
 * checkpoint of a 4-chain and of a 5-chain are not the same thing, and "the same earlier
 * checkpoints" only means something between chains of one length.
 *
 * ONE PASS, NO MAP. Tables hold up to 60,000 chains. Looking every neighbour up by key and every
 * prefix up in an index would work, but each chain can only ever be a neighbour of the best in one
 * place -- where it first differs from it -- so a single walk finds every cell at once: find that
 * first difference, and if it is an offset being asked about, the chain is a re-plan candidate
 * there, and a keep-the-plan match as well when everything after it agrees with the best. That is
 * the prefix index and the key index at once, in O(chains x length) with nothing allocated per
 * chain.
 */
import type { PricedChain } from '@/search/types';

/** How far a checkpoint is moved, in TE: two either side, which is a miss rather than a new plan. */
export const MISS_OFFSETS: readonly number[] = [-2, -1, 1, 2];

/** Re-planning has to beat keeping the plan by more than this to be worth pointing out. */
export const REPLAN_WORTH_DAYS = 1;

/** A priced chain, and how many days after the run's best it finishes. */
export interface MissOption {
  chain: number[];
  days: number;
  behind: number;
}

export interface MissCell {
  offset: number;
  /** Where the moved checkpoint sits. */
  te: number;
  /** The best chain with only this checkpoint moved; null when the run never priced it. */
  keep: MissOption | null;
  /** The fastest chain with the same earlier checkpoints and this one moved; null when none was priced. */
  replan: MissOption | null;
  /** Days re-planning saves over keeping the plan, when both were priced. */
  saving: number | null;
}

export interface MissRow {
  /** 0-based position in the chain. */
  index: number;
  /** The best chain's checkpoint here. */
  te: number;
  /** The last checkpoint before the target, where keep and re-plan are the same chain. */
  last: boolean;
  cells: MissCell[];
}

export interface MissTable {
  ascensions: number;
  best: PricedChain;
  /** Chains in the table at this count, the pool every cell was looked up in. */
  priced: number;
  offsets: readonly number[];
  rows: MissRow[];
}

/**
 * The miss table for one run's chains at one ascension count, or null when there is nothing to
 * build it from: no chain at that count, or a count with no checkpoint (a single ascension).
 *
 * The best is the fastest chain at the count, the first one on a tie (the file's rank order).
 */
export function missTable(
  chains: readonly PricedChain[],
  ascensions: number,
  offsets: readonly number[] = MISS_OFFSETS
): MissTable | null {
  const checkpoints = ascensions - 1;
  if (checkpoints < 1) return null;

  let best: PricedChain | null = null;
  let priced = 0;
  for (const c of chains) {
    if (c.chain.length !== ascensions) continue;
    priced++;
    if (!best || c.days < best.days) best = c;
  }
  if (!best) return null;
  const target = best.chain;

  const column = new Map(offsets.map((d, i) => [d, i]));
  const keep: (PricedChain | null)[][] = Array.from({ length: checkpoints }, () => offsets.map(() => null));
  const replan: (PricedChain | null)[][] = Array.from({ length: checkpoints }, () => offsets.map(() => null));

  for (const c of chains) {
    const chain = c.chain;
    if (chain.length !== ascensions) continue;
    let j = 0;
    while (j < checkpoints && chain[j] === target[j]) j++;
    // The best itself, or a chain to another target (not in one run's table, but not a neighbour).
    if (j >= checkpoints) continue;
    const col = column.get(chain[j] - target[j]);
    if (col === undefined) continue;

    const r = replan[j][col];
    if (!r || c.days < r.days) replan[j][col] = c;

    let rest = true;
    for (let m = j + 1; m < ascensions; m++) {
      if (chain[m] !== target[m]) {
        rest = false;
        break;
      }
    }
    const k = keep[j][col];
    if (rest && (!k || c.days < k.days)) keep[j][col] = c;
  }

  const option = (c: PricedChain | null): MissOption | null =>
    c ? { chain: c.chain, days: c.days, behind: c.days - best.days } : null;

  const rows: MissRow[] = [];
  for (let j = 0; j < checkpoints; j++) {
    rows.push({
      index: j,
      te: target[j],
      last: j === checkpoints - 1,
      cells: offsets.map((offset, col) => {
        const k = option(keep[j][col]);
        const r = option(replan[j][col]);
        return { offset, te: target[j] + offset, keep: k, replan: r, saving: k && r ? k.behind - r.behind : null };
      }),
    });
  }

  return { ascensions, best, priced, offsets, rows };
}

/** Whether a cell is one where re-planning the rest is worth more than a day over keeping the plan. */
export function replanPays(cell: MissCell): boolean {
  return cell.saving != null && cell.saving > REPLAN_WORTH_DAYS;
}

/** `0.39`, `4.7`, `31`: two decimals under a day, one under ten, whole days above. For running text. */
export function daysNumber(days: number): string {
  const abs = Math.abs(days);
  if (abs < 1) return abs.toFixed(2);
  if (abs < 10) return abs.toFixed(1);
  return abs.toFixed(0);
}

/** `4.7–31 days`, or `3.1 days` when the two ends print the same. */
function rangeText(lo: number, hi: number): string {
  const a = daysNumber(lo);
  const b = daysNumber(hi);
  return a === b ? `${a} days` : `${a}–${b} days`;
}

/** Everything the advice needs, pulled out so it can be tested without matching words. */
export interface MissSummary {
  /** Cells priced at an earlier (not last) checkpoint, with both numbers. */
  earlierPriced: number;
  /** The most keeping the plan cost at an earlier checkpoint. */
  earlierKeepMax: number | null;
  /** The most re-planning the rest cost at an earlier checkpoint. */
  earlierReplanMax: number | null;
  /** The least re-planning cost there. */
  earlierReplanMin: number | null;
  /** Earlier cells where re-planning saves more than a day. */
  earlierReplanPays: number;
  /** What a miss at the last checkpoint cost, low and high, over the offsets priced there. */
  lastMin: number | null;
  lastMax: number | null;
  /** Cells not tried anywhere in the table (keep or re-plan missing). */
  notTried: number;
}

export function summariseMisses(table: MissTable): MissSummary {
  const s: MissSummary = {
    earlierPriced: 0,
    earlierKeepMax: null,
    earlierReplanMax: null,
    earlierReplanMin: null,
    earlierReplanPays: 0,
    lastMin: null,
    lastMax: null,
    notTried: 0,
  };
  const max = (a: number | null, b: number) => (a == null || b > a ? b : a);
  const min = (a: number | null, b: number) => (a == null || b < a ? b : a);
  for (const row of table.rows) {
    for (const cell of row.cells) {
      if (!cell.keep || !cell.replan) s.notTried++;
      if (row.last) {
        // Keep and re-plan are one chain here; read whichever is there.
        const v = (cell.replan ?? cell.keep)?.behind;
        if (v != null) {
          s.lastMin = min(s.lastMin, v);
          s.lastMax = max(s.lastMax, v);
        }
        continue;
      }
      if (cell.keep) s.earlierKeepMax = max(s.earlierKeepMax, cell.keep.behind);
      if (cell.replan) {
        s.earlierReplanMax = max(s.earlierReplanMax, cell.replan.behind);
        s.earlierReplanMin = min(s.earlierReplanMin, cell.replan.behind);
      }
      if (cell.keep && cell.replan) s.earlierPriced++;
      if (replanPays(cell)) s.earlierReplanPays++;
    }
  }
  return s;
}

/** Whether any cell has a number at all. A coarse box (every 5th TE, say) can leave none. */
export function hasPricedCell(table: MissTable): boolean {
  return table.rows.some(r => r.cells.some(c => c.keep || c.replan));
}

/**
 * One sentence of advice, driven by what the table shows: whether re-planning after an early miss
 * pays, and whether the last checkpoint is the one to hit exactly. The numbers are the table's.
 * `truncated` is how many plans the page did not read (`parseRunCsv(...).truncated`): a moved plan
 * missing from what was read may be one of them.
 */
export function missAdvice(table: MissTable, truncated = 0): string {
  const s = summariseMisses(table);
  const clauses: string[] = [];
  const reach = table.offsets.length ? Math.max(...table.offsets.map(Math.abs)) : 0;
  const by = reach > 1 ? `1–${reach} TE` : `${reach} TE`;

  if (s.earlierReplanMax != null) {
    if (s.earlierReplanPays > 0 && s.earlierKeepMax != null) {
      clauses.push(
        `if you miss an earlier checkpoint, re-plan the rest from where you land (keeping the old plan costs up to ${daysNumber(s.earlierKeepMax)} days here, re-planning ${rangeText(s.earlierReplanMin ?? 0, s.earlierReplanMax)})`
      );
    } else if (s.earlierReplanMax < REPLAN_WORTH_DAYS && (s.earlierKeepMax ?? 0) < REPLAN_WORTH_DAYS) {
      clauses.push(`missing an earlier checkpoint by ${by} costs under a day here, even on the old plan`);
    } else if (s.earlierKeepMax == null) {
      clauses.push(
        `missing an earlier checkpoint by ${by} costs up to ${daysNumber(s.earlierReplanMax)} days here even after re-planning the rest`
      );
    } else {
      const worst = Math.max(s.earlierReplanMax, s.earlierKeepMax);
      clauses.push(
        `missing an earlier checkpoint by ${by} costs up to ${daysNumber(worst)} days here whether you keep the plan or re-plan`
      );
    }
  }

  if (s.lastMax != null) {
    const cost = rangeText(s.lastMin ?? s.lastMax, s.lastMax);
    if (table.rows.length === 1) {
      clauses.push(
        s.lastMax >= REPLAN_WORTH_DAYS
          ? `hit this plan's one checkpoint exactly: a miss by ${by} costs ${cost}, and there is nothing after it to re-plan`
          : `missing this plan's one checkpoint by ${by} costs under a day`
      );
    } else if (s.lastMax < REPLAN_WORTH_DAYS) {
      clauses.push(`a miss at the last checkpoint costs under a day`);
    } else if (s.earlierReplanMax != null && s.earlierReplanMax >= s.lastMax) {
      // An earlier miss can cost more even re-planned: the last checkpoint is not the special one.
      clauses.push(`a miss at the last checkpoint costs ${cost}, with nothing left to re-plan`);
    } else {
      clauses.push(
        `the last checkpoint is the one to hit exactly: a miss there costs ${cost} and leaves nothing to re-plan`
      );
    }
  }

  if (!clauses.length) {
    return truncated
      ? `None of the plans this page read has a checkpoint moved by ${by}, and it read only the fastest part of the table (the slowest ${truncated.toLocaleString('en-US')} plans were not read), so it cannot say what a miss costs.`
      : `This run never priced a plan with a checkpoint moved by ${by}, so it cannot say what a miss costs: most likely its search stepped over the TEs next to the best plan's checkpoints (a box at every 5th TE, say).`;
  }
  const sentence = clauses.join('; ');
  const tail =
    truncated && s.notTried
      ? ` A cell without a number may be among the ${truncated.toLocaleString('en-US')} slowest plans the page did not read.`
      : '';
  return `${sentence[0].toUpperCase()}${sentence.slice(1)}.${tail}`;
}
