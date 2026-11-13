/**
 * The black box's entries across a reload and a carry-on (13 Nov 2026, Safari: the download held the
 * dead page's last beat and nothing after, so a page that died, reloaded and carried on read as a
 * 4-minute stall): the 'page load' and 'carry on' entries, the box as it is now for the download, and
 * how the second-tab watcher opened the page.
 *
 * WHY A FILE OF ITS OWN, outside src/search: everything under src/search goes into the result code
 * hash (lib/resultCodeHash.ts), and these are diagnostics, not results; written in search/blackBox.ts
 * they threw every player's kept answers away for nothing. Import this ONLY from src/stores and
 * src/composables, never from a hashed file (src/search, src/workers, src/auto, src/engine,
 * src/calculations) nor from any src/lib or src/types file, which the hash follows imports into
 * (lib/blackBoxDiag.hash.spec.ts guards it).
 */
import { navigationType, type Beat, type BoxEnv } from '@/search/blackBox';
import { REOPEN_CONFIRM_MS, REOPEN_GRACE_MS, type RunMark } from '@/search/stepAway';

/** How the watcher tab reopened the run's page (`watcherReopenPath`). */
export type ReopenPath = 'watcher-new-tab' | 'watcher-own-tab';

/** A beat with the diagnostic fields this file and the store's beats add. blackBox.ts `beat` spreads
 *  what it is given, so `lastSaveAt` / `lastSaveRoutes` go through it unchanged. */
export type DiagBeat = Beat & {
  /** The run's last save (its checkpoint) that was written: the time it was taken, ms epoch like `at`
   *  (the save's own `updatedAt`). What a carry-on would start from. Null while the run has none yet;
   *  absent where the run kind does not say (By a date only, for now). A carry-on's own entry gives
   *  the save it carried on from. */
  lastSaveAt?: number | null;
  /** Routes that save held. Null/absent as `lastSaveAt`. */
  lastSaveRoutes?: number | null;
  /** A 'page load' entry: how the page was opened (`navigationType`). */
  load?: string;
  /** A 'page load' entry: ms from the unfinished beat it found to this load. */
  sinceLastBeatMs?: number;
  /** 'page load' / 'carry on': the second-tab watcher opened this page (`watcherReopenPath`), in a new
   *  tab or by turning its own tab into the run's page. */
  reopenedBy?: ReopenPath;
  /** ...and ms from the watcher's reopen to this page's load. */
  sinceReopenMs?: number;
  /** A 'carry on' entry: Stepping away?'s countdown carried it on ('auto'), or the player did ('click'). */
  carryOn?: 'auto' | 'click';
  /** A 'carry on' entry: the workers of the run that stopped, and of the carry-on. */
  workersFrom?: number | null;
  workersTo?: number;
};

// ---- The same record as search/blackBox.ts. That file keeps its read and write private, and this one
// may not be imported from it (the hash, above), so these few lines repeat its own: the key, the
// 40-entry history and the version-1 shape must stay equal to KEY, HISTORY and Box there
// (lib/blackBoxDiag.spec.ts writes with one and reads with the other).
const KEY = 'aap.blackBox';
const HISTORY = 40;
interface Box {
  version: 1;
  env?: BoxEnv;
  open: Beat | null;
  history: Beat[];
}
function read(): Box {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null') as Box | null;
    if (raw && raw.version === 1 && Array.isArray(raw.history)) return raw;
  } catch {
    // unreadable or blocked: start fresh
  }
  return { version: 1, open: null, history: [] };
}
function write(box: Box): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(box));
  } catch {
    // Storage full or blocked: the recorder is a nicety, never a reason to fail a run.
  }
}
// ---- end of the repeated lines

/** A history entry that opens no phase: the page load and the carry-on below. */
function noteEntry(b: Omit<DiagBeat, 'at' | 'hidden'>, now = Date.now()): DiagBeat {
  const box = read();
  const full: DiagBeat = {
    ...b,
    at: now,
    hidden: typeof document !== 'undefined' && document.visibilityState === 'hidden',
  };
  box.history = [...box.history, full].slice(-HISTORY);
  write(box);
  return full;
}

/**
 * This page loaded and found the previous page's unfinished beat: how the page was opened, how long
 * after that beat, and whether the watcher reopened it.
 */
export function notePageLoad(
  found: Pick<Beat, 'at'>,
  extra: { reopenedBy?: ReopenPath; sinceReopenMs?: number } = {},
  now = Date.now()
): DiagBeat {
  return noteEntry(
    {
      phase: 'page load',
      detail: 'found an unfinished beat',
      load: navigationType(),
      sinceLastBeatMs: Math.max(0, now - found.at),
      ...(extra.reopenedBy ? { reopenedBy: extra.reopenedBy } : {}),
      ...(extra.sinceReopenMs !== undefined ? { sinceReopenMs: extra.sinceReopenMs } : {}),
    },
    now
  );
}

/** A stopped run carried on: by the countdown or a click, from what save, on how many workers. */
export function noteCarryOn(x: {
  kind: string;
  carryOn: 'auto' | 'click';
  workersFrom: number | null;
  workersTo: number;
  lastSaveAt: number | null;
  lastSaveRoutes: number | null;
  reopenedBy?: ReopenPath;
  sinceReopenMs?: number;
}): DiagBeat {
  const { kind, ...rest } = x;
  return noteEntry({ phase: 'carry on', detail: kind, ...rest });
}

/** The box as it is now, open beat, history and machine facts: for the download, which used to
 *  carry only the copy read as the page loaded. */
export function readLive(): { open: DiagBeat | null; history: DiagBeat[]; env?: BoxEnv } {
  const box = read();
  return { open: box.open, history: box.history, ...(box.env ? { env: box.env } : {}) };
}

/**
 * Whether the second-tab watcher opened this page, and how (for the black box only). The watcher
 * counts a reopen in the run mark, then opens the run in a new tab; a page that has not said it loaded
 * REOPEN_CONFIRM_MS later, it opens in its own tab instead (watch/local.ts `reopen`). So a load within
 * that time of the last reopen is the new tab, a later one (up to REOPEN_GRACE_MS) the watcher's own.
 * A new tab slower than REOPEN_CONFIRM_MS reads as the watcher's own: by then it has gone there too.
 * Null: no reopen near this load (the player, or the browser's own reload).
 */
export function watcherReopenPath(
  mark: Pick<RunMark, 'reopens'> | null,
  loadedAt: number
): { reopenedBy: ReopenPath; sinceReopenMs: number } | null {
  const before = (mark?.reopens ?? []).filter(t => t <= loadedAt);
  if (!before.length) return null;
  const since = loadedAt - Math.max(...before);
  if (since > REOPEN_GRACE_MS) return null;
  return { reopenedBy: since < REOPEN_CONFIRM_MS ? 'watcher-new-tab' : 'watcher-own-tab', sinceReopenMs: since };
}
