/**
 * Which release notes an open tab has not seen yet: the update banner (components/NewVersionBanner.vue) lists only
 * these, and when there are none it says just "Small update available" with no list (Jordan, 26 Oct 2026).
 *
 * A NOTE'S IDENTITY is its `at` (release.ts `history`, ISO UTC, the go-live time). THE RUNNING BUILD is known by two
 * things baked in at build time (vite.config.ts `define`): its build time (`__BUILD_TIME__`) and the `at` of every
 * note in its own release.ts (`__BUILD_NOTE_ATS__`). A note is newer than the running build when both hold:
 *
 * - its `at` is later than the build time, and
 * - the running build does not already carry it. Needed because `at` is the go-live time, usually set AFTER the build
 *   that ships it was made (Release 5: built in the afternoon, `at` 6:30 pm MDT); by time alone a Release 5 tab
 *   would list Release 5's own note as new.
 *
 * Never an old note: missing or unreadable build info, or a note with no readable `at`, means no list.
 */

/** One release.ts `history` entry, as version.json carries it. */
export interface ReleaseNote {
  at: string;
  note: string;
  level?: 'small' | 'big';
}

/** What the running bundle knows about itself. */
export interface RunningBuild {
  /** `__BUILD_TIME__`, ISO; '' where there is none (dev, tests). */
  builtAt: string;
  /** The `at` of each note in this bundle's own release.ts. */
  noteAts?: readonly string[];
}

/** The most notes the banner lists; the rest are "+N more". */
export const MAX_SHOWN = 5;
/** A note is cut at this many characters (vite.config.ts cuts at the same). */
export const MAX_NOTE = 200;

export interface NewerNotes {
  /** At most MAX_SHOWN, newest first. */
  shown: ReleaseNote[];
  /** How many newer notes did not fit. */
  more: number;
  /** True when any newer note (shown or not) is marked big. */
  anyBig: boolean;
}

const NONE: NewerNotes = { shown: [], more: 0, anyBig: false };

/** The notes in `notes` newer than `running` (see the top of this file). */
export function notesNewerThan(notes: unknown, running: RunningBuild | null | undefined, max = MAX_SHOWN): NewerNotes {
  const builtMs = running && typeof running.builtAt === 'string' ? Date.parse(running.builtAt) : NaN;
  if (!Number.isFinite(builtMs) || !Array.isArray(notes)) return NONE;
  const known = new Set<number>();
  for (const a of running?.noteAts ?? []) {
    const ms = typeof a === 'string' ? Date.parse(a) : NaN;
    if (Number.isFinite(ms)) known.add(ms);
  }
  const newer: { ms: number; n: ReleaseNote }[] = [];
  const seen = new Set<number>();
  for (const h of notes) {
    if (!h || typeof h !== 'object') continue;
    const { at, note, level } = h as { at?: unknown; note?: unknown; level?: unknown };
    if (typeof at !== 'string' || typeof note !== 'string' || !note.trim()) continue;
    const ms = Date.parse(at);
    if (!Number.isFinite(ms) || ms <= builtMs || known.has(ms) || seen.has(ms)) continue;
    seen.add(ms);
    newer.push({ ms, n: { at, note: note.trim().slice(0, MAX_NOTE), level: level === 'big' ? 'big' : 'small' } });
  }
  newer.sort((a, b) => b.ms - a.ms);
  const cap = Math.max(0, Math.floor(max));
  return {
    shown: newer.slice(0, cap).map(x => x.n),
    more: Math.max(0, newer.length - cap),
    anyBig: newer.some(x => x.n.level === 'big'),
  };
}

/** One note as the banner lists it. */
export interface ListedNote {
  /** ISO UTC go-live time (release.ts `at`). */
  at: string;
  note: string;
  /** Newer than this tab's build (the rule at the top of this file): the banner tags it "New". */
  isNew: boolean;
}

export interface ListedNotes {
  /** At most MAX_SHOWN, newest first: the newer ones, then the older ones. */
  shown: ListedNote[];
  /** How many notes did not fit ("+N more"). */
  more: number;
  /** True when any NEWER note (shown or not) is marked big: an old big note does not make the update big. */
  anyBig: boolean;
}

/**
 * Every note in `notes`, newest first, each marked whether it is newer than `running` (UX35-b, 28 Oct 2026: the
 * banner always lists the notes, and tags the ones this tab lacks "New", instead of a bare "Small update
 * available"). Unknown build info lists them all with none tagged: never an old note shown as new.
 */
export function listNotes(notes: unknown, running: RunningBuild | null | undefined, max = MAX_SHOWN): ListedNotes {
  if (!Array.isArray(notes)) return { shown: [], more: 0, anyBig: false };
  const builtMs = running && typeof running.builtAt === 'string' ? Date.parse(running.builtAt) : NaN;
  const known = new Set<number>();
  for (const a of running?.noteAts ?? []) {
    const ms = typeof a === 'string' ? Date.parse(a) : NaN;
    if (Number.isFinite(ms)) known.add(ms);
  }
  const all: { ms: number; n: ListedNote; big: boolean }[] = [];
  const seen = new Set<number>();
  for (const h of notes) {
    if (!h || typeof h !== 'object') continue;
    const { at, note, level } = h as { at?: unknown; note?: unknown; level?: unknown };
    if (typeof at !== 'string' || typeof note !== 'string' || !note.trim()) continue;
    const ms = Date.parse(at);
    if (!Number.isFinite(ms) || seen.has(ms)) continue;
    seen.add(ms);
    const isNew = Number.isFinite(builtMs) && ms > builtMs && !known.has(ms);
    all.push({ ms, n: { at, note: note.trim().slice(0, MAX_NOTE), isNew }, big: level === 'big' });
  }
  all.sort((a, b) => b.ms - a.ms);
  const cap = Math.max(0, Math.floor(max));
  return {
    shown: all.slice(0, cap).map(x => x.n),
    more: Math.max(0, all.length - cap),
    anyBig: all.some(x => x.n.isNew && x.big),
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
