/**
 * The instant answer as it was last shown, kept in this browser so the next visit with the same save,
 * setup and filters shows it at once instead of working every route out again (about 3 s, then the
 * exact check). A new save, setup or filter makes a different key and recomputes as before.
 *
 * Bounded: at most `MAX_SNAPSHOTS` answers (the oldest dropped), each at most `MAX_BYTES`, none older
 * than `MAX_AGE_MS` (a new table is deployed now and then; a day-old answer is recomputed). Storage is
 * localStorage, in try/catch everywhere: it is a convenience, never a reason for the page to fail.
 */
import type { Availability } from './availabilitySchedule';
import type { TimeOffDates } from './timeOff';

export const SNAP_PREFIX = 'aap-instant-snap:';
const INDEX_KEY = 'aap-instant-snap-index';
export const MAX_SNAPSHOTS = 10;
export const MAX_BYTES = 600_000;
export const MAX_AGE_MS = 24 * 3600_000;

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

interface IndexEntry {
  key: string;
  at: number;
  /** What the answer is for (new snapshots since 17 Oct 2026): My runs finds an older save's plan by it
   *  without parsing every snapshot. Small: no route, no legs. */
  meta?: SnapMeta;
}

/**
 * A snapshot's own description (17 Oct 2026, the My runs "Right now" page): which account (a hash, never the
 * player id), which goal, which save, and each egg's TE in that save, so a newer save can be compared with the
 * plan made from an older one (lib/nowPlan.ts `onTrack`). Copied into the index entry.
 */
export interface SnapMeta {
  /** search/runSaves.ts `accountOf`: a hash of the account. */
  account: string;
  /** `target 490` or `date <unix seconds>` (the key's own mode words). */
  goal: string;
  /** The save's `lastBackupTime`, unix seconds. */
  backupTime: number;
  /** Each egg's TE in that save, lifetime as the game counts it (max of earned and thresholds passed),
   *  in the save's order (Curiosity, Integrity, Humility, Resilience, Kindness). */
  teByEgg?: number[];
  /** The hours and time off it was priced with (fix 22, 16 Oct 2026; absent before): My runs ranks answers priced
   *  with Your setup now first and names the hours of the others (lib/currentAnswer.ts). */
  setup?: { availability: Availability | null; timeOff: TimeOffDates[] };
}

/** "What if you had maxed gear?" as worked out for this answer (MaxedWhatIf.vue), kept with the snapshot of the
 *  same save: a newer save is a new key, so it never shows against another save. */
export interface SnapWhatIf {
  /** When it was worked out, ms. */
  at: number;
  /** The maxed answer: when it reaches the target (Fastest) or its TE by the date. */
  end: number | null;
  te: number;
  /** The player's own instant answer it was compared with. */
  mineEnd: number | null;
  mineTE: number;
}

