/**
 * My runs' two saved-answer tiles (spec myruns-now v3, section 4): Fastest to 490 and Egg Day, each the best
 * answer already worked out for the loaded save, with when it was calculated, from which save, and How sure
 * (lib/howSure.ts). Nothing is worked out again: every answer comes from something this browser or the board
 * already holds:
 *
 *   snapshot     the instant answer kept after Check exactly (lib/nowPlan.ts `planFromSnapshot`), this save's key
 *   lastChecked  `aap-instant-answer:<key>`: the last exact-checked answer for this save's key
 *   history      Check exactly's history (IndexedDB, per account): any save, with its save time
 *   board        your runs on the board (searches: level, Exhaustive, the save they started from)
 *   saved        By a date answers saved on this device (with the save they were priced from)
 *
 * The headline is the best answer from the LOADED save (a save within SAME_SAVE_SECONDS of it); with none, the
 * newest from any save, flagged `olderSave` ("Older save than the one you loaded"). Pure.
 */
import {
  deadlineAscendMs,
  deadlineSpare,
  finishMs,
  isDeadlineRow,
  madeDeadline,
  sentMs,
  startMs,
  type BoardRow,
} from './leaderboardRank';
import { howSure, type SearchLevel, type Sure } from './howSure';
import type { NowPlan } from './nowPlan';
import type { CheckEntry } from '@/search/checkHistory';

/** Two save times this close are the same save. */
export const SAME_SAVE_SECONDS = 10 * 60;
/** Fastest: a search whose finish is within this of the answer's agrees with it. */
export const AGREE_FINISH_SECONDS = 3600;

export interface TileAnswer {
  chain: number[];
  /** Fastest: when it reaches the target. By a date: when the last stop is reached. Unix seconds. */
  end: number;
  endTE: number;
  /** By a date. */
  spareHours: number | null;
  /** When it was worked out, ms. */
  calculatedAt: number;
  /** The save it was worked out from (unix seconds), null when not known. */
  saveSeconds: number | null;
  /** The TE it started from, when known. */
  fromTE: number | null;
  source: 'snapshot' | 'lastChecked' | 'history' | 'board' | 'saved';
  how: 'instant' | 'check' | 'search';
  level?: SearchLevel | null;
  complete?: boolean;
  exactConfirmsTE?: boolean;
  runnerUpHours?: number | null;
  olderSimulator?: boolean;
  hoursChanged?: boolean;
  /** Its legs (each shift), when the source kept them: By a date's saved answers. */
  legs?: NowPlan['legs'];
}

export interface Tile {
  goal: 'fastest' | 'date';
  answer: TileAnswer | null;
  /** The answer is from an older save than the one loaded. */
  olderSave: boolean;
  sure: Sure | null;
}

/** A By a date answer saved on this device, in the fields read here. */
export interface SavedDateAnswer {
  savedAt: number;
  deadline: number;
  te: number;
  saveSeconds: number | null;
  level?: string;
  simple?: boolean;
  route: { chain: number[]; reachAt: number; spare: number; legs?: NowPlan['legs'] } | null;
}

export interface TileInput {
  goal: 'fastest' | 'date';
  target: number;
  deadline: number | null;
  nowMs: number;
  /** The loaded save. */
  save: { seconds: number; te: number } | null;
  snapshot: NowPlan | null;
  lastChecked: { at: number; chain: number[]; end: number; endTE: number } | null;
  history: readonly CheckEntry[];
  /** Your board rows (null while loading or without the board). */
  board: readonly BoardRow[] | null;
  saved: readonly SavedDateAnswer[];
  /** Whether a board row was priced with other hours or time off than Your setup now (myRunsDashboard `hoursDiffer`). */
  hoursChanged?: (row: BoardRow) => boolean;
  /** Whether a board row was priced by an older simulator (myRunsDashboard `simulatorAge` === 'older'). */
  olderSimulator?: (row: BoardRow) => boolean;
}

const LEVELS: readonly SearchLevel[] = ['light', 'quick', 'normal', 'thorough', 'exhaustive'];
const asLevel = (v: unknown): SearchLevel | null => (LEVELS.includes(v as SearchLevel) ? (v as SearchLevel) : null);

