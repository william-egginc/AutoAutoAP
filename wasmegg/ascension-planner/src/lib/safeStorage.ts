/**
 * Safe reads and writes of JSON kept in this browser's storage (red team, 21 Oct 2026, data-inputs #1:
 * one corrupt `ascension_manual_overrides` value threw inside a Pinia `state()` and blanked the whole
 * site on every reload, and the only way out was clearing site data, plan library included).
 *
 * A value that is not JSON, or not the shape the caller expects, falls back to the default. The bad
 * text is copied once to `<key>.bad` (the latest bad copy only), so nothing a player had is lost
 * without a trace, and the key itself is left for the next good write to replace.
 */

/** Where the last unreadable copy of `key` is kept. */
export const badCopyKey = (key: string): string => `${key}.bad`;

/** The storage, or null when the browser refuses access (blocked site data throws on the getter). */
function pick(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'local' ? globalThis.localStorage : globalThis.sessionStorage;
  } catch {
    return null;
  }
}

function keepBadCopy(st: Storage, key: string, raw: string): void {
  try {
    st.setItem(badCopyKey(key), raw);
  } catch {
    // Full or blocked: the fallback still applies.
  }
}

/**
 * The JSON stored under `key`, or `fallback` when nothing is stored, storage is blocked, the text is
 * not JSON, or `valid` says the parsed value is not the expected shape. Never throws.
 */
export function readStoredJson<T>(
  key: string,
  fallback: () => T,
  valid: (v: unknown) => v is T,
  kind: 'local' | 'session' = 'local'
): T {
  const st = pick(kind);
  if (!st) return fallback();
  let raw: string | null;
  try {
    raw = st.getItem(key);
  } catch {
    return fallback();
  }
  if (raw == null) return fallback();
  try {
    const v: unknown = JSON.parse(raw);
    if (valid(v)) return v;
  } catch {
    // Not JSON: a torn write, another tool, or an older shape.
  }
  keepBadCopy(st, key, raw);
  return fallback();
}

/** Stores `value` as JSON under `key`; false when it could not be stored (full or blocked). */
export function writeStoredJson(key: string, value: unknown, kind: 'local' | 'session' = 'local'): boolean {
  const st = pick(kind);
  if (!st) return false;
  try {
    st.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** A plain object (not null, not an array). */
export function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
