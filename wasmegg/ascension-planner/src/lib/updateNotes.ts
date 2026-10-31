/**
 * Which release notes an open tab has not seen yet: the update banner (components/NewVersionBanner.vue) lists the notes
 * only when at least one is new, and when none is it shows nothing at all unless the tab must reload (R7, 31 Oct 2026).
 *
 * A NOTE'S IDENTITY is its TEXT (30 Oct 2026): `noteKey`, a short hash of the note with its spacing normalized. Until
 * then it was its `at`, and that broke when a note was re-timed after the build: Jordan's egg-beta tab, built before
 * 5 pm on 29 Oct, carried the eight Release 6 notes under placeholder times, they got their real go-live `at` (11 pm
 * UTC) only afterwards, and the tab listed all eight as "New". THE RUNNING BUILD carries the key of every note in its
 * own release.ts (vite.config.ts `define`, `__BUILD_NOTE_KEYS__`), and a note is new exactly when its key is not
 * among them, whatever its time. version.json carries each note's `key` too; one without (written before keys) is
 * keyed from its text here, the same way.
 *
 * Only where the build has no key list (dev, tests, a bundle from before keys) does the old time rule decide: the
 * note's `at` is later than the build time (`__BUILD_TIME__`) and is not one of the build's own `at`s
 * (`__BUILD_NOTE_ATS__`). Never an old note: missing or unreadable build info means nothing is new.
 *
 * A note whose text is edited after the build counts as new (a typo fix shows once as "New"); an explicit `id` per
 * release.ts entry would avoid that, and `key` in version.json is where it would go.
 */

/** One release.ts `history` entry, as version.json carries it. */
export interface ReleaseNote {
  at: string;
  note: string;
  level?: 'small' | 'big';
  /** `noteKey(note)`; absent in a version.json written before keys. */
  key?: string;
}

/** What the running bundle knows about itself. */
export interface RunningBuild {
  /** `__BUILD_TIME__`, ISO; '' where there is none (dev, tests). */
  builtAt: string;
  /** The `at` of each note in this bundle's own release.ts (the time rule, for builds with no keys). */
  noteAts?: readonly string[];
  /** `__BUILD_NOTE_KEYS__`: the key of each note in this bundle's own release.ts; undefined where there is none. */
  noteKeys?: readonly string[];
}

/** The most notes the banner lists; the rest are "+N more". */
export const MAX_SHOWN = 5;
/** A note is cut at this many characters (vite.config.ts cuts at the same, through versionHistory). */
export const MAX_NOTE = 200;
/** How many notes version.json carries. */
export const MAX_HISTORY = 8;

/** A note's text as its identity sees it: Unicode NFC, trimmed, every run of white space one space. */
export function normalizeNote(text: string): string {
  return text.normalize('NFC').trim().replace(/\s+/g, ' ');
}

/**
 * A note's identity: FNV-1a (32-bit, over UTF-16 code units) of its normalized text, cut at MAX_NOTE so the note as
 * version.json carries it keys the same as the whole note; 8 hex digits. Pinned by updateNotes.identity.spec.ts:
 * changing the scheme would tag every note "New" in every open tab once.
 */
