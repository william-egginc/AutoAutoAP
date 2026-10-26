/**
 * THE INSTANT BASELINE (wireframes/price-route-v2 B1 and B2, Jordan 23 Oct 2026): the instant answer is each player's
 * baseline. Every Fast, Exact or Custom run is compared with the instant answer for the same goal, worked out from the
 * same save: "vs your instant baseline: 1.2 days sooner (Fast)", "−1 TE (313 → 312), 0.28 days more spare (Fast)".
 *
 * WHERE A BASELINE COMES FROM
 *   - This browser: every instant answer worked out here is logged, small (`BASELINE_KEY`, at most `MAX_BASELINES`):
 *     the account (a hash, never the player id), the goal in the instant answer's own words (`target 490`,
 *     `date <unix>`), the save's time, the route, its finish and TE. Snapshots (24 h) are read into it too. A run
 *     finds its baseline by account, goal and save time (within `SAME_SAVE_SECONDS`), as the collector keys the
 *     private instant records (owner, mode and target or deadline, backupTime).
 *   - A board row: `row.baseline`, sent with the run only when the player ticked "Share my instant baseline with my
 *     runs" (the `shareBaseline` consent). The private instant record ("Share my search results") is never served,
 *     so the board can only show what a row carries. Absent: nothing is shown.
 *
 * Everything here is pure or takes its storage as an argument.
 */
import type { InjectionKey, Ref } from 'vue';
import type { StorageLike } from '@/search/instantSnapshot';
import type { BoardRow } from './leaderboardRank';
import { gapWords } from './searchPlan';
import { boxRouteOf, readPreferFewer, type PreferMargin } from '@/search/preferFewer';
import type { FoundLevel } from './searchPointer';

export const BASELINE_KEY = 'aap-instant-baselines';
export const MAX_BASELINES = 200;
/** Two save times this close are the same save (lib/currentAnswer.ts SAME_SAVE_SECONDS). */
export const BASELINE_SAVE_SECONDS = 10 * 60;

/** One instant answer, as logged in this browser. */
export interface BaselineEntry {
  /** search/runSaves.ts `accountOf`: a hash. */
  account: string;
  /** `target 490` or `date <unix seconds>`. */
  goal: string;
  /** The save's time, unix seconds. */
  backupTime: number;
  /** When the instant answer was worked out, ms. */
  at: number;
  chain: number[];
  /** Fastest: when the target is reached; By a date: the last stop. Unix seconds. */
  end: number;
  endTE: number;
  /**
   * The instant answer's own best (Fastest the fastest, By a date the highest TE) when the box showed another route
   * (Prefer fewer's pick, 26 Oct 2026): what is SENT with a board row (`rowBaselineOf`), so the collector's baseline
   * keeps its meaning. Absent when the box showed the best (then `chain`/`end`/`endTE` are it).
   */
  sent?: { chain: number[]; end: number; endTE: number };
}

