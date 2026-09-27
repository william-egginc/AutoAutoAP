/**
 * @module explorer/bestCount
 * @description Which ascension count finishes first, account by account, as one table: a row per
 * account, a column per count, each cell that account's best standing plan at that count as days
 * after its earliest finish.
 *
 * WITHIN ONE ACCOUNT ONLY. Every number in a row is measured from that account's own earliest
 * standing finish (`judgeFinishes`' `bestByAccount`, the same one the runs table names), so a row
 * compares finish DATES of one account's plans, which is THE RULE. Nothing compares down a column:
 * the rows are ordered by TE, Clothed TE or delivery score so a reader can see whether the winning
 * count moves with them, but a cell's days mean nothing next to another account's.
 *
 * A BEST COUNT IS ONLY AS GOOD AS THE SEARCH THAT FOUND IT. Each cell carries how its run searched
 * (`searchGrade`) as its border: a finished box at every TE, every 2nd-3rd TE, every 4th or coarser,
 * or a staged search / unfinished box with nothing bounding what it missed. A dark cell with a dotted
 * border won with a coarse search, which is weaker evidence than it looks. The step against the next
 * count down is weighed the way the count chart's table weighs it (`countSteps`).
 */
import type { CollectorRow } from './collector';
import {
  accountKey,
  bestPerCount,
  countSteps,
  gearOf,
  isProof,
  SAME_FINISH_DAYS,
  searchGrade,
  type CountStep,
  type FinishJudgement,
  type SearchGrade,
} from './analysis';
import { DAY_MS, finishDateText, signedDays } from '@/lib/leaderboardRank';

/** How a cell's border draws the search behind it. */
export type GradeStyle = 'solid' | 'dashed' | 'dotted' | 'hatched';

/**
 * Solid: a finished box at every TE. Dashed: a finished box at every 2nd or 3rd TE (at its widest
 * checkpoint). Dotted: every 4th TE or coarser. Hatched: a staged search, a box it did not finish, or
 * an upload that did not say its box, where nothing bounds what it missed.
 */
export function gradeStyle(grade: SearchGrade): GradeStyle {
  if (grade.kind === 'staged') return 'hatched';
  if (grade.kind === 'every-te' || grade.step <= 1) return 'solid';
  return grade.step <= 3 ? 'dashed' : 'dotted';
}

/** The key under the table, in the order the styles run from strongest to weakest. */
export const GRADE_KEY: readonly { style: GradeStyle; text: string }[] = [
  { style: 'solid', text: 'a finished box at every TE' },
  { style: 'dashed', text: 'a finished box at every 2nd–3rd TE' },
  { style: 'dotted', text: 'a finished box at every 4th TE or coarser' },
  { style: 'hatched', text: 'a staged search or a box it did not finish (nothing bounds what it missed)' },
];

/** How a run searched, in a phrase for the cell's tooltip. */
export function searchWords(grade: SearchGrade): string {
  if (grade.kind === 'every-te') return 'a finished box at every TE';
  if (grade.kind === 'coarse') return `a finished box at ${grade.text}`;
  if (grade.text === 'box not finished') return 'a box it did not finish, so nothing bounds what it missed';
  if (grade.text === 'uploaded, box not given') return 'an uploaded sweep that did not say its box';
  const staged = /^staged \((.*)\)$/.exec(grade.text);
  return staged ? `a staged search (${staged[1]}), with no box to bound what it missed` : grade.text;
}

/**
 * The fill: one hue, dark for the account's earliest finish and paler the further behind, palest at
 * 20 days or more (the blue ramp of the chart standard). `ink` is the text colour that reads on it.
 */
export interface FillBin {
  /** Days behind, upper bound (exclusive); Infinity for the last. */
  below: number;
  label: string;
  color: string;
  ink: string;
}

export const FILL_BINS: readonly FillBin[] = [
  { below: SAME_FINISH_DAYS, label: 'best or same finish', color: '#104281', ink: '#ffffff' },
  { below: 2, label: 'under 2 d', color: '#1c5cab', ink: '#ffffff' },
  { below: 5, label: '2–5 d', color: '#2a78d6', ink: '#ffffff' },
  { below: 10, label: '5–10 d', color: '#6da7ec', ink: '#0f172a' },
  { below: 20, label: '10–20 d', color: '#9ec5f4', ink: '#0f172a' },
  { below: Infinity, label: '20 d or more', color: '#cde2fb', ink: '#334155' },
];

/** A cell that is the account's only standing count: nothing to compare, so no ramp colour. */
export const ONLY_FILL = { color: '#f1f5f9', ink: '#334155' } as const;

