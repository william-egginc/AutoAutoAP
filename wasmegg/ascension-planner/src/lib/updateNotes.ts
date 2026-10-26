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