export function noteKey(text: string): string {
  const s = normalizeNote(text).slice(0, MAX_NOTE);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** release.ts `history` as version.json carries it (vite.config.ts): the newest MAX_HISTORY, each cut at MAX_NOTE,
 *  with its key. `at`, `note` and `level` are as before keys, for tabs built before them. */
export function versionHistory(
  history: readonly { at: string; note: string; level?: 'small' | 'big' }[]
): { at: string; note: string; key: string; level?: 'big' }[] {
  return history.slice(0, MAX_HISTORY).map(h => ({
    at: h.at,
    note: h.note.slice(0, MAX_NOTE),
    key: noteKey(h.note),
    ...(h.level === 'big' ? { level: 'big' as const } : {}),
  }));
}

/** The keys of every note a build carries (vite.config.ts `__BUILD_NOTE_KEYS__`). */
export function buildNoteKeys(history: readonly { note: string }[]): string[] {
  return history.map(h => noteKey(h.note));
}

export interface NewerNotes {
  /** At most MAX_SHOWN, newest first. */
  shown: ReleaseNote[];
  /** How many newer notes did not fit. */
  more: number;
  /** True when any newer note (shown or not) is marked big. */
  anyBig: boolean;
}

/** One note as the banner lists it. */
export interface ListedNote {
  /** ISO UTC go-live time (release.ts `at`). */
  at: string;
  note: string;
  /** The note's identity (noteKey, or version.json's `key`). */
  key: string;
  /** Not carried by this tab's build (the rule at the top of this file): the banner tags it "New". */
  isNew: boolean;
}

export interface ListedNotes {
  /** At most MAX_SHOWN: the new notes newest first, then the ones this tab already has, newest first. Empty when none
   *  is new. */
  shown: ListedNote[];
  /** How many notes did not fit ("+N more"). */
  more: number;
  /** True when any NEW note (shown or not) is marked big: a note this tab already has never makes the update big. */
  anyBig: boolean;
}

interface Judged {
  ms: number;
  n: ListedNote;
  big: boolean;
}

/** Every readable note in `notes`, once per key, each judged new or not against `running`. */
function judge(notes: unknown, running: RunningBuild | null | undefined): Judged[] {
  if (!Array.isArray(notes)) return [];
  const keys = running && Array.isArray(running.noteKeys) ? new Set(running.noteKeys) : null;
  const builtMs = running && typeof running.builtAt === 'string' ? Date.parse(running.builtAt) : NaN;
  const knownAts = new Set<number>();
  for (const a of running?.noteAts ?? []) {
    const ms = typeof a === 'string' ? Date.parse(a) : NaN;
    if (Number.isFinite(ms)) knownAts.add(ms);
  }
  const out: Judged[] = [];
  const seen = new Set<string>();
  for (const h of notes) {
    if (!h || typeof h !== 'object') continue;
    const { at, note, level, key } = h as { at?: unknown; note?: unknown; level?: unknown; key?: unknown };
    if (typeof at !== 'string' || typeof note !== 'string' || !note.trim()) continue;
    const ms = Date.parse(at);
    if (!Number.isFinite(ms)) continue;
    const k = typeof key === 'string' && key ? key : noteKey(note);
    if (seen.has(k)) continue;
    seen.add(k);
    const isNew = keys ? !keys.has(k) : Number.isFinite(builtMs) && ms > builtMs && !knownAts.has(ms);
    out.push({ ms, n: { at, note: note.trim().slice(0, MAX_NOTE), key: k, isNew }, big: level === 'big' });
  }
  return out;
}

const newestFirst = (a: Judged, b: Judged) => b.ms - a.ms;

/** Only the notes in `notes` this tab does not have (see the top of this file), newest first. */
export function notesNewerThan(notes: unknown, running: RunningBuild | null | undefined, max = MAX_SHOWN): NewerNotes {
  const newer = judge(notes, running)
    .filter(x => x.n.isNew)
    .sort(newestFirst);
  const cap = Math.max(0, Math.floor(max));
  return {
    shown: newer.slice(0, cap).map(x => ({ at: x.n.at, note: x.n.note, level: x.big ? 'big' : 'small' })),
    more: Math.max(0, newer.length - cap),
    anyBig: newer.some(x => x.big),
  };
}

/**
 * The notes for the banner (UX35-b, 28 Oct 2026; identity by text, 30 Oct 2026): when at least one note is new to this
 * tab, the new ones newest first and tagged "New", then the ones it already has, newest first and plain, at most `max`
 * plus "+N more". When none is new, nothing: then there is no banner unless the tab must reload (R7, 31 Oct 2026).
 */
export function listNotes(notes: unknown, running: RunningBuild | null | undefined, max = MAX_SHOWN): ListedNotes {
  const all = judge(notes, running);
  const fresh = all.filter(x => x.n.isNew).sort(newestFirst);
  if (fresh.length === 0) return { shown: [], more: 0, anyBig: false };
  const ordered = [...fresh, ...all.filter(x => !x.n.isNew).sort(newestFirst)];
  const cap = Math.max(0, Math.floor(max));
  return {
    shown: ordered.slice(0, cap).map(x => x.n),
    more: Math.max(0, ordered.length - cap),
    anyBig: fresh.some(x => x.big),
  };
}

/** The player's own time zone, for the dates beside the notes. */
export function localZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** A note's date as players read dates ("Oct 27"), in `zone`; '' when unreadable. Date only: notes are a day apart. */
export function noteDate(at: string, zone: string | undefined = localZone()): string {
  const ms = Date.parse(at);
  if (!Number.isFinite(ms)) return '';
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  try {
    return new Intl.DateTimeFormat('en-US', { ...opts, timeZone: zone }).format(ms);
  } catch {
    return new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' }).format(ms);
  }
}