/** Index into `FILL_BINS` for a number of days behind. */
export function fillBin(behind: number): number {
  const i = FILL_BINS.findIndex(b => behind < b.below);
  return i < 0 ? FILL_BINS.length - 1 : i;
}

/** One column: a count, or a stretch of three or more counts nobody tried ("9–14"). */
export interface CountColumn {
  key: string;
  label: string;
  /** The counts it covers, ascending: one for a count, several for a gap. */
  counts: number[];
  /** False for a collapsed gap: nobody tried any of its counts. */
  tried: boolean;
}

/** Stretches of untried counts this long or longer share one column. */
export const COLLAPSE_AT = 3;

/**
 * A column per count from the smallest tried to the largest. One or two counts nobody tried keep a
 * column each (empty), so a missing 6 between 5 and 7 is visible; three or more share one.
 */
export function countColumns(tried: Iterable<number>): CountColumn[] {
  const present = new Set([...tried].filter(n => Number.isFinite(n)));
  if (!present.size) return [];
  const lo = Math.min(...present);
  const hi = Math.max(...present);
  const out: CountColumn[] = [];
  for (let c = lo; c <= hi; c++) {
    if (present.has(c)) {
      out.push({ key: String(c), label: String(c), counts: [c], tried: true });
      continue;
    }
    let end = c;
    while (end + 1 <= hi && !present.has(end + 1)) end++;
    const span = end - c + 1;
    if (span >= COLLAPSE_AT) {
      out.push({
        key: `${c}-${end}`,
        label: `${c}–${end}`,
        counts: Array.from({ length: span }, (_, i) => c + i),
        tried: false,
      });
    } else {
      for (let k = c; k <= end; k++) out.push({ key: String(k), label: String(k), counts: [k], tried: false });
    }
    c = end;
  }
  return out;
}

/**
 * What one cell holds. `hidden`: the account did try this count, but only with runs the page's
 * filters leave out of `rows` (under Proofs only, staged searches and unfinished boxes).
 */
export type CellState = 'standing' | 'not-standing' | 'untried' | 'hidden';

export interface BestCountCell {
  column: CountColumn;
  state: CellState;
  /** Runs this account sent at this count, standing or not. */
  runs: number;
  /** Standing only: the run with the earliest standing finish at this count. */
  row?: CollectorRow;
  finish?: number;
  /** Days after the account's earliest standing finish. */
  behind?: number;
  /** This run is the account's earliest standing finish. */
  best?: boolean;
  grade?: SearchGrade;
  style?: GradeStyle;
  /** Against the next count down this account has a standing finish at. */
  step?: CountStep;
  /** Index into `FILL_BINS`, or -1 for no ramp colour (not standing, untried, the only count). */
  bin: number;
  /** What the cell shows: `best`, `same finish`, `+3.2 d`, `only`, `—` or nothing. */
  text: string;
  /** Not-standing only: why, in the Leaderboard's words, one per distinct reason. */
  reasons?: string[];
  /** Hidden only: the account's runs at this count the filters leave out, and whether none is a proof. */
  hiddenRuns?: number;
  noProof?: boolean;
}

export interface BestCountRow {
  key: string;
  label: string;
  /** Colour index (palette.ts `colorAt`). */
  color: number;
  /** From the account's earliest-finish run, or its newest run here when nothing stands. */
  te: number | null;
  clothedTE: number | null;
  /** 0-1 share of the best delivery set. */
  delivery: number | null;
  /** The account's earliest standing finish at this target, from every shown run. */
  anchor: { row: CollectorRow; finish: number } | null;
  /** The earliest finish is one of this table's cells. False under Proofs only when it is not a proof. */
  anchorShown: boolean;
  cells: BestCountCell[];
}

export type BestCountOrder = 'te' | 'cte' | 'delivery';

export interface BestCountTable {
  columns: CountColumn[];
  rows: BestCountRow[];
  /** Per column: the accounts that sent a run at one of its counts. */
  tried: { accounts: number; labels: string[] }[];
}

export interface BestCountOptions {
  labels?: ReadonlyMap<string, string>;
  colors?: ReadonlyMap<string, number>;
  order?: BestCountOrder;
  /**
   * Every run at the target BEFORE Proofs only (the page's `usable` at the target): which counts an
   * account tried at all. Left out, `rows` is taken as everything, and a count tried only by runs
   * the filter hides would read as "not tried".
   */
  tried?: readonly CollectorRow[];
}

/** When a row was sent, as an ISO string that sorts. */
const sentAt = (r: CollectorRow) => r.submittedAt || r.receivedAt || '';