/** A board row's search level: Exhaustive for a space (Fastest) or By a date's 'advanced' mode, else its level. */
export function rowLevel(row: BoardRow): SearchLevel | null {
  if (row.space) return 'exhaustive';
  if ((row as { mode?: unknown }).mode === 'advanced') return 'exhaustive';
  return asLevel(row.level) ?? asLevel(row.effort);
}

/** When a board row's save was taken: its plan start less its save age; null without both. */
export function rowSaveSeconds(row: BoardRow): number | null {
  const s = startMs(row);
  return s != null && typeof row.backupAgeHours === 'number' ? s / 1000 - row.backupAgeHours * 3600 : null;
}

function candidates(i: TileInput): TileAnswer[] {
  const out: TileAnswer[] = [];
  const saveNow = i.save?.seconds ?? null;
  const goalOk = (deadline: number | undefined | null, target: number | undefined) =>
    i.goal === 'date' ? deadline === i.deadline : !deadline && target === i.target;
  // The snapshot and the last checked answer are under this save's own key.
  const s = i.snapshot;
  if (s && s.goal === i.goal)
    out.push({
      chain: s.chain,
      end: s.end,
      endTE: s.endTE,
      spareHours: s.spareHours,
      calculatedAt: s.calculatedAt,
      saveSeconds: s.meta?.backupTime ?? saveNow,
      fromTE: i.save?.te ?? null,
      source: 'snapshot',
      how: s.exact ? 'check' : 'instant',
      exactConfirmsTE: i.goal === 'date' && s.exact ? s.instantTE === s.endTE : undefined,
      runnerUpHours: s.runnerUpHours,
    });
  const c = i.lastChecked;
  if (c && Array.isArray(c.chain) && c.chain.length)
    out.push({
      chain: c.chain,
      end: c.end,
      endTE: c.endTE,
      spareHours: i.goal === 'date' && i.deadline ? (i.deadline - c.end) / 3600 : null,
      calculatedAt: c.at,
      saveSeconds: saveNow,
      fromTE: i.save?.te ?? null,
      source: 'lastChecked',
      how: 'check',
    });
  for (const e of i.history) {
    if (!goalOk(e.deadline, e.target) || (i.goal === 'date' ? e.mode !== 'date' : e.mode !== 'fastest')) continue;
    const a = e.exact ?? e.instant;
    out.push({
      chain: a.chain,
      end: a.end,
      endTE: a.endTE ?? a.chain[a.chain.length - 1],
      spareHours: typeof a.spareHours === 'number' ? a.spareHours : i.goal === 'date' && i.deadline ? (i.deadline - a.end) / 3600 : null,
      calculatedAt: e.at,
      saveSeconds: e.backupTime ?? null,
      fromTE: e.te,
      source: 'history',
      how: e.exact ? 'check' : 'instant',
      exactConfirmsTE: i.goal === 'date' && e.exact ? e.exact.endTE === e.instant.endTE : undefined,
    });
  }
  for (const r of i.board ?? []) {
    if (r.hidden && !r.yours) continue;
    const isDate = isDeadlineRow(r);
    if (i.goal === 'date' ? !isDate || r.deadline !== i.deadline || !madeDeadline(r) : isDate || r.finalTE !== i.target) continue;
    const at = sentMs(r);
    const end = isDate ? (deadlineAscendMs(r) ?? 0) / 1000 : (finishMs(r) ?? 0) / 1000;
    if (!at || !end) continue;
    const level = rowLevel(r);
    out.push({
      chain: [...r.chain],
      end,
      endTE: r.finalTE,
      spareHours: isDate ? deadlineSpare(r) / 3600 : null,
      calculatedAt: at,
      saveSeconds: rowSaveSeconds(r),
      fromTE: r.backupTE ?? r.currentTE ?? null,
      source: 'board',
      how: level === 'light' ? 'check' : 'search',
      level,
      complete: level === 'exhaustive' && !r.provisional && !r.space?.stoppedEarly,
      olderSimulator: i.olderSimulator?.(r) ?? false,
      hoursChanged: i.hoursChanged?.(r) ?? false,
    });
  }
  if (i.goal === 'date')
    for (const a of i.saved) {
      if (a.deadline !== i.deadline || !a.route) continue;
      out.push({
        chain: a.route.chain,
        end: a.route.reachAt,
        endTE: a.route.chain[a.route.chain.length - 1],
        spareHours: a.route.spare / 3600,
        calculatedAt: a.savedAt,
        saveSeconds: a.saveSeconds,
        fromTE: a.te,
        source: 'saved',
        how: 'search',
        level: asLevel(a.level) ?? (a.simple ? 'quick' : 'exhaustive'),
        legs: a.route.legs ?? null,
      });
    }
  return out.filter(a => Array.isArray(a.chain) && a.chain.length && Number.isFinite(a.end));
}