function readIndex(st: StorageLike): IndexEntry[] {
  try {
    const v = JSON.parse(st.getItem(INDEX_KEY) ?? '[]') as IndexEntry[];
    return Array.isArray(v) ? v.filter(e => e && typeof e.key === 'string' && typeof e.at === 'number') : [];
  } catch {
    return [];
  }
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The saved answer for `key`, or null (none, unreadable, or too old). Its `at` is when it was saved. */
export function readSnapshot<T extends { at: number }>(
  key: string | null,
  now = Date.now(),
  st: StorageLike | null = defaultStorage()
): T | null {
  if (!key || !st) return null;
  try {
    const v = JSON.parse(st.getItem(SNAP_PREFIX + key) ?? 'null') as T | null;
    if (!v || typeof v.at !== 'number' || now - v.at > MAX_AGE_MS || v.at > now + 3600_000) return null;
    return v;
  } catch {
    return null;
  }
}

/** Keep `value` under `key`, dropping the oldest beyond MAX_SNAPSHOTS. False when it was not kept. */
export function writeSnapshot(
  key: string | null,
  value: { at: number },
  st: StorageLike | null = defaultStorage()
): boolean {
  if (!key || !st) return false;
  try {
    const text = JSON.stringify(value);
    if (text.length > MAX_BYTES) return false;
    const index = readIndex(st).filter(e => e.key !== key);
    const meta = (value as { meta?: SnapMeta }).meta;
    index.push({ key, at: value.at, ...(meta ? { meta } : {}) });
    index.sort((a, b) => a.at - b.at);
    while (index.length > MAX_SNAPSHOTS) {
      const old = index.shift()!;
      st.removeItem(SNAP_PREFIX + old.key);
    }
    try {
      st.setItem(SNAP_PREFIX + key, text);
    } catch {
      // Full: make room by dropping the oldest and try once more.
      const old = index.find(e => e.key !== key);
      if (!old) return false;
      st.removeItem(SNAP_PREFIX + old.key);
      index.splice(index.indexOf(old), 1);
      st.setItem(SNAP_PREFIX + key, text);
    }
    st.setItem(INDEX_KEY, JSON.stringify(index));
    return true;
  } catch {
    return false;
  }
}

/** The index of saved answers (newest last), with each one's `meta` when it has one. Cheap: no snapshot is parsed. */
export function readSnapIndex(st: StorageLike | null = defaultStorage()): IndexEntry[] {
  return st ? readIndex(st) : [];
}

/**
 * Merge `patch` into the snapshot saved under `key` (its `at` and index place kept). False when there is none
 * or it could not be written. For the maxed what-if, worked out after the answer was saved.
 */
export function patchSnapshot(
  key: string | null,
  patch: Record<string, unknown>,
  st: StorageLike | null = defaultStorage()
): boolean {
  if (!key || !st) return false;
  try {
    const v = JSON.parse(st.getItem(SNAP_PREFIX + key) ?? 'null') as Record<string, unknown> | null;
    if (!v || typeof v.at !== 'number') return false;
    const text = JSON.stringify({ ...v, ...patch });
    if (text.length > MAX_BYTES) return false;
    st.setItem(SNAP_PREFIX + key, text);
    return true;
  } catch {
    return false;
  }
}

export function removeSnapshot(key: string | null, st: StorageLike | null = defaultStorage()): void {
  if (!key || !st) return;
  try {
    st.removeItem(SNAP_PREFIX + key);
    st.setItem(INDEX_KEY, JSON.stringify(readIndex(st).filter(e => e.key !== key)));
  } catch {
    // nothing to do
  }
}

/**
 * A saved answer that can still be shown as it was. One that says the player's gear changed (so it
 * used the maxed table instead of their own) and was saved under an older gear rule (tableGear.ts
 * GEAR_RULE) is not: the note may be one the current rule would not give, and the answer under it
 * would then be the maxed table's when the player's own fits. Such an answer is worked out again.
 * One with no gear note stands: every newer rule matches whatever an older one matched.
 */
export function snapshotUsable(
  s: { ownChanged?: string; gearRule?: number; tableUrl?: string } | null,
  gearRule: number
): boolean {
  if (!s) return false;
  // Read from the version 1 maxed table (precompute/table.bin, before it moved to table-v2.bin): worked out again,
  // and never taken for the player's own (InstantRoute `own` is any table but the maxed one's URL).
  if (typeof s.tableUrl === 'string' && /(^|\/)table\.bin(\||$)/.test(s.tableUrl)) return false;
  return !s.ownChanged || (s.gearRule ?? 1) >= gearRule;
}

/**
 * The answer on screen when the panel last closed, in memory for this page load only. A saved answer
 * (`writeSnapshot`) is kept only once everything has finished, and during a search the exact check
 * waits for it to end; so a panel opened again mid-search (another tab of the page, the goal switched
 * and back) had nothing to show and said it waits. This one is shown instead, as the previous answer,
 * for the same key only.
 */
let shown: { key: string; value: unknown } | null = null;
export function rememberShown(key: string | null, value: unknown): void {
  if (key) shown = { key, value };
}
export function recallShown<T>(key: string | null): T | null {
  return key && shown?.key === key ? (shown.value as T) : null;
}

// ------------------------------------------------------------------------------ the key

/** The egg order the key's egg counts are listed in (search/precomputedLeg.ts EGG_ORDER, copied here so this
 *  module stays free of the simulator's imports; instantSnapshot.spec.ts checks they agree). */
export const KEY_EGG_ORDER = ['curiosity', 'kindness', 'integrity', 'resilience', 'humility'] as const;

/** Where the last checked answer is kept (InstantRoute's `CACHE_PREFIX`). */
export const ANSWER_PREFIX = 'aap-instant-answer:';

/** What the instant answer's key is made of (InstantRoute.vue `cacheKey` until 17 Oct 2026, unchanged). */
export interface InstantKeyInput {
  /** The save's player id: hashed into the key only, it never leaves this browser. */
  playerId: string;
  /** By a date's deadline (unix seconds); absent or null for Fastest. */
  deadline?: number | null;
  finalTE: number;
  currentTE: number;
  eggsDelivered: Partial<Record<string, number>> | null | undefined;
  artifacts: unknown;
  stones: unknown;
  epic: unknown;
  availability: unknown;
  timeOff: unknown;
  milestones: unknown;
  firstAscension: string | null | undefined;
  /** "Works inside my hours" in effect. */
  useHours: boolean;
  maxAscensions: number | null;
}

/** The first ascension as the boolean it was (true Continue Asc., false Fastest), so answers saved under those
 *  still match; Prestige Now and the build-up are their own words. */
const keyFirst = (m: string): boolean | 'fresh' | 'buildup' =>
  m === 'fresh' ? 'fresh' : m === 'buildup' ? 'buildup' : m === 'continue';

/** The key's mode words: `date <deadline>` or `target <final TE>` (SnapMeta `goal` too). */
export function instantGoal(deadline: number | null | undefined, finalTE: number): string {
  return deadline ? `date ${deadline}` : `target ${finalTE}`;
}

/**
 * The key a last checked answer is kept under (`aap-instant-answer:<hash>`); the whole answer is kept under the
 * same plus `|0` (`instantSnapKey`). Valid only for the same thing asked of the same account: the player, the
 * mode, the TE and every egg's count, the inventory and epic research, the setup the exact check uses and the
 * filters. The JSON and its key order are exactly InstantRoute's before this moved here: a different hash
 * would lose every answer saved in players' browsers (instantSnapshot.spec.ts holds golden values).
 */
export function instantKey(i: InstantKeyInput): string {
  const sig = (x: number) => Number(x.toPrecision(6));
  const parts = {
    id: i.playerId,
    mode: instantGoal(i.deadline, i.finalTE),
    te: Math.floor(i.currentTE),
    eggs: KEY_EGG_ORDER.map(e => sig(i.eggsDelivered?.[e] || 0)),
    artifacts: i.artifacts,
    stones: i.stones,
    epic: i.epic,
    setup: [i.availability, i.timeOff, i.milestones, keyFirst(i.firstAscension ?? 'auto')],
    filters: [i.useHours, i.maxAscensions],
  };
  // FNV-1a: the key only has to tell setups apart; the id never leaves this browser.
  const text = JSON.stringify(parts);
  let h = 0x811c9dc5;
  for (let k = 0; k < text.length; k++) h = Math.imul(h ^ text.charCodeAt(k), 0x01000193) >>> 0;
  return ANSWER_PREFIX + h.toString(16);
}

/** The whole answer's key for an answer key ("|0": the retired at-once box, off, so older snapshots load). */
export function instantSnapKey(answerKey: string | null): string | null {
  return answerKey ? `${answerKey}|0` : null;
}