function sortValue(row: BestCountRow, order: BestCountOrder): number | null {
  const v = order === 'te' ? row.te : order === 'cte' ? row.clothedTE : row.delivery;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * The table. `rows` are the runs the page shows at the target (after Proofs only), `judged` the
 * page's `judgeFinishes`. Accounts with no run in `rows` are not listed. Rows run lowest first by
 * the order asked for (an account with no value for it last), then in colour order.
 */
export function bestCountTable(
  rows: readonly CollectorRow[],
  judged: FinishJudgement,
  { labels, colors, order = 'te', tried: triedRows }: BestCountOptions = {}
): BestCountTable {
  const columns = countColumns(rows.map(r => r.ascensions));
  const group = (list: readonly CollectorRow[]) => {
    const out = new Map<string, CollectorRow[]>();
    for (const r of list) {
      const key = accountKey(r);
      const own = out.get(key);
      if (own) own.push(r);
      else out.set(key, [r]);
    }
    return out;
  };
  const byAccount = group(rows);
  const triedBy = triedRows ? group(triedRows) : byAccount;
  const whatIf = (r: CollectorRow) => judged.byId.get(r.id)?.state === 'what-if';
  const bests = bestPerCount([...rows], judged);

  const out: BestCountRow[] = [];
  for (const [key, own] of byAccount) {
    const perCount = bests.get(key) ?? new Map();
    const standing = [...perCount.values()].filter(b => b.standing && b.finish != null);
    const held = judged.bestByAccount.get(key);
    const anchorFinish = held?.finish ?? (standing.length ? Math.min(...standing.map(b => b.finish!)) : null);
    const anchor = held
      ? { row: held.row, finish: held.finish }
      : anchorFinish != null
        ? { row: standing.find(b => b.finish === anchorFinish)!.row, finish: anchorFinish }
        : null;

    const graded = standing.map(b => ({
      ascensions: b.ascensions,
      behind: (b.finish! - anchorFinish!) / DAY_MS,
      search: searchGrade(b.row),
      best: b,
    }));
    const steps = countSteps(graded);
    const only = graded.length === 1;

    const cells: BestCountCell[] = columns.map(column => {
      const runsHere = own.filter(r => column.counts.includes(r.ascensions));
      if (column.counts.length !== 1 || !runsHere.length) {
        const hidden =
          column.counts.length === 1 ? (triedBy.get(key) ?? []).filter(r => r.ascensions === column.counts[0]) : [];
        if (hidden.length) {
          return {
            column,
            state: 'hidden',
            runs: 0,
            bin: -1,
            text: '',
            hiddenRuns: hidden.length,
            noProof: hidden.every(r => !isProof(r)),
          };
        }
        return { column, state: 'untried', runs: 0, bin: -1, text: '' };
      }
      const count = column.counts[0];
      const g = graded.find(p => p.ascensions === count);
      if (!g) {
        const reasons = [
          ...new Set(runsHere.map(r => judged.byId.get(r.id)?.reason || 'no finish date').filter(Boolean)),
        ];
        return { column, state: 'not-standing', runs: runsHere.length, bin: -1, text: '—', reasons };
      }
      const row = g.best.row;
      const j = judged.byId.get(row.id);
      const best = held ? !!j?.best : g.best.finish === anchorFinish;
      const bin = only && g.behind < SAME_FINISH_DAYS ? -1 : fillBin(g.behind);
      const text =
        only && g.behind < SAME_FINISH_DAYS
          ? 'only'
          : best
            ? 'best'
            : g.behind < SAME_FINISH_DAYS
              ? 'same finish'
              : signedDays(g.behind);
      return {
        column,
        state: 'standing',
        runs: runsHere.length,
        row,
        finish: g.best.finish!,
        behind: g.behind,
        best,
        grade: g.search,
        style: gradeStyle(g.search),
        step: steps.find(s => s.to === count),
        bin,
        text,
      };
    });

    // Gear and TE from the run the row is measured from; with nothing standing, the newest run here
    // that is not a what-if (whose TE was typed in, not the account's). With only what-ifs, the gear
    // is still the account's, but its TE and Clothed TE are not known.
    const newest = [...own].sort((a, b) => sentAt(b).localeCompare(sentAt(a)));
    const source = anchor?.row ?? newest.find(r => !whatIf(r));
    const gear = gearOf(source ?? newest[0]);
    out.push({
      key,
      label: labels?.get(key) ?? key,
      color: colors?.get(key) ?? out.length,
      te: source && Number.isFinite(source.currentTE) ? source.currentTE : null,
      clothedTE: source ? gear.clothedTE : null,
      delivery: gear.delivery,
      anchor,
      anchorShown: cells.some(c => c.best),
      cells,
    });
  }

  out.sort((a, b) => {
    const x = sortValue(a, order);
    const y = sortValue(b, order);
    if (x == null || y == null) {
      if (x != null) return -1;
      if (y != null) return 1;
    } else if (x !== y) return x - y;
    return a.color - b.color || a.label.localeCompare(b.label);
  });

  // Tried at all, whatever the filters hide, among the accounts listed.
  const tried = columns.map(column => {
    const keys = [...byAccount.keys()].filter(k =>
      (triedBy.get(k) ?? []).some(r => column.counts.includes(r.ascensions))
    );
    return {
      accounts: keys.length,
      labels: out.filter(r => keys.includes(r.key)).map(r => r.label),
    };
  });

  return { columns, rows: out, tried };
}

const VERDICT_WORDS: Record<CountStep['verdict'], string> = {
  settled: 'settled: bigger than a finer search of the slower count has ever made up',
  direction: 'direction holds: the count that won was searched at least as coarsely at every checkpoint',
  noise: 'within search noise: the gap could be how the two were searched',
};

/** The step against the next count down, in words: `vs 5 ascensions: 6 first by 2.3 d, settled: ...`. */
export function stepWords(step: CountStep): string {
  const days = signedDays(step.gap).replace(/^[+−]/, '');
  const what = step.gap < SAME_FINISH_DAYS ? 'the same finish' : `${step.better} ascensions finish first by ${days}`;
  return `vs ${step.from} ascensions: ${what} · ${VERDICT_WORDS[step.verdict]}`;
}

/** The cell's tooltip (a `title`), several lines. `zone` is the calendar dates are read on. */
export function cellTitle(row: BestCountRow, cell: BestCountCell, zone: string): string {
  const { column } = cell;
  if (!column.tried) {
    return column.counts.length > 1
      ? `Nobody here tried ${column.counts[0]} to ${column.counts[column.counts.length - 1]} ascensions at this target.`
      : `Nobody here tried ${column.counts[0]} ascensions at this target.`;
  }
  const count = column.counts[0];
  if (cell.state === 'hidden') {
    const runs = cell.hiddenRuns === 1 ? 'its one run' : `its ${cell.hiddenRuns} runs`;
    return cell.noProof
      ? `${row.label} has no finished box at ${count} ascensions at this target: ${runs} at this count ${cell.hiddenRuns === 1 ? 'is a staged search or a box it did not finish' : 'are staged searches or boxes they did not finish'}, which Proofs only hides.`
      : `${row.label} tried ${count} ascensions at this target, but the filters above hide ${runs} at this count.`;
  }
  if (cell.state === 'untried') return `${row.label} did not try ${count} ascensions at this target.`;
  if (cell.state === 'not-standing') {
    const runs = cell.runs === 1 ? 'one run' : `${cell.runs} runs`;
    return `${row.label}, ${count} ascensions: ${runs}, none of whose finish still stands (${(cell.reasons ?? []).join('; ')}).`;
  }
  const r = cell.row!;
  const lines = [`${row.label}, ${count} ascensions: ${r.chain.join(' ')} (from ${r.currentTE} TE)`];
  const date = finishDateText(cell.finish!, zone);
  if (cell.best) lines.push(`Finishes ${date}: this account's earliest finish at this target.`);
  else if (cell.behind! < SAME_FINISH_DAYS)
    lines.push(`Finishes ${date}, the same time as this account's earliest finish.`);
  else {
    const anchorDate = row.anchor ? finishDateText(row.anchor.finish, zone) : '';
    lines.push(
      `Finishes ${date}, ${signedDays(cell.behind!).replace(/^[+−]/, '')} after this account's earliest finish (${anchorDate}${row.anchorShown ? '' : ', a run not in this table'}).`
    );
  }
  lines.push(`Searched: ${searchWords(cell.grade!)} · ${(r.chainsPriced ?? 0).toLocaleString('en-US')} plans priced.`);
  if (cell.runs > 1) lines.push(`The earliest standing finish of ${cell.runs} runs at this count.`);
  if (cell.step) lines.push(stepWords(cell.step));
  return lines.join('\n');
}

/** `TE 198 · CTE 214.3 · delivery 87%`, dropping what the run did not record. */
export function gearText(row: Pick<BestCountRow, 'te' | 'clothedTE' | 'delivery'>): string {
  const parts: string[] = [];
  if (row.te != null) parts.push(`TE ${row.te}`);
  if (row.clothedTE != null) parts.push(`CTE ${row.clothedTE.toFixed(1)}`);
  if (row.delivery != null) parts.push(`delivery ${Math.round(row.delivery * 100)}%`);
  return parts.join(' · ');
}