/** What a board row carries when the player shares the baseline (`Submission.baseline`; the collector must keep it). */
export interface RowBaseline {
  chain: number[];
  /** Unix seconds, as `end` above. */
  end: number;
  endTE: number;
  /** When the instant answer was worked out, ms. */
  at?: number;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const valid = (e: BaselineEntry | null | undefined): e is BaselineEntry =>
  !!e &&
  typeof e.account === 'string' &&
  typeof e.goal === 'string' &&
  Number.isFinite(e.backupTime) &&
  Array.isArray(e.chain) &&
  e.chain.length > 0 &&
  Number.isFinite(e.end) &&
  Number.isFinite(e.endTE) &&
  (e.sent === undefined || validSent(e.sent));
const validSent = (x: BaselineEntry['sent']): boolean =>
  !!x && Array.isArray(x.chain) && x.chain.length > 0 && Number.isFinite(x.end) && Number.isFinite(x.endTE);

export function readBaselines(st: StorageLike | null = defaultStorage()): BaselineEntry[] {
  if (!st) return [];
  try {
    const v = JSON.parse(st.getItem(BASELINE_KEY) ?? '[]') as BaselineEntry[];
    return Array.isArray(v) ? v.filter(valid) : [];
  } catch {
    return [];
  }
}

/** Log one (the same account, goal and save replaced by the newer), oldest dropped beyond MAX_BASELINES. */
export function recordBaseline(e: BaselineEntry, st: StorageLike | null = defaultStorage()): boolean {
  if (!st || !valid(e)) return false;
  try {
    const list = readBaselines(st).filter(
      x => !(x.account === e.account && x.goal === e.goal && Math.abs(x.backupTime - e.backupTime) <= BASELINE_SAVE_SECONDS)
    );
    list.push({
      account: e.account,
      goal: e.goal,
      backupTime: e.backupTime,
      at: e.at,
      chain: [...e.chain],
      end: e.end,
      endTE: e.endTE,
      ...(e.sent ? { sent: { chain: [...e.sent.chain], end: e.sent.end, endTE: e.sent.endTE } } : {}),
    });
    list.sort((a, b) => a.at - b.at);
    while (list.length > MAX_BASELINES) list.shift();
    st.setItem(BASELINE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** The instant answer for a run: the same account and goal, the same save (newest when several). */
export function findBaseline(
  list: readonly BaselineEntry[],
  run: { account: string | null; goal: string; backupTime: number | null }
): BaselineEntry | null {
  if (!run.account || run.backupTime == null) return null;
  let best: BaselineEntry | null = null;
  for (const e of list)
    if (e.account === run.account && e.goal === run.goal && Math.abs(e.backupTime - run.backupTime) <= BASELINE_SAVE_SECONDS)
      if (!best || e.at > best.at) best = e;
  return best;
}

type SnapRow = { chain: number[]; end: number; legs?: { endTE?: number; to?: number }[] };

/**
 * A snapshot's instant answer as a baseline (InstantRoute's snapshot, search/instantSnapshot.ts): the route its green
 * box shows (Jordan, 26 Oct 2026): Fastest its `best`, By a date its `byDate`, or Prefer fewer's pick among the rows
 * per count under `margin` (by default the one stored for the screen), shown on screen. When that is not the best,
 * the best goes along as `sent`, for a board row (the collector's baseline keeps its meaning). Null without its
 * `meta` or a route.
 */
export function baselineOfSnapshot(
  s: {
    at: number;
    meta?: { account: string; goal: string; backupTime: number } | null;
    result?: {
      best?: SnapRow | null;
      byDate?: SnapRow | null;
      byAscensions?: (SnapRow | null)[] | null;
      byDateByAscensions?: (SnapRow | null)[] | null;
    } | null;
  },
  margin?: PreferMargin
): BaselineEntry | null {
  const m = s.meta;
  if (!m || !s.result) return null;
  const date = /^date \d+$/.test(m.goal);
  const goal = date ? 'date' : 'fastest';
  const best = date ? s.result.byDate : s.result.best;
  const r = date
    ? boxRouteOf(goal, best, s.result.byDateByAscensions, margin ?? readPreferFewer()[goal], Number(m.goal.slice(5)))
    : boxRouteOf(goal, best, s.result.byAscensions, margin ?? readPreferFewer()[goal]);
  if (!r || !Array.isArray(r.chain) || !r.chain.length) return null;
  const teOf = (x: SnapRow) => {
    const last = x.legs?.[x.legs.length - 1];
    return last?.endTE ?? last?.to ?? x.chain[x.chain.length - 1];
  };
  const sent = best && r !== best ? { chain: [...best.chain], end: best.end, endTE: teOf(best) } : null;
  const e: BaselineEntry = {
    account: m.account,
    goal: m.goal,
    backupTime: m.backupTime,
    at: s.at,
    chain: [...r.chain],
    end: r.end,
    endTE: teOf(r),
    ...(sent && validSent(sent) ? { sent } : {}),
  };
  return valid(e) ? e : null;
}

/**
 * For a board row (`Submission.baseline`): always the instant answer's best (`sent` when the box showed Prefer
 * fewer's pick), never the pick, so what the collector keeps means what it meant before 26 Oct 2026.
 */
export function rowBaselineOf(e: BaselineEntry): RowBaseline {
  const b = e.sent ?? e;
  return { chain: [...b.chain], end: Math.round(b.end), endTE: Math.floor(b.endTE), at: e.at };
}

/** A board row's own baseline, when it carries a readable one. */
export function readRowBaseline(v: unknown): RowBaseline | null {
  const b = v as RowBaseline | null;
  if (!b || typeof b !== 'object' || !Array.isArray(b.chain) || !b.chain.length) return null;
  if (!Number.isFinite(b.end) || !Number.isFinite(b.endTE)) return null;
  return b;
}

// --------------------------------------------------------------------------------------- the words

/** A run against its baseline. */
export interface RunVsBaseline {
  goal: 'fastest' | 'date';
  /** By a date's deadline (for the spare). */
  deadline?: number | null;
  /** The run: when it finishes (Fastest) or reaches its last stop (By a date), unix seconds, and its TE. */
  end: number;
  endTE: number;
}

export type BaselineTone = 'better' | 'worse' | 'same';

/** "1.2 days sooner" / "22 min later" / "same finish"; By a date "−1 TE (313 → 312), 0.28 days more spare",
 *  "+1 TE (246 → 247)", "same TE, 40 min more spare". */
export function baselineDiff(run: RunVsBaseline, base: Pick<RowBaseline, 'end' | 'endTE'>): { words: string; tone: BaselineTone } {
  if (run.goal === 'fastest') {
    const gap = base.end - run.end;
    if (Math.abs(gap) < 60) return { words: 'same finish', tone: 'same' };
    return gap > 0 ? { words: `${gapWords(gap)} sooner`, tone: 'better' } : { words: `${gapWords(-gap)} later`, tone: 'worse' };
  }
  const te = Math.floor(run.endTE) - Math.floor(base.endTE);
  const head = te === 0 ? 'same TE' : `${te > 0 ? '+' : '−'}${Math.abs(te)} TE (${Math.floor(base.endTE)} → ${Math.floor(run.endTE)})`;
  // More spare: the run's last stop comes sooner than the baseline's (the same deadline).
  const spare = base.end - run.end;
  const spareWords = Math.abs(spare) < 60 ? '' : `, ${spareGap(Math.abs(spare))} ${spare > 0 ? 'more' : 'less'} spare`;
  const tone: BaselineTone = te > 0 ? 'better' : te < 0 ? 'worse' : spare >= 60 ? 'better' : spare <= -60 ? 'worse' : 'same';
  // Wireframe B1: a TE change alone says only the TE when the spare didn't move.
  return { words: te !== 0 && !spareWords ? head : `${head}${spareWords}`, tone };
}

/** "40 min", "0.28 days" (as the instant card's "1.46 days to spare"). */
function spareGap(seconds: number): string {
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min`;
  return `${(seconds / 86400).toFixed(2)} days`;
}

/** "vs your instant baseline: 1.2 days sooner (Fast)"; "their" for another player's run. */
export function baselineLine(
  run: RunVsBaseline,
  base: Pick<RowBaseline, 'end' | 'endTE'>,
  level: FoundLevel | null,
  whose: 'your' | 'their' = 'your'
): { lead: string; words: string; tail: string; tone: BaselineTone } {
  const d = baselineDiff(run, base);
  return { lead: `vs ${whose} instant answer:`, words: d.words, tail: level ? `(${level})` : '', tone: d.tone };
}

// ------------------------------------------------------------------------------------- board rows

/** A board row's level as the search panel names it: quick Fast; normal or thorough Exact; exhaustive (or a space,
 *  or By a date's advanced mode) Custom. Null for rows that say nothing (or Light, which is gone). */
export function rowFoundLevel(row: { level?: string; effort?: string; space?: unknown; mode?: string; deadline?: number }): FoundLevel | null {
  if (row.space || row.level === 'exhaustive' || (row.deadline && row.mode === 'advanced')) return 'Custom';
  const l = row.level ?? row.effort;
  if (l === 'quick') return 'Fast';
  if (l === 'normal' || l === 'thorough' || l === 'balanced') return 'Exact';
  return null;
}

/** The instant answer's words for a row's goal (`target 490`, `date <unix>`). */
export function rowGoalWords(row: { finalTE: number; deadline?: number }): string {
  return row.deadline ? `date ${row.deadline}` : `target ${row.finalTE}`;
}

const isoSeconds = (iso: string | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t / 1000 : null;
};

/** When a row's save was taken: its plan start less `backupAgeHours` (rounded to 0.1 h when sent). */
export function rowBackupTime(row: { startUtc?: string; backupAgeHours?: number }): number | null {
  const start = isoSeconds(row.startUtc);
  return start != null && typeof row.backupAgeHours === 'number' ? start - row.backupAgeHours * 3600 : null;
}

/** A row as a run against a baseline: its finish (or last stop) and TE. Null when its end isn't known. */
export function rowRun(row: { chain: number[]; finalTE: number; deadline?: number; endUtc?: string }): RunVsBaseline | null {
  const end = isoSeconds(row.endUtc);
  if (end == null) return null;
  return row.deadline
    ? { goal: 'date', deadline: row.deadline, end, endTE: row.chain[row.chain.length - 1] ?? 0 }
    : { goal: 'fastest', end, endTE: row.finalTE };
}

/** The board rows a page holds (LeaderboardPanel provides them), for a run's comparison list. */
export const BOARD_ROWS: InjectionKey<Ref<readonly BoardRow[]>> = Symbol('boardRows');

/** One line of the comparison list (B2): the baseline, then Fast, Exact and Custom ("not run" when absent). */
export interface CompareLine {
  label: 'Instant answer' | FoundLevel;
  /** This run's own line. */
  thisRun: boolean;
  /** Unix seconds; null: not run. */
  end: number | null;
  endTE: number | null;
  /** The difference against the baseline ('' for the baseline itself or not run). */
  diff: string;
  tone: BaselineTone | null;
  /** When it was found or sent, ms. */
  at: number | null;
}

/**
 * B2's list for a run: the baseline, then the best Fast, Exact and Custom rows of the same player (`acct`), goal and
 * baseline (the same instant answer: same route and finish), this run standing for its own level. `rows`: what the
 * board page already holds.
 */
export function compareLines<R extends { id?: string; acct?: string; chain: number[]; finalTE: number; deadline?: number; endUtc?: string; submittedAt?: string; baseline?: unknown; level?: string; effort?: string; space?: unknown; mode?: string }>(
  row: R,
  rows: readonly R[]
): CompareLine[] {
  const base = readRowBaseline(row.baseline);
  const run = rowRun(row);
  if (!base || !run) return [];
  const sameBase = (r: R) => {
    const b = readRowBaseline(r.baseline);
    return !!b && b.end === base.end && b.endTE === base.endTE && b.chain.join(',') === base.chain.join(',');
  };
  const goal = rowGoalWords(row);
  const mine = (r: R) => r === row || (!!row.acct && r.acct === row.acct && rowGoalWords(r) === goal && sameBase(r));
  const better = (a: RunVsBaseline, b: RunVsBaseline) => (a.goal === 'date' ? a.endTE - b.endTE || b.end - a.end : b.end - a.end);
  const out: CompareLine[] = [
    { label: 'Instant answer', thisRun: false, end: base.end, endTE: base.endTE, diff: '', tone: null, at: base.at ?? null },
  ];
  const thisLevel = rowFoundLevel(row);
  for (const level of ['Fast', 'Exact', 'Custom'] as const) {
    let pick: { r: R; run: RunVsBaseline } | null = null;
    if (thisLevel === level) pick = { r: row, run };
    else
      for (const r of rows) {
        if (!mine(r) || rowFoundLevel(r) !== level) continue;
        const rr = rowRun(r);
        if (rr && (!pick || better(rr, pick.run) > 0)) pick = { r, run: rr };
      }
    if (!pick) {
      out.push({ label: level, thisRun: false, end: null, endTE: null, diff: '', tone: null, at: null });
      continue;
    }
    const d = baselineDiff(pick.run, base);
    const sent = isoSeconds(pick.r.submittedAt);
    out.push({
      label: level,
      thisRun: pick.r === row,
      end: pick.run.end,
      endTE: pick.run.endTE,
      diff: d.words,
      tone: d.tone,
      at: sent != null ? sent * 1000 : null,
    });
  }
  return out;
}
