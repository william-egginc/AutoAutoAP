/**
 * The instant answer as it was last shown, kept in this browser so the next visit with the same save,
 * setup and filters shows it at once instead of working every route out again (about 3 s, then the
 * exact check). A new save, setup or filter makes a different key and recomputes as before.
 *
 * Bounded: at most `MAX_SNAPSHOTS` answers (the oldest dropped), each at most `MAX_BYTES`, none older
 * than `MAX_AGE_MS` (a new table is deployed now and then; a day-old answer is recomputed). Storage is
 * localStorage, in try/catch everywhere: it is a convenience, never a reason for the page to fail.
 */
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
    index.push({ key, at: value.at });
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

export function removeSnapshot(key: string | null, st: StorageLike | null = defaultStorage()): void {
  if (!key || !st) return;
  try {
    st.removeItem(SNAP_PREFIX + key);
    st.setItem(INDEX_KEY, JSON.stringify(readIndex(st).filter(e => e.key !== key)));
  } catch {
    // nothing to do
  }
}
