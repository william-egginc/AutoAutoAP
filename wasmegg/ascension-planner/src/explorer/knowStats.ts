/**
 * @module explorer/knowStats
 * @description The numbers on the What we know card that are counted from the loaded board, not
 * written: its header line, the short answer's "5 to 7 ascensions" count and the lowest Clothed TE
 * in finding 7. Everything else on the card is the collector analyst's text, dated on the card.
 */
import { groupByAccount, accountKey, type FinishJudgement } from './analysis';
import type { CollectorRow } from './collector';
import { buildDeadlineBoard } from '@/lib/leaderboardRank';
import { FIRST_STAMP_DAY, simDate } from '@/lib/simLabel';
import { SIM_VERSION } from '@/search/simVersion';
import { plural } from '@/lib/format';
import { eggDayYearOf, nextEggDayYear } from '@/lib/eggDay';

export const SWEET_SPOT = { from: 5, to: 7 } as const;

/** A By a date answer's first stop may be at most this far above the TE the route starts from. */
export const FIRST_STOP_REACH = 70;

/**
 * Whether a By a date answer's route fits its start: the first stop is above the start TE (an
 * ascension has to gain something) and not implausibly far above it (a row claiming TE 135 whose
 * first stop is 197 was priced on a start TE that was not the account's).
 */
export function startFits(r: Pick<CollectorRow, 'chain' | 'currentTE'> & { finalTE?: number }): boolean {
  const first = r.chain?.[0];
  if (typeof first !== 'number' || typeof r.currentTE !== 'number') return false;
  // What it reaches cannot be below its own first stop.
  if (typeof r.finalTE === 'number' && r.finalTE < first) return false;
  return first > r.currentTE && first <= r.currentTE + FIRST_STOP_REACH;
}

export interface ByDateEntry {
  /** The name the board shows. */
  label: string;
  /** The TE the route starts from. */
  from: number;
  /** The TE it reaches by the date. */
  reaches: number;
  ascensions: number;
}

/**
 * Each account's best By a date answer FOR THE NEXT EGG DAY, highest TE first (review IN-6, 15 Nov 2026: the list held other dates,
 * a 9:00 AM Chicago deadline, 19 anonymous lines and one player several times): the Leaderboard's own By a date board
 * (`buildDeadlineBoard`: no flagged rows, none that miss the date, no old-save what-ifs, a player's owner codes joined into one line by
 * `ownerGroups`), after dropping rows whose start does not fit the route (`startFits`), keeping only the group whose deadline IS the next
 * Egg Day, and leaving out the anonymous lines (several are named players' own anonymous sends, so they can be neither told apart nor
 * counted once).
 */
export function byDateEntries(byDateRows: readonly CollectorRow[], now: number): ByDateEntry[] {
  const out: ByDateEntry[] = [];
  const fitting = byDateRows.filter(startFits);
  const year = nextEggDayYear(now);
  for (const group of buildDeadlineBoard(fitting, { now })) {
    if (eggDayYearOf(group.deadline) !== year) continue;
    for (const e of group.entries) {
      out.push({ label: e.label, from: e.best.currentTE, reaches: e.te, ascensions: e.best.chain.length });
    }
  }
  return out.sort((a, b) => b.reaches - a.reaches || a.from - b.from);
}

export interface KnowStats {
  /** Runs to 490 TE. */
  runsTo490: number;
  /** By a date answers (schema 8), at any date. */
  byDate: number;
  /** Accounts with at least one. */
  byDateAccounts: number;
  /** Each account's best answer that passes the board's checks (`byDateEntries`). */
  eggDay: ByDateEntry[];
  /** Accounts with a run to 490. */
  accounts: number;
  /** Starting TE range of the runs to 490, what-ifs left out (their TE was typed in). Null with none. */
  te: { min: number; max: number } | null;
  /** Plans (chains) priced across every run counted once. */
  plans: number;
  /** Accounts whose earliest-finishing plan to 490 has 5 to 7 ascensions, out of the accounts that have one. */
  sweet: { of: number; total: number };
  /** Lowest Clothed TE among the accounts to 490, or null when none recorded one. */
  lowestCte: number | null;
  /** Every run counted by the simulator that priced it: no stamp first, then each stamp, oldest first. */
  measuredOn: MeasuredOn[];
}