/** Better first: By a date, more TE then more spare; Fastest, sooner. Then the stronger pricing, then newer. */
function better(goal: 'fastest' | 'date') {
  const strength = (a: TileAnswer) => (a.how === 'search' ? 2 : a.how === 'check' ? 1 : 0);
  return (a: TileAnswer, b: TileAnswer) =>
    (goal === 'date' ? b.endTE - a.endTE || (b.spareHours ?? 0) - (a.spareHours ?? 0) : a.end - b.end) ||
    strength(b) - strength(a) ||
    b.calculatedAt - a.calculatedAt;
}

export function buildTile(i: TileInput): Tile {
  const all = candidates(i);
  const saveNow = i.save?.seconds ?? null;
  const sameSave = (a: TileAnswer) =>
    a.source === 'snapshot' ||
    a.source === 'lastChecked' ||
    (saveNow != null && a.saveSeconds != null && Math.abs(a.saveSeconds - saveNow) <= SAME_SAVE_SECONDS);
  const here = all.filter(sameSave);
  // An instant answer (the table only) heads the tile only when nothing of this save was checked or searched:
  // the table can be a TE out either way (the alt, 15 Oct: 248 by the table, 247 by Check exactly).
  const priced = here.filter(a => a.how !== 'instant');
  const pool = priced.length ? priced : here;
  const pick = pool.length ? [...pool].sort(better(i.goal))[0] : [...all].sort((a, b) => b.calculatedAt - a.calculatedAt)[0];
  if (!pick) return { goal: i.goal, answer: null, olderSave: false, sure: null };
  const olderSave = !here.length && pick.saveSeconds != null && saveNow != null && pick.saveSeconds < saveNow - SAME_SAVE_SECONDS;
  // The strongest search of the same save that agrees with the headline.
  const agreeing = here
    .filter(a => a !== pick && a.how === 'search' && a.level)
    .filter(a => (i.goal === 'date' ? a.endTE === pick.endTE : Math.abs(a.end - pick.end) <= AGREE_FINISH_SECONDS))
    .map(a => a.level!)
    .sort((a, b) => LEVELS.indexOf(b) - LEVELS.indexOf(a))[0];
  const ageMs = Math.max(i.nowMs - pick.calculatedAt, pick.saveSeconds ? i.nowMs - pick.saveSeconds * 1000 : 0);
  const sure = howSure({
    goal: i.goal,
    how: pick.how,
    level: pick.level ?? null,
    exhaustiveComplete: pick.complete,
    exactConfirmsTE: pick.exactConfirmsTE,
    agreeing: agreeing ?? null,
    spareHours: pick.spareHours,
    runnerUpHours: pick.runnerUpHours ?? null,
    ageDays: ageMs / 86_400_000,
    olderSimulator: pick.olderSimulator,
    hoursChanged: pick.hoursChanged,
    teMoved: i.save != null && pick.fromTE != null && Math.floor(pick.fromTE) !== Math.floor(i.save.te),
    te: pick.endTE,
  });
  return { goal: i.goal, answer: pick, olderSave, sure };
}

/** "Snapshot" etc. in player words, for the tile's calculated line: "(Check exactly)", "(Exhaustive)". */
export function howWords(a: TileAnswer): string {
  if (a.how === 'instant') return 'instant answer';
  if (a.how === 'check') return a.level === 'light' ? 'Light' : 'Check exactly';
  const w: Record<SearchLevel, string> = { light: 'Light', quick: 'Fast', normal: 'Exact', thorough: 'Very high', exhaustive: 'Exhaustive' };
  return a.level ? w[a.level] : 'a search';
}
