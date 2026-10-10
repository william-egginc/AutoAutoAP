/**
 * @module checkHistory
 * @description The player's own Check exactly results, kept in this browser (IndexedDB, per account),
 * shared or not, so the instant answer panel can show how the answer moves as they check in over days.
 *
 * Local only: nothing here is sent anywhere. Stored under the account's local partition hash (the
 * same per-account key the plan library and saved save use), never the player id itself.
 *
 * Newest first, at most `HISTORY_CAP` per account (the oldest drop off). A check identical to the
 * one just before it (the same `recordSig` the share dedupe uses) is not added twice.
 */
import { loadMetadata, saveMetadata } from '@/lib/storage/db';
import type { InstantRecord } from './instantRecord';

export const HISTORY_CAP = 200;
export const HISTORY_KEY = 'checkHistory';

/** One answer, as the history keeps it: the route, and its finish (and TE, and spare hours by a date). */
export interface HistoryAnswer {
  chain: number[];
  end: number;
  endTE?: number;
  spareHours?: number;
}

export interface CheckEntry {
  /** When the check finished, ms. */
  at: number;
  /** When the save was taken, unix seconds. */
  backupTime?: number;
  /** The TE the route started from. */
  te: number;
  mode: 'fastest' | 'date';
  target?: number;
  deadline?: number;
  instant: HistoryAnswer;
  exact: HistoryAnswer | null;
  firstLeg?: 'continue' | 'fresh';
  shared: boolean;
  /** The record's signature (instantRecord.ts `recordSig`): two checks with the same one are the same. */
  sig: string;
}

const answerOf = (a: { chain: number[]; end: number; endTE?: number; spareHours?: number }): HistoryAnswer => ({
  chain: [...a.chain],
  end: a.end,
  ...(a.endTE !== undefined ? { endTE: a.endTE } : {}),
  ...(a.spareHours !== undefined ? { spareHours: a.spareHours } : {}),
});

/** A history entry from the record a finished check builds (whether or not it is ever sent). */
export function entryFromRecord(rec: InstantRecord, sig: string, at: number, shared = false): CheckEntry {
  return {
    at,
    ...(rec.backupTime !== undefined ? { backupTime: rec.backupTime } : {}),
    te: rec.currentTE,
    mode: rec.mode,
    ...(rec.mode === 'date' ? { deadline: rec.deadline } : { target: rec.target }),
    instant: answerOf(rec.instant),
    exact: rec.exact ? answerOf(rec.exact) : null,
    ...(rec.exact?.firstLeg ? { firstLeg: rec.exact.firstLeg } : {}),
    shared,
    sig,
  };
}

/** Add a check (newest first). The same check as the newest one is not added again (it keeps a share). */
export function addCheck(list: CheckEntry[], entry: CheckEntry, cap = HISTORY_CAP): CheckEntry[] {
  if (list[0] && list[0].sig === entry.sig) {
    return entry.shared && !list[0].shared ? [{ ...list[0], shared: true }, ...list.slice(1)] : list;
  }
  return [entry, ...list].slice(0, Math.max(0, cap));
}

/** Mark the newest entry with this signature as shared. */
export function markShared(list: CheckEntry[], sig: string): CheckEntry[] {
  const i = list.findIndex(e => e.sig === sig);
  if (i < 0 || list[i].shared) return list;
  const out = [...list];
  out[i] = { ...out[i], shared: true };
  return out;
}

/** Which goal an entry is for: checks of the same mode and target (or deadline) are compared. */
export function goalOf(e: CheckEntry): string {
  return e.mode === 'date' ? `date ${e.deadline}` : `target ${e.target}`;
}

export interface HistoryDelta {
  text: string;
  /** True: better than last time (sooner, or more TE); false: worse; null: the same. */
  better: boolean | null;
}

/**
 * The change against the previous check of the same goal (the next older entry): by a date, the TE
 * reached ("+1 TE"); fastest, the finish ("−0.4 d", sooner). The exact result when both have one,
 * otherwise the instant answer's. Null for the first check of a goal.
 */
export function deltaOf(list: CheckEntry[], i: number): HistoryDelta | null {
  const e = list[i];
  if (!e) return null;
  const goal = goalOf(e);
  const prev = list.slice(i + 1).find(p => goalOf(p) === goal);
  if (!prev) return null;
  const pick = (x: CheckEntry) => (e.exact && prev.exact ? x.exact! : x.instant);
  const a = pick(e);
  const b = pick(prev);
  if (e.mode === 'date') {
    if (a.endTE === undefined || b.endTE === undefined) return null;
    const d = Math.round(a.endTE - b.endTE);
    if (d === 0) return { text: 'same', better: null };
    return { text: `${d > 0 ? '+' : '−'}${Math.abs(d)} TE`, better: d > 0 };
  }
  const d = Math.round(((a.end - b.end) / 86400) * 10) / 10;
  if (d === 0) return { text: 'same', better: null };
  return { text: `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} d`, better: d < 0 };
}

function isEntry(x: unknown): x is CheckEntry {
  const e = x as CheckEntry;
  return !!e && typeof e === 'object' && typeof e.at === 'number' && typeof e.sig === 'string' && !!e.instant;
}

/** This account's history, newest first; empty when there is none or storage is blocked. */
export async function loadHistory(partition: string): Promise<CheckEntry[]> {
  if (!partition) return [];
  try {
    const v = await loadMetadata(partition, HISTORY_KEY);
    return Array.isArray(v) ? v.filter(isEntry).slice(0, HISTORY_CAP) : [];
  } catch {
    return [];
  }
}

/** Save this account's history. False when storage is blocked (it then lasts for this visit only). */
export async function saveHistory(partition: string, list: CheckEntry[]): Promise<boolean> {
  if (!partition) return false;
  try {
    await saveMetadata(partition, HISTORY_KEY, list.slice(0, HISTORY_CAP));
    return true;
  } catch {
    return false;
  }
}