export interface MeasuredOn {
  /** "before Oct 13", "lowte-gate" (the stamp without its date), or "this site's simulator". */
  label: string;
  runs: number;
  /** This site's own simulator. */
  current?: boolean;
}

/** The stamp's name without its date: "2026-10-21-egg-beta2" is "egg-beta2". */
const stampName = (stamp: string): string => stamp.replace(/^\d{4}-\d{2}-\d{2}-/, '');

/** Review IN-3 (15 Nov 2026): runs counted by simulator, oldest first. */
export function measuredOn(rows: readonly CollectorRow[], currentStamp: string = SIM_VERSION): MeasuredOn[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = (r as { simVersion?: unknown }).simVersion;
    const stamp = typeof v === 'string' && v.trim() ? v.trim() : '';
    counts.set(stamp, (counts.get(stamp) ?? 0) + 1);
  }
  const out: MeasuredOn[] = [];
  if (counts.has('')) out.push({ label: `before ${FIRST_STAMP_DAY}`, runs: counts.get('')! });
  const stamps = [...counts.keys()].filter(k => k && k !== currentStamp);
  stamps.sort((a, b) => (simDate(a) ?? a).localeCompare(simDate(b) ?? b));
  for (const k of stamps) out.push({ label: stampName(k), runs: counts.get(k)! });
  if (counts.has(currentStamp)) out.push({ label: "this site's simulator", runs: counts.get(currentStamp)!, current: true });
  return out;
}

/** "Measured on: before Oct 13 (189 runs), lowte-gate (31); none yet on this site's simulator." */
export function measuredOnLine(list: readonly MeasuredOn[]): string {
  if (!list.length) return '';
  const parts = list.map((m, i) => `${m.label} (${i === 0 ? plural(m.runs, 'run') : m.runs})`);
  const tail = list.some(m => m.current) ? '.' : "; none yet on this site's simulator.";
  return `Measured on: ${parts.join(', ')}${tail}`;
}

/**
 * `usable` is every run once (the page's own list); `judged490` the Leaderboard's judgement of the
 * runs to 490 (`finishJudgement`), whose per-account best is the earliest-finishing plan; `whatIfs`
 * the ids it calls what-ifs.
 */
export function knowStats(
  usable: readonly CollectorRow[],
  judged490: FinishJudgement,
  whatIfs: ReadonlySet<string>,
  byDateRows: readonly CollectorRow[] = [],
  now: number = Date.now()
): KnowStats {
  const to490 = usable.filter(r => r.finalTE === 490);
  const tes = to490
    .filter(r => !whatIfs.has(r.id))
    .map(r => r.currentTE)
    .filter(t => Number.isFinite(t) && t > 0);

  const ctes: number[] = [];
  for (const account of groupByAccount(to490)) {
    const best = judged490.bestByAccount.get(account.key)?.row;
    const own = [best, ...account.rows].find(r => r && typeof r.clothedTE === 'number' && Number.isFinite(r.clothedTE));
    if (own) ctes.push(own.clothedTE!);
  }

  const bests = [...judged490.bestByAccount.values()];
  return {
    runsTo490: to490.length,
    byDate: byDateRows.length,
    byDateAccounts: new Set(byDateRows.map(r => accountKey(r))).size,
    eggDay: byDateEntries(byDateRows, now),
    accounts: new Set(to490.map(r => accountKey(r))).size,
    te: tes.length ? { min: Math.min(...tes), max: Math.max(...tes) } : null,
    plans: usable.reduce((n, r) => n + (r.chainsPriced || 0), 0),
    sweet: {
      of: bests.filter(b => b.row.ascensions >= SWEET_SPOT.from && b.row.ascensions <= SWEET_SPOT.to).length,
      total: bests.length,
    },
    lowestCte: ctes.length ? Math.min(...ctes) : null,
    measuredOn: measuredOn(usable),
  };
}
